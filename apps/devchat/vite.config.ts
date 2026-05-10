import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: false
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
