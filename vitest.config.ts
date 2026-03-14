import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "$": path.resolve(__dirname),
      "@": path.resolve(__dirname, "src"),
      "@OS": path.resolve(__dirname, "OS"),
    },
  },
});
