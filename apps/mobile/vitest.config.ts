import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests live in tests/ (mirroring src/) and import the code through "@/".
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
