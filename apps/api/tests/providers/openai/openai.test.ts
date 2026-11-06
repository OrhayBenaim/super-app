// The OpenAI-compatible classifier against recorded Chat Completions replies (no network).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { openaiClassifier } from "#/providers/openai/openai.ts";
import { RateLimitError, type ProductToClassify } from "#/services/classifier.ts";

const reply = (f: string) => readFileSync(fileURLToPath(new URL(`../../__fixtures__/openai/${f}`, import.meta.url)), "utf8");
const PRODUCTS: ProductToClassify[] = [
  { name: "חלב תנובה 3%", manufacturer: "תנובה", size: "1 l", soldBy: "unit" },
  { name: "עגבניה", manufacturer: null, size: "1 kg", soldBy: "weight" },
  { name: "סבון ידיים", manufacturer: "סנו", size: null, soldBy: "unit" },
];
// A new one per test: each paces its own requests.
let classifier: ReturnType<typeof openaiClassifier>;
beforeEach(() => {
  classifier = openaiClassifier({ baseUrl: "https://llm.example/v1/", apiKey: "sk-test", model: "small-model" });
});
const serve = (file: string, status = 200) => {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(reply(file), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Answers each request with the next status in turn (200 = the good reply); records when each request was sent. */
const sequence = (...replies: { status: number; retryAfter?: string }[]) => {
  const sent: number[] = [];
  const fetch = vi.fn(async () => {
    sent.push(Date.now());
    const { status, retryAfter } = replies.shift() ?? { status: 200 };
    return new Response(status === 200 ? reply("good.json") : "{}", { status, headers: retryAfter ? { "retry-after": retryAfter } : {} });
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, sent };
};

describe("openaiClassifier", () => {
  it("posts the Products to <base>/chat/completions with the key and model, and reads one type per Product", async () => {
    const fetch = serve("good.json");
    expect(await classifier.classify(PRODUCTS)).toEqual(["dairy-eggs", "produce", "other"]);

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-test");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "small-model", response_format: { type: "json_object" } });
    for (const id of PRODUCT_TYPES) expect(body.messages[0].content).toContain(id);
    expect(JSON.parse(body.messages[1].content)[1]).toEqual({ i: 1, ...PRODUCTS[1] });
  });

  it("an id outside the fixed list, or a Product with no answer, is null; a ```json fence is fine", async () => {
    serve("outside-list.json");
    expect(await classifier.classify(PRODUCTS)).toEqual(["dairy-eggs", null, null]);
  });

  it("malformed JSON fails the request", async () => {
    serve("malformed.json");
    await expect(classifier.classify(PRODUCTS)).rejects.toThrow(SyntaxError);
  });

  it("an HTTP error fails the request", async () => {
    serve("http-error.json", 401);
    await expect(classifier.classify(PRODUCTS)).rejects.toThrow("llm: HTTP 401");
  });

  it("sends requests at least 3 s apart", async () => {
    vi.useFakeTimers();
    const { sent } = sequence();
    await classifier.classify(PRODUCTS);
    const second = classifier.classify(PRODUCTS);
    await vi.advanceTimersByTimeAsync(2999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(sent[1]! - sent[0]!).toBe(3000);
  });

  it("a 429 waits as long as Retry-After says and retries once", async () => {
    vi.useFakeTimers();
    const { sent } = sequence({ status: 429, retryAfter: "7" });
    const answer = classifier.classify(PRODUCTS);
    await vi.advanceTimersByTimeAsync(6999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await answer).toEqual(["dairy-eggs", "produce", "other"]);
    expect(sent[1]! - sent[0]!).toBe(7000);
  });

  it("a 429 without Retry-After waits 60 s", async () => {
    vi.useFakeTimers();
    const { sent } = sequence({ status: 429 });
    const answer = classifier.classify(PRODUCTS);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await answer).toEqual(["dairy-eggs", "produce", "other"]);
  });

  it("two 429s in a row throw a rate-limit error; other HTTP errors are not retried", async () => {
    vi.useFakeTimers();
    const { fetch } = sequence({ status: 429 }, { status: 429 }, { status: 503 });
    const limited = expect(classifier.classify(PRODUCTS)).rejects.toThrow(RateLimitError);
    await vi.advanceTimersByTimeAsync(60_000);
    await limited;
    expect(fetch).toHaveBeenCalledTimes(2);

    const failed = expect(classifier.classify(PRODUCTS)).rejects.toThrow("llm: HTTP 503");
    await vi.advanceTimersByTimeAsync(3000);
    await failed;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
