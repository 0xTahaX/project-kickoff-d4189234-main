import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['cycle-jessica-black-aaa.trycloudflare.com'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
