// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 1-6 ブロック形状管理ツール 処理ロジックテスト
 * 仕様書 4.2 の処理ロジックを検証
 */

const TOOL_PAGE_PATH = '/tool/block_manager.html';

// モックデータ
const MOCK_BLOCKS = [
  { block_id: 1, block_str_id: 'stone', name: '石', shape_type: 'normal', texture_id: 0 },
  { block_id: 2, block_str_id: 'dirt', name: '土', shape_type: 'normal', texture_id: 1 },
  { block_id: 3, block_str_id: 'grass', name: '草ブロック', shape_type: 'normal', texture_id: 2 },
];

const MOCK_TEXTURES = [
  { texture_id: 0, filename: 'stone.png', file_name: 'stone.png', color_hex: '#9e9e9e' },
  { texture_id: 1, filename: 'dirt.png', file_name: 'dirt.png', color_hex: '#8d6e63' },
  { texture_id: 2, filename: 'grass_top.png', file_name: 'grass_top.png', color_hex: '#81c784' },
];

// モックAPIのベースURL
const MOCK_API_URL = 'http://localhost:9999/mock-api';

/**
 * GAS APIをモック化するヘルパー関数
 */
async function mockGasApi(page, options = {}) {
  const blocks = options.blocks || [...MOCK_BLOCKS];
  const textures = options.textures || [...MOCK_TEXTURES];

  // ページ読み込み前にAPIのURLを上書き
  await page.addInitScript((mockUrl) => {
    window.GAS_API_URL = mockUrl;
  }, MOCK_API_URL);

  // モックAPIのルートを設定
  await page.route(`${MOCK_API_URL}**`, async (route) => {
    const url = route.request().url();
    const urlObj = new URL(url);
    const action = urlObj.searchParams.get('action');

    let response = { success: true, data: null };

    switch (action) {
      case 'getAll':
        response.data = { blocks, textures };
        break;
      case 'getBlocks':
        response.data = blocks;
        break;
      case 'getTextures':
        response.data = textures;
        break;
      case 'createBlock':
        const createBody = JSON.parse(route.request().postData() || '{}');
        const newBlock = {
          block_id: Math.max(...blocks.map(b => b.block_id)) + 1,
          ...createBody,
        };
        blocks.push(newBlock);
        response.data = { block_id: newBlock.block_id };
        break;
      case 'saveBlock':
        const saveBody = JSON.parse(route.request().postData() || '{}');
        const idx = blocks.findIndex(b => b.block_id === saveBody.block_id);
        if (idx >= 0) {
          blocks[idx] = { ...blocks[idx], ...saveBody };
        }
        response.data = { block_id: saveBody.block_id };
        break;
      case 'deleteBlock':
        const deleteBody = JSON.parse(route.request().postData() || '{}');
        const delIdx = blocks.findIndex(b => b.block_id === deleteBody.block_id);
        if (delIdx >= 0) {
          blocks.splice(delIdx, 1);
        }
        response.data = { deleted: true };
        break;
      case 'saveTexture':
        const texBody = JSON.parse(route.request().postData() || '{}');
        const texIdx = textures.findIndex(t => t.texture_id === texBody.texture_id);
        if (texIdx >= 0) {
          textures[texIdx] = { ...textures[texIdx], ...texBody };
        }
        response.data = { texture_id: texBody.texture_id };
        break;
      default:
        response = { success: false, error: 'Unknown action' };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

// ========================================
// 4.2.1 ページ読み込み時
// ========================================
test.describe('4.2.1 ページ読み込み時', () => {
  test('GAS APIでブロック一覧を取得し、先頭を自動選択', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    // データ読み込みを待機
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // ブロック一覧が表示される
    await expect(page.locator('.col-left .tile')).toHaveCount(4); // 3ブロック + 新規追加

    // 先頭（block_id最小）が選択されている
    await expect(page.locator('.col-left .tile.selected')).toHaveCount(1);
    await expect(page.locator('.col-left .tile.selected .tile-name')).toContainText('石');
  });

  test('選択したブロックの基本情報がフォームに表示', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    // 基本情報フォームに値が設定されている
    await expect(page.locator('.col-mid input').first()).toHaveValue('stone');
    await expect(page.locator('.col-mid input').nth(1)).toHaveValue('石');
  });

  test('block_id昇順でソートされる', async ({ page }) => {
    // block_idが逆順のデータでテスト
    await mockGasApi(page, {
      blocks: [
        { block_id: 3, block_str_id: 'grass', name: '草', shape_type: 'normal' },
        { block_id: 1, block_str_id: 'stone', name: '石', shape_type: 'normal' },
        { block_id: 2, block_str_id: 'dirt', name: '土', shape_type: 'normal' },
      ],
    });
    await page.goto(TOOL_PAGE_PATH);

    // 先頭は block_id=1 の石
    await expect(page.locator('.col-left .tile.selected .tile-name')).toContainText('石');

    // 順番が block_id 昇順
    const names = await page.locator('.col-left .tile:not(.add-new) .tile-name').allTextContents();
    expect(names).toEqual(['石', '土', '草']);
  });
});

// ========================================
// 4.2.2 ブロック選択
// ========================================
test.describe('4.2.2 ブロック選択', () => {
  test('タイルクリックで選択状態が更新', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    // 2番目のタイルをクリック
    await page.locator('.col-left .tile').nth(1).click();

    // 選択状態が更新
    await expect(page.locator('.col-left .tile').nth(1)).toHaveClass(/selected/);
    await expect(page.locator('.col-left .tile').first()).not.toHaveClass(/selected/);
  });

  test('タイルクリックでフォームが更新', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    // 2番目のタイル（土）をクリック
    await page.locator('.col-left .tile').nth(1).click();

    // フォームが更新
    await expect(page.locator('.col-mid input').first()).toHaveValue('dirt');
    await expect(page.locator('.col-mid input').nth(1)).toHaveValue('土');
  });

  test('未保存の変更がある場合、確認ダイアログを表示', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    // フォームを編集（変更フラグを立てる）
    await page.locator('.col-mid input').nth(1).fill('石（変更）');

    // ダイアログハンドラを設定
    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    // 別のタイルをクリック
    await page.locator('.col-left .tile').nth(1).click();

    // 確認ダイアログが表示された
    expect(dialogMessage).toContain('保存');
  });
});

// ========================================
// 4.2.3 新規ブロック作成
// ========================================
test.describe('4.2.3 新規ブロック作成', () => {
  test('「+新規追加」クリックでモーダル表示', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    await page.locator('.tile.add-new').click();
    await expect(page.locator('.modal')).toBeVisible();
  });

  test('block_str_idバリデーション: 必須', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    await page.locator('.tile.add-new').click();
    await page.locator('.modal input[name="name"]').fill('テスト');
    await page.locator('.modal .btn-primary').click();

    // エラーメッセージが表示
    await expect(page.locator('.modal .error')).toBeVisible();
  });

  test('block_str_idバリデーション: 英数字とアンダースコアのみ', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    await page.locator('.tile.add-new').click();
    await page.locator('.modal input[name="block_str_id"]').fill('invalid-id');
    await page.locator('.modal input[name="name"]').fill('テスト');
    await page.locator('.modal .btn-primary').click();

    await expect(page.locator('.modal .error')).toBeVisible();
  });

  test('block_str_idバリデーション: 重複不可', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    await page.locator('.tile.add-new').click();
    await page.locator('.modal input[name="block_str_id"]').fill('stone'); // 既存
    await page.locator('.modal input[name="name"]').fill('テスト');
    await page.locator('.modal .btn-primary').click();

    await expect(page.locator('.modal .error')).toBeVisible();
  });

  test('正常作成後、一覧に追加され選択される', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    await page.locator('.tile.add-new').click();
    await page.locator('.modal input[name="block_str_id"]').fill('new_block');
    await page.locator('.modal input[name="name"]').fill('新規ブロック');
    await page.locator('.modal .btn-primary').click();

    // モーダルが閉じる
    await expect(page.locator('.modal')).not.toBeVisible();

    // 一覧に追加され選択される
    await expect(page.locator('.col-left .tile:not(.add-new)')).toHaveCount(4);
    await expect(page.locator('.col-left .tile.selected .tile-name')).toContainText('新規ブロック');
  });
});

// ========================================
// 4.2.4 ブロックタイプ変更
// ========================================
test.describe('4.2.4 ブロックタイプ変更', () => {
  test('タイプ変更時に確認ダイアログを表示', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.dismiss(); // キャンセル
    });

    await page.locator('.col-mid select').selectOption('custom');

    expect(dialogMessage).toContain('クリア');
  });

  test('キャンセルで変更されない', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await page.locator('.col-mid select').selectOption('custom');

    // セレクトが元に戻る
    await expect(page.locator('.col-mid select')).toHaveValue('normal');
  });

  test('OKでタイプが変更される', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.locator('.col-mid select').selectOption('custom');

    await expect(page.locator('.col-mid select')).toHaveValue('custom');
  });
});

// ========================================
// 4.2.5 ブロック保存
// ========================================
test.describe('4.2.5 ブロック保存', () => {
  test('保存ボタンでAPIが呼ばれる', async ({ page }) => {
    let savedData = null;

    await mockGasApi(page);

    // saveBlock のリクエストをキャプチャ
    await page.route(`${MOCK_API_URL}?action=saveBlock`, async (route) => {
      savedData = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { block_id: savedData.block_id } }),
      });
    });

    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // フォームを編集
    await page.locator('.col-mid input').nth(1).fill('石（更新）');

    // 保存
    await page.locator('.col-mid .btn-primary').click();

    // API呼び出しを待機
    await page.waitForTimeout(500);

    // APIが呼ばれた
    expect(savedData).not.toBeNull();
    expect(savedData.name).toBe('石（更新）');
  });

  test('保存後、変更フラグがクリアされる', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    // フォームを編集
    await page.locator('.col-mid input').nth(1).fill('石（更新）');

    // 保存
    await page.locator('.col-mid .btn-primary').click();

    // ダイアログハンドラ（変更がなければダイアログは出ない）
    let dialogShown = false;
    page.on('dialog', async dialog => {
      dialogShown = true;
      await dialog.accept();
    });

    // 別のタイルをクリック
    await page.locator('.col-left .tile').nth(1).click();

    // 確認ダイアログが出ない
    expect(dialogShown).toBe(false);
  });
});

// ========================================
// 4.2.6 ブロック削除
// ========================================
test.describe('4.2.6 ブロック削除', () => {
  test('削除ボタンで確認ダイアログを表示', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.dismiss();
    });

    await page.locator('.col-mid .btn-danger').click();

    expect(dialogMessage).toContain('削除');
  });

  test('キャンセルで削除されない', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await page.locator('.col-mid .btn-danger').click();

    // タイル数変わらず
    await expect(page.locator('.col-left .tile:not(.add-new)')).toHaveCount(3);
  });

  test('OKで削除され、一覧が更新', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.locator('.col-mid .btn-danger').click();

    // タイル数が減る
    await expect(page.locator('.col-left .tile:not(.add-new)')).toHaveCount(2);
  });
});

// ========================================
// 4.2.7 テクスチャ編集
// ========================================
test.describe('4.2.7 テクスチャ編集', () => {
  test.beforeEach(async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);
    await page.locator('.tab').nth(1).click(); // テクスチャ一覧タブ
  });

  test('テクスチャ選択で詳細表示', async ({ page }) => {
    // 2番目のテクスチャを選択
    await page.locator('.col-7 .tile').nth(1).click();

    // 詳細が更新
    await expect(page.locator('.col-3 input[type="text"]').first()).toHaveValue('dirt.png');
  });

  test('代表色のみ編集可能', async ({ page }) => {
    // ファイル名は読み取り専用
    await expect(page.locator('.col-3 input[type="text"]').first()).toHaveAttribute('readonly', '');

    // カラーピッカーは編集可能
    await expect(page.locator('.col-3 input[type="color"]')).toBeEnabled();
  });

  test('保存でAPIが呼ばれる', async ({ page }) => {
    let savedData = null;

    // このテストは beforeEach とは別にルート設定が必要
    // page.route は後から追加しても機能する
    page.on('request', async (request) => {
      if (request.url().includes('action=saveTexture')) {
        savedData = JSON.parse(request.postData() || '{}');
      }
    });

    // 代表色を変更
    await page.locator('.col-3 input[type="color"]').fill('#ff0000');

    // 保存
    await page.locator('.col-3 .btn-primary').click();

    // API呼び出しを待機
    await page.waitForTimeout(500);

    expect(savedData).not.toBeNull();
    expect(savedData.color_hex).toBe('#ff0000');
  });
});

// ========================================
// 4.2.8 BlockEditorUI統合
// ========================================
test.describe('4.2.8 BlockEditorUI統合', () => {
  test('ブロック選択時にBlockEditorUIが右カラムに初期化される', async ({ page }) => {
    await mockGasApi(page);
    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // 右カラムにBlockEditorUIのコンテナが存在
    await expect(page.locator('.col-right .preview-container')).toBeVisible();
    await expect(page.locator('.col-right .preview-3d')).toBeVisible();
  });

  test('標準ブロック選択時にテクスチャスロットが表示される', async ({ page }) => {
    await mockGasApi(page, {
      blocks: [
        { block_id: 1, block_str_id: 'stone', name: '石', shape_type: 'normal', texture_id: 0 },
      ],
    });
    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // 標準ブロック用のテクスチャスロットが表示
    await expect(page.locator('.col-right .slot').first()).toBeVisible();
  });

  test('カスタムブロック選択時にマテリアルスロットとモード切替ボタンが表示される', async ({ page }) => {
    await mockGasApi(page, {
      blocks: [
        { block_id: 1, block_str_id: 'custom_block', name: 'カスタム', shape_type: 'custom' },
      ],
    });
    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // カスタムブロック用のマテリアルスロットが表示
    await expect(page.locator('.col-right .material-slot').first()).toBeVisible();

    // モード切替ボタンが表示
    await expect(page.locator('.col-right #modeToggle')).toBeVisible();
  });

  test('ブロック切り替え時にエディタが切り替わる', async ({ page }) => {
    await mockGasApi(page, {
      blocks: [
        { block_id: 1, block_str_id: 'stone', name: '石', shape_type: 'normal', texture_id: 0 },
        { block_id: 2, block_str_id: 'custom_block', name: 'カスタム', shape_type: 'custom' },
      ],
    });
    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // 最初は標準ブロック（スロットが表示）
    await expect(page.locator('.col-right .slot').first()).toBeVisible();

    // カスタムブロックを選択
    await page.locator('.col-left .tile').nth(1).click();

    // マテリアルスロットに切り替わる
    await expect(page.locator('.col-right .material-slot').first()).toBeVisible();
  });

  test('スロットクリックでテクスチャ選択モーダルが表示される', async ({ page }) => {
    await mockGasApi(page, {
      blocks: [
        { block_id: 1, block_str_id: 'stone', name: '石', shape_type: 'normal', texture_id: 0 },
      ],
      textures: [
        { texture_id: 0, filename: 'stone.png', file_name: 'stone.png', color_hex: '#9e9e9e' },
      ],
    });
    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // スロットをクリック
    await page.locator('.col-right .slot').first().click();

    // テクスチャ選択モーダルが表示される
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();
  });

  test('テクスチャ選択後にスロット画像が更新される', async ({ page }) => {
    await mockGasApi(page, {
      blocks: [
        { block_id: 1, block_str_id: 'stone', name: '石', shape_type: 'normal', texture_id: 0 },
      ],
      textures: [
        { texture_id: 0, filename: 'stone.png', file_name: 'stone.png', color_hex: '#9e9e9e', image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
      ],
    });
    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // スロットをクリックしてモーダルを開く
    const slot = page.locator('.col-right .slot').first();
    await slot.click();
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();

    // テクスチャを選択
    await page.locator('.texture-modal-overlay .texture-item').nth(1).click();

    // モーダルが閉じる
    await expect(page.locator('.texture-modal-overlay')).not.toBeVisible();

    // スロット画像にbackground-imageが設定される
    const slotImage = slot.locator('.slot-image');
    await expect(slotImage).toHaveCSS('background-image', /url/);
  });

  test('BGボタンがツールバーに表示される', async ({ page }) => {
    await mockGasApi(page, {
      blocks: [
        { block_id: 1, block_str_id: 'stone', name: '石', shape_type: 'normal', texture_id: 0 },
      ],
    });
    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // BGボタンがツールバー内に表示される
    await expect(page.locator('.col-right .preview-toolbar .bg-btn')).toBeVisible();
  });

  test('カスタムブロックでマテリアルスロットクリックでモーダルが表示される', async ({ page }) => {
    await mockGasApi(page, {
      blocks: [
        { block_id: 1, block_str_id: 'custom_block', name: 'カスタム', shape_type: 'custom' },
      ],
      textures: [
        { texture_id: 0, filename: 'stone.png', file_name: 'stone.png', color_hex: '#9e9e9e' },
      ],
    });
    await page.goto(TOOL_PAGE_PATH);
    await page.waitForSelector('.col-left .tile', { timeout: 10000 });

    // マテリアルスロットをクリック
    await page.locator('.col-right .material-slot').first().click();

    // テクスチャ選択モーダルが表示される
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();
  });
});
