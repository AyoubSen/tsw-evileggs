import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    launchOptions: {
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    },
  },
  webServer: [
    {
      command: 'pnpm dev:server',
      port: 2677,
      reuseExistingServer: false,
      env: {
        PORT: '2677',
        ALLOWED_WEB_ORIGINS: 'http://127.0.0.1:4173',
        DEVELOPMENT_LOGGING: 'false',
        ENABLE_TEST_ROUTES: 'true',
      },
    },
    {
      command: 'pnpm dev:web --host 127.0.0.1 --port 4173',
      port: 4173,
      reuseExistingServer: false,
      env: { VITE_COLYSEUS_URL: 'http://127.0.0.1:2677' },
    },
  ],
})
