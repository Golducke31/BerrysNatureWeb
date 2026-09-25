const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: './e2e',
  // Los specs de backend (admin-routing, api) necesitan el dev server y
  // están cubiertos por tests/playwright.api.config.js. Se excluyen acá
  // para no correrlos contra file:// (donde no hay servidor).
  testIgnore: [
    '**/admin-routing.spec.js',
    '**/api.spec.js',
    '**/paginas-ssr.spec.js',
    '**/etapa5.spec.js',
    '**/pagos.spec.js'
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.TEST_BASE_URL || `file://${path.resolve(__dirname, '../index.html')}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
