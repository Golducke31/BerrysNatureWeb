const { defineConfig, devices } = require('@playwright/test');
const path = require('path');
const env = require('./e2e/_admin-env');

/*
  Configuración para los tests de backend (API + ruta secreta del admin).
  Levanta el dev server (npm run dev) y corre SOLO los specs que hablan
  con la API: admin-routing.spec.js y api.spec.js.

  Los tests de admin-routing NO requieren base de datos (solo enrutamiento).
  Los tests de api.spec.js se saltean si no hay DATABASE_URL.

  Uso:
    npm run test:api
    DATABASE_URL=postgres://... npm run test:api
*/

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: ['**/admin-routing.spec.js', '**/api.spec.js', '**/paginas-ssr.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 20000,
  use: {
    baseURL: `http://localhost:${env.PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${env.PORT}`,
    reuseExistingServer: true,
    timeout: 30000,
    env: {
      PORT: String(env.PORT),
      ADMIN_SLUG: env.ADMIN_SLUG,
      ADMIN_GATE_KEY: env.ADMIN_GATE_KEY,
      ADMIN_IP_ALLOWLIST: '',
      SESSION_SECRET: 'testsessionsecret_0123456789abcdef0123456789',
      DATABASE_URL: process.env.DATABASE_URL || ''
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
