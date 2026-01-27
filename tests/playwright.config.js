// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Playwright設定ファイル
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: '.',

  // 出力先をtests/内に設定
  outputDir: './test-results',
  reporter: [['html', { outputFolder: './playwright-report' }]],

  // タイムアウト設定
  timeout: 120000,
  expect: {
    timeout: 10000
  },

  // 並列実行設定
  fullyParallel: true,
  workers: process.env.CI ? 1 : 4,

  // ブラウザ設定
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  // ローカルサーバーを自動起動
  webServer: {
    command: 'npx serve ../src -l 3000',
    port: 3000,
    reuseExistingServer: true,
    timeout: 10000,
  },

  // プロジェクト設定（ブラウザ）
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
