// The OpenAI-compatible classifier against recorded Chat Completions replies (no network).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_TYPES } from "@grocer/shared/product-types";
import { openaiClassifier } from "#/providers/openai/openai.ts";
import type { ProductToClassify } from "#/services/classifier.ts";

const reply = (f: string) => readFileSync(fileURLToPath(new URL(`../../__fixtures__/openai/${f}`, import.meta.url)), "utf8");
const PRODUCTS: ProductToClassify[] = [
  { name: "חלב תנובה 3%", manufacturer: "תנובה", size: "1 l", soldBy: "unit" },
  { name: "עגבניה", manufacturer: null, size: "1 kg", soldBy: "weight" },
  { name: "סבון ידיים", manufacturer: "סנו", size: null, soldBy: "unit" },
];
const classifier = openaiClassifier({ baseUrl: "https://llm.example/v1/", apiKey: "sk-test", model: "small-model" });
const serve = (file: string, status = 200) => {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(reply(file), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

afterEach(() => vi.unstubAllGlobals());

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
});
