import { z } from "zod";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { PRODUCT_TYPE_GUIDE, RateLimitError, type Classifier, type ProductToClassify } from "#/services/classifier.ts";

const SYSTEM = [
  "You sort Israeli supermarket products into product types. Names are in Hebrew and often cut off after about 20 characters.",
  'Reply with JSON only: {"types":[{"i":<the product\'s i>,"type":"<id>"}]}, one entry per product.',
  "Use only these ids:",
  ...PRODUCT_TYPES.map((id) => `- ${id}: ${PRODUCT_TYPE_GUIDE[id]}`),
].join("\n");

const reply = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) });
const answer = z.object({ types: z.array(z.object({ i: z.number().int(), type: z.string() })) });
const productType = z.enum(PRODUCT_TYPES);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Any OpenAI-compatible Chat Completions API (OpenAI, Anthropic, Google, OpenRouter, a local server) through plain fetch.
 * Requests go at least 3 s apart (OpenRouter's free models allow 20 a minute). A 429 waits Retry-After (60 s without
 * one) and retries once; a second 429 throws a RateLimitError.
 */
export function openaiClassifier({ baseUrl, apiKey, model }: { baseUrl: string; apiKey: string; model: string }): Classifier {
  let last = 0;
  const send = async (body: string) => {
    const gap = last + 3000 - Date.now();
    if (gap > 0) await wait(gap);
    last = Date.now();
    return fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(120_000), // a hung provider must not hold the Price sync
    });
  };
  return {
    async classify(products: ProductToClassify[]) {
      const body = JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(products.map((p, i) => ({ i, ...p }))) },
        ],
      });
      let res = await send(body);
      if (res.status === 429) {
        // shortcut: an HTTP-date Retry-After counts as absent; OpenRouter sends seconds.
        const seconds = Number(res.headers.get("retry-after") || NaN);
        await wait((Number.isFinite(seconds) ? seconds : 60) * 1000);
        res = await send(body);
        if (res.status === 429) throw new RateLimitError("llm: HTTP 429");
      }
      if (!res.ok) throw new Error(`llm: HTTP ${res.status}`);
      // Some models wrap the JSON in a ```json fence even when asked for JSON only.
      const content = reply.parse(await res.json()).choices[0]!.message.content.replace(/^\s*```(?:json)?|```\s*$/g, "");
      const byIndex = new Map(answer.parse(JSON.parse(content)).types.map((t) => [t.i, productType.safeParse(t.type).data ?? null]));
      return products.map((_, i) => byIndex.get(i) ?? null);
    },
  };
}
