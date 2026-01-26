// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 1-6 ブロック形状管理ツール 結合テスト
 * 実際のGAS APIとの連携をテストする
 *
 * 注意: このテストは実際のスプレッドシートを操作するため、
 * テストデータの作成→削除を対で行い、データを汚さないようにする
 */

const TOOL_PAGE_PATH = '/tool/block_manager.html';

// テスト用の一意なID生成
function generateTestId() {
  return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ========================================
// 読み取り系API結合テスト
// ========================================
test.describe('結合テスト: 読み取り系API', () => {
  test('GAS APIからブロック一覧を取得できる', async ({ page }) => {
    await page.goto(TOOL_PAGE_PATH);

    // データ読み込みを待機（実際のAPIなので長めに）
    await page.waitForSelector('.col-left .tile', { timeout: 30000 });

    // ブロックタイルが表示される（最低1つ + 新規追加ボタン）
    const tileCount = await page.locator('.col-left .tile').count();
    expect(tileCount).toBeGreaterThanOrEqual(2);
  });

  test('GAS APIからテクスチャ一覧を取得できる', async ({ page }) => {
    await page.goto(TOOL_PAGE_PATH);

    // テクスチャタブに切り替え
    await page.waitForSelector('.tab[data-tab="textures"]', { timeout: 30000 });
    await page.locator('.tab[data-tab="textures"]').click();

    // データ読み込みを待機
    await page.waitForSelector('.col-7 .tile', { timeout: 30000 });

    // テクスチャタイルが表示される（最低1つ）
    const tileCount = await page.locator('.col-7 .tile').count();
    expect(tileCount).toBeGreaterThanOrEqual(1);
  });
});

// ========================================
// 書き込み系API結合テスト
// ========================================
test.describe('結合テスト: ブロック作成→削除', () => {
  test('ブロックを作成して削除できる', async ({ page }) => {
    const testBlockId = generateTestId();

    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 30000 });

    // 初期タイル数を記録
    const initialCount = await page.locator('.col-left .tile').count();

    // 新規追加タイルをクリック
    await page.locator('.col-left .tile.add-new').click();
    await page.waitForSelector('.modal-overlay.show', { timeout: 5000 });

    // フォームに入力
    await page.locator('.modal input[name="block_str_id"]').fill(testBlockId);
    await page.locator('.modal input[name="name"]').fill('結合テスト用ブロック');

    // 作成ボタンをクリック
    await page.locator('#createBlockSubmit').click();

    // 作成完了を待機（タイル数が増える）
    await expect(page.locator('.col-left .tile')).toHaveCount(initialCount + 1, { timeout: 10000 });

    // 作成されたブロックが選択されていることを確認
    await expect(page.locator('.col-left .tile.selected .tile-name')).toContainText('結合テスト用ブロック');

    // --- 削除 ---

    // 確認ダイアログをOK
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 削除ボタンをクリック
    await page.locator('#deleteBlockBtn').click();

    // 削除完了を待機（タイル数が戻る）
    await expect(page.locator('.col-left .tile')).toHaveCount(initialCount, { timeout: 10000 });
  });
});

test.describe('結合テスト: テクスチャ削除API呼び出し', () => {
  test('テクスチャ削除APIが正しい形式で呼び出される', async ({ page }) => {
    // このテストは実際に削除せず、APIリクエストの形式を検証する
    let requestBody = null;

    // APIリクエストをインターセプト
    await page.route('**/exec?action=deleteTexture', async (route) => {
      requestBody = route.request().postData();
      // 実際には削除しない（404を返す）
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Test interception' }),
      });
    });

    await page.goto(TOOL_PAGE_PATH);

    // テクスチャタブに切り替え
    await page.waitForSelector('.tab[data-tab="textures"]', { timeout: 30000 });
    await page.locator('.tab[data-tab="textures"]').click();
    await page.waitForSelector('.col-7 .tile', { timeout: 30000 });

    // テクスチャを選択
    await page.locator('.col-7 .tile').first().click();

    // 確認ダイアログをOK
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 削除ボタンをクリック
    await page.locator('#deleteTextureBtn').click();

    // リクエストを待機
    await page.waitForTimeout(1000);

    // リクエストボディの形式を検証
    expect(requestBody).not.toBeNull();
    const parsed = JSON.parse(requestBody);
    expect(parsed).toHaveProperty('texture_id');
    expect(typeof parsed.texture_id).toBe('number');
  });
});
