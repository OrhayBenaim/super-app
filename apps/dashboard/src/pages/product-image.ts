// A Product's image tile (A7) and its upload dialog (A7b, docs/adr/0008). Styles: pages/styles.ts.
import { html } from "hono/html";
import { MAX_IMAGE_MB, RAMI_LEVY_IMAGES, uploadedVersion, type UploadedImages } from "@grocer/shared/product-image";
import { button } from "#/pages/ui.ts";

export type ImageSource = "uploaded" | "rami-levy" | "open-food-facts";
/** What the tile shows: the image's URL and where it came from, both null when there is none. */
export type ProductImage = { url: string | null; source: ImageSource | null };

/** Where the shared lookup's answer for a code came from. */
export const imageOf = (code: string, url: string | null, uploaded: UploadedImages): ProductImage => ({
  url,
  source: !url ? null : uploadedVersion(code, uploaded) !== undefined ? "uploaded" : url.startsWith(RAMI_LEVY_IMAGES) ? "rami-levy" : "open-food-facts",
});

const TILE = { uploaded: "Uploaded", "rami-levy": "From Rami Levy", "open-food-facts": "From Open Food Facts" } as const;
const NOW = {
  uploaded: "Uploaded by the Grocer team",
  "rami-levy": "Found on Rami Levy’s image server by barcode",
  "open-food-facts": "Found on Open Food Facts by barcode",
} as const;

const picture = (image: ProductImage, alt: string, size: number) =>
  image.url ? html`<img src="${image.url}" alt="${alt}" width="${size}" height="${size}" />` : html`<span class="slot">No Product image</span>`;

/** The tile on the Product page: the image, where it came from, and the button that opens the dialog. */
export const imageTile = (image: ProductImage, name: string) => html`<button type="button" class="image-tile" id="product-image" aria-label="Change the Product image">
  <span class="image-frame">${picture(image, name, 160)}</span>
  <span class="image-caption"><span class="footnote muted">${image.source ? TILE[image.source] : ""}</span><span class="change">${image.url ? "Change" : "Add"}</span></span>
</button>`;

const href = (code: string) => `/products/${encodeURIComponent(code)}/image`;

/** The A7b dialog: Now vs New, a drop zone or file choice, Use the new image, Cancel, and Remove my image when one is uploaded. */
export const imageDialog = (code: string, name: string, image: ProductImage) => html`<dialog id="image-dialog" class="dialog" aria-labelledby="image-dialog-title">
  <form hx-post="${href(code)}" hx-encoding="multipart/form-data" hx-target="#image-error" hx-swap="innerHTML">
    <header class="dialog-header">
      <div>
        <h2 id="image-dialog-title">Product image</h2>
        <p class="footnote muted">${code} · <bdi lang="he">${name}</bdi></p>
      </div>
      <button type="button" class="close" aria-label="Close" data-close>×</button>
    </header>
    <div class="compare">
      <div>
        <span class="footnote muted">Now</span>
        <div class="preview">${picture(image, name, 200)}</div>
        <p class="footnote">${image.source ? NOW[image.source] : "None found by barcode"}</p>
      </div>
      <div>
        <span class="footnote muted">New</span>
        <div class="preview" id="new-preview"><span class="slot">Choose an image below</span></div>
        <p class="footnote" id="new-facts"></p>
        <p class="footnote warn" id="narrow" hidden>Narrower than 400 px: it may look blurry in the app.</p>
      </div>
    </div>
    <label class="drop" id="drop">
      <span class="muted">Drop an image here, or</span> <span class="link">choose a file</span>
      <span class="footnote muted">PNG, JPG or WebP, up to ${MAX_IMAGE_MB} MB</span>
      <input type="file" name="image" accept="image/png,image/jpeg,image/webp" class="visually-hidden" />
    </label>
    <div id="image-error" role="alert"></div>
    <p class="footnote muted">An uploaded image is used everywhere, in the app and here, instead of the one found by barcode. Remove it later to go back to the found one.</p>
    <div class="dialog-actions">
      ${button("Cancel", { variant: "plain", attrs: { "data-close": "" } })}
      <span>
        ${image.source === "uploaded" ? button("Remove my image", { variant: "destructive", attrs: { "hx-delete": href(code), "hx-target": "#image-error" } }) : ""}
        <button type="submit" class="button button-filled" disabled>Use the new image</button>
      </span>
    </div>
  </form>
</dialog>
${IMAGE_SCRIPT}`;

// The tile opens the dialog; a chosen or dropped file shows as New with its size, and a warning when it is narrow.
const IMAGE_SCRIPT = html`<script>
  addEventListener("DOMContentLoaded", () => {
    const dialog = document.getElementById("image-dialog");
    const form = dialog.querySelector("form");
    const input = form.elements.namedItem("image");
    const drop = document.getElementById("drop");
    const preview = document.getElementById("new-preview");
    const facts = document.getElementById("new-facts");
    const narrow = document.getElementById("narrow");
    const use = form.querySelector('button[type="submit"]');
    const blank = preview.innerHTML;
    // The preview's object URL holds the file's bytes until revoked: one at a time, none once the dialog resets.
    let previewUrl = null;
    const revoke = () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    };
    const reset = () => {
      form.reset();
      revoke();
      preview.innerHTML = blank;
      facts.textContent = "";
      narrow.hidden = true;
      use.disabled = true;
      document.getElementById("image-error").textContent = "";
    };
    const show = (file) => {
      if (!file) return reset();
      const img = new Image();
      img.alt = "The new image";
      img.onload = () => {
        facts.textContent = file.name + " · " + img.naturalWidth + " × " + img.naturalHeight + " · " + Math.max(1, Math.round(file.size / 1024)) + " KB";
        narrow.hidden = img.naturalWidth >= 400;
      };
      revoke();
      previewUrl = URL.createObjectURL(file);
      img.src = previewUrl;
      preview.replaceChildren(img);
      use.disabled = false;
    };
    document.getElementById("product-image").addEventListener("click", () => dialog.showModal());
    dialog.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("close", reset);
    input.addEventListener("change", () => show(input.files[0]));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      input.files = e.dataTransfer.files;
      show(input.files[0]);
    });
  });
</script>`;
