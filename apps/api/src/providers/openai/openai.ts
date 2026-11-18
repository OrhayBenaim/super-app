import { z } from "zod";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { PRODUCT_TYPE_GUIDE, RateLimitError, type Classified, type Classifier, type ProductToClassify } from "#/services/classifier.ts";

const SYSTEM = [
  "You sort Israeli supermarket products into product types and write their names out in full. Names are in Hebrew, often cut off after about 20 characters and full of Chain abbreviations.",
  'Reply with JSON only: {"products":[{"i":<the product\'s i>,"type":"<id>","name":"<the full name>"}]}, one entry per product.',
  "A product that has a type already keeps it: answer that type.",
  "Answer other only when no listed type fits: household goods, food of any kind and personal care always have a type.",
  "Write each name out in full: expand Chain abbreviations into full words (גב. -> גבינה), finish a cut-off word only when you are sure of it, and fix spacing.",
  "Keep the brand, the size text, every number and the word order exactly as given. Never add, drop or change a number.",
  "Use only these ids:",
  ...PRODUCT_TYPES.map((id) => `- ${id}: ${PRODUCT_TYPE_GUIDE[id]}`),
].join("\n");

const reply = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) });
const answer = z.object({ products: z.array(z.object({ i: z.number().int(), type: z.string(), name: z.string().optional() })) });
const productType = z.enum(PRODUCT_TYPES);

/** Resolves after `ms`, or rejects at once when `signal` aborts. */
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(() => (signal?.removeEventListener("abort", stop), resolve()), ms);
    const stop = () => (clearTimeout(timer), reject(signal!.reason));
    signal?.addEventListener("abort", stop, { once: true });
  });
const PACE_MS = 3000; // OpenRouter's free models allow 20 requests a minute
const MAX_RETRY_AFTER_S = 120; // longer is a quota reset (daily), which must not hold the Price sync for hours

/**
 * Any OpenAI-compatible Chat Completions API (OpenAI, Anthropic, Google, OpenRouter, a local server) through plain fetch.
 * Requests go at least 3 s apart (OpenRouter's free models allow 20 a minute). A 429 waits Retry-After (60 s without
 * one) and retries once; a second 429, or a Retry-After over 120 s, throws a RateLimitError.
 */
export function openaiClassifier({ baseUrl, apiKey, model }: { baseUrl: string; apiKey: string; model: string }): Classifier {
  let last = 0;
  const send = async (body: string, signal?: AbortSignal) => {
    const gap = last + PACE_MS - Date.now();
    if (gap > 0) await wait(gap, signal);
    last = Date.now();
    const timeout = AbortSignal.timeout(120_000); // a hung provider must not hold the Price sync
    return fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  };
  return {
    async classify(products: ProductToClassify[], signal?: AbortSignal) {
      const body = JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(products.map((p, i) => ({ i, ...p }))) },
        ],
      });
      let res = await send(body, signal);
      if (res.status === 429) {
        // shortcut: an HTTP-date Retry-After counts as absent (OpenRouter sends seconds), parse dates when a provider sends them.
        const seconds = Number(res.headers.get("retry-after") || NaN);
        if (seconds > MAX_RETRY_AFTER_S) throw new RateLimitError(`llm: HTTP 429, retry after ${seconds} s`);
        await wait((Number.isFinite(seconds) ? seconds : 60) * 1000, signal);
        res = await send(body, signal);
        if (res.status === 429) throw new RateLimitError("llm: HTTP 429");
      }
      if (!res.ok) throw new Error(`llm: HTTP ${res.status}`);
      // Some models wrap the JSON in a ```json fence even when asked for JSON only.
      const content = reply.parse(await res.json()).choices[0]!.message.content.replace(/^\s*```(?:json)?|```\s*$/g, "");
      const byIndex = new Map(answer.parse(JSON.parse(content)).products.map((t) => [t.i, t]));
      return products.map((_, i): Classified => {
        const a = byIndex.get(i);
        return { type: productType.safeParse(a?.type).data ?? null, name: a?.name?.trim() || null };
      });
    },
  };
}
