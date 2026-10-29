import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// تست‌ها در jsdom اجرا می‌شوند و درخواست‌های API در توسعه به سرور Express می‌روند.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
