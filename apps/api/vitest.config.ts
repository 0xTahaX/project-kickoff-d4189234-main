import { defineConfig } from "vitest/config";

// تست‌ها فقط از سورس اجرا می‌شوند. بدون این محدوده، فایل‌های تست کامپایل‌شدهٔ dist هم دوباره
// اجرا می‌شوند و نتیجهٔ قدیمی را سبز نشان می‌دهند.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
