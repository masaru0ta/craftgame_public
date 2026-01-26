// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 1-6 ブロック形状管理ツール テスト
 * モックアップとUIデザインの一致を検証
 */

const TEST_PAGE_PATH = '/test/spec_1-6_block_manager.html';
const TOOL_PAGE_PATH = '/tool/block_manager.html';

// 色定数
const COLORS = {
  PRIMARY: 'rgb(66, 133, 244)',    // #4285f4
  DANGER: 'rgb(217, 48, 37)',      // #d93025
  SELECTED_BG: 'rgb(227, 242, 253)', // #e3f2fd
  TAB_BG: 'rgb(51, 51, 51)',       // #333
  BLACK: 'rgb(0, 0, 0)',
};

// ========================================
// タブバー
// ========================================
test.describe('タブバー', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
  });

  test('構造: .tabs内に.tabが2つ存在', async ({ page }) => {
    await expect(page.locator('.tabs')).toBeVisible();
    await expect(page.locator('.tab')).toHaveCount(2);
  });

  test('初期状態で最初のタブが .active', async ({ page }) => {
    await expect(page.locator('.tab').first()).toHaveClass(/active/);
  });

  test('スタイル: 背景色と下線色', async ({ page }) => {
    await expect(page.locator('.tabs')).toHaveCSS('background-color', COLORS.TAB_BG);
    await expect(page.locator('.tab.active')).toHaveCSS('border-bottom-color', COLORS.PRIMARY);
  });

  test('2番目のタブをクリックすると .active が移動', async ({ page }) => {
    const secondTab = page.locator('.tab').nth(1);
    await secondTab.click();
    await expect(secondTab).toHaveClass(/active/);
    await expect(page.locator('.tab').first()).not.toHaveClass(/active/);
  });
});

// ========================================
// ブロック一覧画面 - レイアウト
// ========================================
test.describe('ブロック一覧画面 - レイアウト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
  });

  test('3カラム構成が存在', async ({ page }) => {
    await expect(page.locator('.main.active')).toBeVisible();
    await expect(page.locator('.col-left')).toBeVisible();
    await expect(page.locator('.col-mid')).toBeVisible();
    await expect(page.locator('.col-right')).toBeVisible();
  });

  test('flex比率が 3:2:5', async ({ page }) => {
    await expect(page.locator('.col-left')).toHaveCSS('flex', '3 1 0%');
    await expect(page.locator('.col-mid')).toHaveCSS('flex', '2 1 0%');
    await expect(page.locator('.col-right')).toHaveCSS('flex', '5 1 0%');
  });
});

// ========================================
// ブロック一覧グリッド
// ========================================
test.describe('ブロック一覧グリッド', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
  });

  test('構造: .grid, .tile, .tile.selected, .tile.add-new', async ({ page }) => {
    await expect(page.locator('.col-left .grid')).toBeVisible();
    await expect(page.locator('.col-left .tile').first()).toBeVisible();
    await expect(page.locator('.col-left .tile.selected')).toHaveCount(1);
    await expect(page.locator('.col-left .tile.add-new')).toBeVisible();
  });

  test('選択中タイルのスタイル', async ({ page }) => {
    const selectedTile = page.locator('.col-left .tile.selected');
    await expect(selectedTile).toHaveCSS('background-color', COLORS.SELECTED_BG);
    await expect(selectedTile).toHaveCSS('border-color', COLORS.PRIMARY);
  });

  test('.tile-img が48x48px', async ({ page }) => {
    const tileImg = page.locator('.tile-img').first();
    await expect(tileImg).toHaveCSS('width', '48px');
    await expect(tileImg).toHaveCSS('height', '48px');
  });

  test('.tile.add-new のボーダーが破線', async ({ page }) => {
    await expect(page.locator('.tile.add-new')).toHaveCSS('border-style', 'dashed');
  });
});

// ========================================
// 基本情報フォーム
// ========================================
test.describe('基本情報フォーム', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
  });

  test('見出しとフォーム要素が存在', async ({ page }) => {
    await expect(page.locator('.col-mid h3')).toContainText('基本情報');
    await expect(page.locator('.col-mid .form-group label:has-text("ブロックID")')).toBeVisible();
    await expect(page.locator('.col-mid .form-group label:has-text("表示名")')).toBeVisible();
    await expect(page.locator('.col-mid select')).toBeVisible();
  });

  test('ボタンが存在', async ({ page }) => {
    await expect(page.locator('.col-mid .btn-danger')).toBeVisible();
    await expect(page.locator('.col-mid .btn-primary')).toBeVisible();
  });

  test('ボタンのスタイル', async ({ page }) => {
    await expect(page.locator('.col-mid .btn-danger')).toHaveCSS('color', COLORS.DANGER);
    await expect(page.locator('.col-mid .btn-primary')).toHaveCSS('background-color', COLORS.PRIMARY);
  });
});

// ========================================
// 3Dプレビュー枠
// ========================================
test.describe('3Dプレビュー枠', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
  });

  test('構造: container, toolbar, 3d, control', async ({ page }) => {
    await expect(page.locator('.preview-container')).toBeVisible();
    await expect(page.locator('.preview-toolbar')).toBeVisible();
    await expect(page.locator('.preview-3d')).toBeVisible();
    await expect(page.locator('.preview-control')).toBeVisible();
    await expect(page.locator('#bgBtn')).toBeVisible();
  });

  test('.preview-container のスタイル', async ({ page }) => {
    const container = page.locator('.preview-container');
    await expect(container).toHaveCSS('aspect-ratio', '3 / 4');
    await expect(container).toHaveCSS('background-color', COLORS.BLACK);
  });
});

// ========================================
// テクスチャ一覧画面
// ========================================
test.describe('テクスチャ一覧画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.locator('.tab').nth(1).click();
  });

  test('2カラム構成が存在', async ({ page }) => {
    await expect(page.locator('.col-7')).toBeVisible();
    await expect(page.locator('.col-3')).toBeVisible();
  });

  test('flex比率が 7:3', async ({ page }) => {
    await expect(page.locator('.col-7')).toHaveCSS('flex', '7 1 0%');
    await expect(page.locator('.col-3')).toHaveCSS('flex', '3 1 0%');
  });

  test('見出しが存在', async ({ page }) => {
    await expect(page.locator('.col-7 h3')).toContainText('テクスチャ一覧');
    await expect(page.locator('.col-3 h3')).toContainText('テクスチャ詳細');
  });

  test('テクスチャID表示とプレビュー', async ({ page }) => {
    await expect(page.locator('.col-7 .tile-id').first()).toBeVisible();
    const preview = page.locator('.col-3 .preview-large');
    await expect(preview).toHaveCSS('width', '100px');
    await expect(preview).toHaveCSS('height', '100px');
  });

  test('カラーピッカーが存在', async ({ page }) => {
    await expect(page.locator('.col-3 input[type="color"]')).toBeVisible();
  });
});

// ========================================
// テクスチャ選択ポップアップ
// ========================================
test.describe('テクスチャ選択ポップアップ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
  });

  test('初期は非表示', async ({ page }) => {
    await expect(page.locator('.picker-overlay')).toHaveCSS('display', 'none');
  });

  test('クリックで表示、閉じるで非表示', async ({ page }) => {
    await page.locator('.preview-control .preview').first().click();
    await expect(page.locator('.picker-overlay')).toHaveCSS('display', 'flex');
    await page.locator('.picker-close').click();
    await expect(page.locator('.picker-overlay')).toHaveCSS('display', 'none');
  });

  test('.picker-grid が4列', async ({ page }) => {
    await page.locator('.preview-control .preview').first().click();
    await expect(page.locator('.picker-grid')).toHaveCSS('grid-template-columns', '64px 64px 64px 64px');
  });
});

// ========================================
// タブ切り替え
// ========================================
test.describe('タブ切り替え', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
  });

  test('初期状態でブロック一覧が表示', async ({ page }) => {
    await expect(page.locator('#blockList')).toHaveClass(/active/);
    await expect(page.locator('#textureList')).not.toHaveClass(/active/);
  });

  test('タブクリックで画面切り替え', async ({ page }) => {
    await page.locator('.tab').nth(1).click();
    await expect(page.locator('#textureList')).toHaveClass(/active/);
    await expect(page.locator('#blockList')).not.toHaveClass(/active/);

    await page.locator('.tab').first().click();
    await expect(page.locator('#blockList')).toHaveClass(/active/);
  });
});

// ============================================
// BlockEditorUI スタイル連動
// ============================================
test.describe('BlockEditorUI スタイル連動', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TOOL_PAGE_PATH);
    // データ読み込み待機
    await page.waitForSelector('.col-left .tile', { timeout: 30000 });
  });

  test('ブラシサイズボタンの高さが1-4と同じ clamp(24px, 5vw, 48px) である', async ({ page }) => {
    // カスタムブロックを選択してブラシサイズボタンを表示
    // まずカスタムブロックのタイルをクリック（2番目以降にあると想定）
    const tiles = page.locator('.col-left .tile:not(.add-new)');
    const count = await tiles.count();

    // カスタムブロックを探して選択
    let found = false;
    for (let i = 0; i < count; i++) {
      await tiles.nth(i).click();
      // モード切替ボタンが表示されたらカスタムブロック
      const modeBtn = page.locator('.mode-toggle-btn');
      if (await modeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        found = true;
        break;
      }
    }

    if (found) {
      const brushBtn = page.locator('.brush-size-btn').first();
      const slotImage = page.locator('.custom-slots .slot-image').first();

      // ブラシサイズボタンの高さがスロット画像と同じ
      const brushHeight = await brushBtn.evaluate(el => el.getBoundingClientRect().height);
      const slotHeight = await slotImage.evaluate(el => el.getBoundingClientRect().height);

      expect(Math.abs(brushHeight - slotHeight)).toBeLessThanOrEqual(1);
    }
  });

  test('衝突テストボタンの高さがスロット画像と同じである', async ({ page }) => {
    // カスタムブロックを選択
    const tiles = page.locator('.col-left .tile:not(.add-new)');
    const count = await tiles.count();

    let found = false;
    for (let i = 0; i < count; i++) {
      await tiles.nth(i).click();
      const checkBtn = page.locator('.check-btn');
      if (await checkBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        found = true;
        break;
      }
    }

    if (found) {
      const checkBtn = page.locator('.check-btn');
      const slotImage = page.locator('.custom-slots .slot-image').first();

      const btnHeight = await checkBtn.evaluate(el => el.getBoundingClientRect().height);
      const slotHeight = await slotImage.evaluate(el => el.getBoundingClientRect().height);

      expect(Math.abs(btnHeight - slotHeight)).toBeLessThanOrEqual(1);
    }
  });
});
