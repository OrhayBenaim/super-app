import { describe, expect, it } from "vitest";
import { button, chips, field, select } from "#/pages/ui.ts";

const text = async (h: unknown) => String(await h);

describe("shared page parts", () => {
  it("an input with an error is marked invalid and shows its message under it", async () => {
    const html = await text(field({ label: "Latitude", name: "lat", value: "91", error: "Between -90 and 90" }));
    expect(html).toContain('<input type="text" name="lat" value="91" aria-invalid="true" aria-describedby="lat-error" />');
    expect(html).toContain('<span class="message" id="lat-error">Between -90 and 90</span>');
    expect(await text(field({ label: "City", name: "city" }))).not.toContain("aria-invalid");
  });

  it("filter chips mark the selected one and show each count", async () => {
    const html = await text(chips("Product type", [{ text: "Dairy", count: 1204, href: "/products?type=dairy", selected: true }, { text: "Bread", count: 3, href: "/products?type=bread" }]));
    expect(html).toContain('<a class="chip" href="/products?type=dairy" aria-current="true">Dairy <span class="count">1,204</span></a>');
    expect(html).toContain('<a class="chip" href="/products?type=bread">Bread <span class="count">3</span></a>');
  });

  it("a select keeps its value; a disabled button says why", async () => {
    const html = await text(select({ label: "Chain", name: "chain", value: "b", options: [{ value: "a", text: "A" }, { value: "b", text: "B" }] }));
    expect(html).toContain('<option value="b" selected>B</option>');
    expect(html).toContain('<option value="a">A</option>');
    expect(await text(button("Save changes", { disabled: "Nothing changed" }))).toMatch(
      /<button type="button" class="button" disabled aria-describedby="why-save-changes">Save changes<\/button>\s*<span class="reason" id="why-save-changes">Nothing changed<\/span>/,
    );
  });
});
