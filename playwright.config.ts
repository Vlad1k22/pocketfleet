import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-security.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:8087',
    // Traces can capture bearer tokens in network traffic; keep them disabled.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'npx tsx tests/e2e/start-api.ts',
      url: 'http://127.0.0.1:4349/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run web',
      url: 'http://127.0.0.1:8087',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { CI: '1', BROWSER: 'none', EXPO_NO_TELEMETRY: '1' },
    },
  ],
});
