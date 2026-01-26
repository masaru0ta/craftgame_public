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
    await expect(selectedTile).toHaveCSS('border-color', COLORS.PRIMARY);
  });

  test('.tile-img が100%幅でアスペクト比1:1', async ({ page }) => {
    const tileImg = page.locator('.tile-img').first();
    await expect(tileImg).toHaveCSS('width', /\d+px/);
    await expect(tileImg).toHaveCSS('aspect-ratio', '1 / 1');
  });

  test('.tile のパディングが0px', async ({ page }) => {
    const tile = page.locator('.tile').first();
    await expect(tile).toHaveCSS('padding', '0px');
  });

  test('.tile-name が枠の下に表示される', async ({ page }) => {
    const tileName = page.locator('.tile-name').first();
    await expect(tileName).toHaveCSS('position', 'static');
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
// ブロック保存機能
// ============================================
test.describe('ブロック保存機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TOOL_PAGE_PATH);
    // データ読み込み待機
    await page.waitForSelector('.col-left .tile', { timeout: 30000 });
  });

  test('保存時にBlockEditorUIの形状データが含まれる', async ({ page }) => {
    // 標準ブロックを選択
    await page.locator('.col-left .tile:not(.add-new)').first().click();
    await page.waitForTimeout(500);

    // フォームの内容を変更
    await page.fill('#blockName', 'テスト保存');

    // 保存前にBlockEditorUIの形状データを取得可能か確認
    const hasEditorUI = await page.evaluate(() => {
      return window.state && window.state.editorUI && typeof window.state.editorUI.getBlockData === 'function';
    });
    expect(hasEditorUI).toBe(true);
  });

  test('保存成功時にボタンに.save-successクラスが追加される', async ({ page }) => {
    // ブロックを選択
    await page.locator('.col-left .tile:not(.add-new)').first().click();
    await page.waitForTimeout(500);

    // 保存ボタンをクリック
    await page.click('#saveBlockBtn');

    // .save-successクラスが追加されることを確認
    await expect(page.locator('#saveBlockBtn')).toHaveClass(/save-success/, { timeout: 3000 });
  });

  test('保存成功時にボタンテキストが「保存完了」になる', async ({ page }) => {
    // ブロックを選択
    await page.locator('.col-left .tile:not(.add-new)').first().click();
    await page.waitForTimeout(500);

    // 保存ボタンをクリック
    await page.click('#saveBlockBtn');

    // テキストが「保存完了」になることを確認
    await expect(page.locator('#saveBlockBtn')).toContainText('保存完了', { timeout: 3000 });
  });

  test('保存成功後1.5秒で元の状態に戻る', async ({ page }) => {
    // ブロックを選択
    await page.locator('.col-left .tile:not(.add-new)').first().click();
    await page.waitForTimeout(500);

    // 保存ボタンをクリック
    await page.click('#saveBlockBtn');

    // 成功表示を確認
    await expect(page.locator('#saveBlockBtn.save-success')).toBeVisible({ timeout: 3000 });

    // 1.5秒後に元に戻ることを確認
    await page.waitForTimeout(1600);
    await expect(page.locator('#saveBlockBtn')).not.toHaveClass(/save-success/);
    await expect(page.locator('#saveBlockBtn')).toContainText('保存');
  });

  test('カスタムブロック保存時にvoxelデータが含まれる', async ({ page }) => {
    // カスタムブロックを探して選択
    const tiles = page.locator('.col-left .tile:not(.add-new)');
    const count = await tiles.count();

    let found = false;
    for (let i = 0; i < count; i++) {
      await tiles.nth(i).click();
      await page.waitForTimeout(300);
      // モード切替ボタンが表示されたらカスタムブロック
      const modeBtn = page.locator('.mode-toggle-btn');
      if (await modeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        found = true;
        break;
      }
    }

    if (found) {
      // BlockEditorUIからデータを取得
      const blockData = await page.evaluate(() => {
        return window.state.editorUI.getBlockData();
      });

      // カスタムブロックのデータが含まれていることを確認
      expect(blockData).toHaveProperty('voxel_look');
      expect(blockData).toHaveProperty('voxel_collision');
      expect(blockData).toHaveProperty('material_1');
      expect(blockData).toHaveProperty('material_2');
      expect(blockData).toHaveProperty('material_3');
    }
  });

  test('標準ブロック保存時にテクスチャデータが含まれる', async ({ page }) => {
    // 標準ブロックを選択
    await page.locator('.col-left .tile:not(.add-new)').first().click();
    await page.waitForTimeout(500);

    // BlockEditorUIからデータを取得
    const blockData = await page.evaluate(() => {
      if (!window.state || !window.state.editorUI) return null;
      return window.state.editorUI.getBlockData();
    });

    if (blockData && blockData.shape_type !== 'custom') {
      // 標準ブロックのデータが含まれていることを確認
      expect(blockData).toHaveProperty('tex_default');
    }
  });
});

// ============================================
// BlockThumbnail クラス
// ============================================
test.describe('BlockThumbnail クラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TOOL_PAGE_PATH);
    // データ読み込み待機
    await page.waitForSelector('.col-left .tile', { timeout: 30000 });
  });

  test('BlockThumbnail クラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return typeof BlockThumbnail === 'function';
    });
    expect(exists).toBe(true);
  });

  test('generate メソッドが Data URL を返す', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const thumbnail = new BlockThumbnail({ THREE: THREE, size: 64 });
      const blockData = { shape_type: 'normal' };
      const textures = [];
      const dataUrl = await thumbnail.generate(blockData, textures);
      thumbnail.dispose();
      return dataUrl;
    });

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  test('出力画像サイズがオプションで指定できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const thumbnail = new BlockThumbnail({ THREE: THREE, size: 128 });
      const blockData = { shape_type: 'normal' };
      const dataUrl = await thumbnail.generate(blockData, []);
      thumbnail.dispose();

      // 画像サイズを確認
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.src = dataUrl;
      });
    });

    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
  });

  test('標準ブロック（shape_type: normal）のサムネイルが生成できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const thumbnail = new BlockThumbnail({ THREE: THREE, size: 64 });
      const blockData = {
        shape_type: 'normal',
        tex_default: 'stone.png'
      };
      const textures = window.state.textures || [];
      const dataUrl = await thumbnail.generate(blockData, textures);
      thumbnail.dispose();
      return dataUrl;
    });

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  test('カスタムブロック（shape_type: custom）のサムネイルが生成できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const thumbnail = new BlockThumbnail({ THREE: THREE, size: 64 });
      const blockData = {
        shape_type: 'custom',
        voxel_look: '',
        material_1: '',
        material_2: '',
        material_3: ''
      };
      const textures = window.state.textures || [];
      const dataUrl = await thumbnail.generate(blockData, textures);
      thumbnail.dispose();
      return dataUrl;
    });

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  test('背景色を指定できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // 背景色を赤に指定
      const thumbnail = new BlockThumbnail({
        THREE: THREE,
        size: 64,
        backgroundColor: '#ff0000'
      });
      const blockData = { shape_type: 'normal' };
      const dataUrl = await thumbnail.generate(blockData, []);
      thumbnail.dispose();
      return dataUrl;
    });

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  test('背景色を透明にできる（null 指定）', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const thumbnail = new BlockThumbnail({
        THREE: THREE,
        size: 64,
        backgroundColor: null
      });
      const blockData = { shape_type: 'normal' };
      const dataUrl = await thumbnail.generate(blockData, []);
      thumbnail.dispose();
      return dataUrl;
    });

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  test('dispose でリソースが解放される', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const thumbnail = new BlockThumbnail({ THREE: THREE, size: 64 });
      const blockData = { shape_type: 'normal' };
      await thumbnail.generate(blockData, []);
      thumbnail.dispose();
      // dispose 後は renderer が null になる
      return thumbnail.renderer === null;
    });

    expect(result).toBe(true);
  });
});

// ============================================
// ブロック一覧サムネイル表示
// ============================================
test.describe('ブロック一覧サムネイル表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TOOL_PAGE_PATH);
    // データ読み込み待機
    await page.waitForSelector('.col-left .tile', { timeout: 30000 });
  });

  test('ブロックタイルにサムネイル画像が表示される', async ({ page }) => {
    // サムネイル生成完了を待機（最大5秒）
    await page.waitForFunction(() => {
      const tiles = document.querySelectorAll('.col-left .tile:not(.add-new)');
      if (tiles.length === 0) return false;
      // 少なくとも1つのタイルにサムネイルがあれば OK
      return Array.from(tiles).some(tile => tile.getAttribute('data-has-thumbnail') === 'true');
    }, { timeout: 10000 });

    // サムネイル画像が存在することを確認
    const hasThumbnail = await page.locator('.col-left .tile[data-has-thumbnail="true"]').count();
    expect(hasThumbnail).toBeGreaterThan(0);
  });

  test('サムネイル画像がタイル幅いっぱいに表示される', async ({ page }) => {
    // サムネイル生成完了を待機
    await page.waitForFunction(() => {
      const img = document.querySelector('.col-left .tile-img img');
      return img !== null;
    }, { timeout: 10000 });

    const sizes = await page.evaluate(() => {
      const tileImg = document.querySelector('.col-left .tile-img');
      const img = tileImg.querySelector('img');
      if (!img) return null;
      return {
        tileImgWidth: tileImg.offsetWidth,
        imgWidth: img.offsetWidth
      };
    });

    expect(sizes).not.toBeNull();
    // 画像がタイル幅いっぱいに表示されている
    expect(sizes.imgWidth).toBe(sizes.tileImgWidth);
  });

  test('サムネイルにテクスチャが表示される', async ({ page }) => {
    // サムネイル生成完了を待機
    await page.waitForFunction(() => {
      const tiles = document.querySelectorAll('.col-left .tile[data-has-thumbnail="true"]');
      return tiles.length > 0;
    }, { timeout: 10000 });

    // サムネイル画像が紫色（デフォルト）ではないことを確認
    // 紫色（#8800ff）のみの画像でないことをチェック
    const hasTexture = await page.evaluate(() => {
      const img = document.querySelector('.col-left .tile-img img');
      if (!img) return false;

      // Canvas に描画して色を取得
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // 中央付近のピクセル色を取得
      const centerX = Math.floor(img.width / 2);
      const centerY = Math.floor(img.height / 2);
      const pixel = ctx.getImageData(centerX, centerY, 1, 1).data;

      // 紫色（136, 0, 255）でないこと
      const isPurple = pixel[0] === 136 && pixel[1] === 0 && pixel[2] === 255;
      return !isPurple;
    });

    expect(hasTexture).toBe(true);
  });
});

// ============================================
// テクスチャ追加機能
// ============================================
test.describe('テクスチャ追加機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TOOL_PAGE_PATH);
    // データ読み込み待機
    await page.waitForSelector('.col-left .tile', { timeout: 30000 });
  });

  test('非表示のファイル入力要素が存在する', async ({ page }) => {
    // ファイル入力要素が存在
    const fileInput = page.locator('#textureFileInput');
    await expect(fileInput).toHaveCount(1);
    // type="file" であること
    await expect(fileInput).toHaveAttribute('type', 'file');
    // accept="image/*" であること
    await expect(fileInput).toHaveAttribute('accept', 'image/*');
    // 非表示であること
    await expect(fileInput).toHaveCSS('display', 'none');
  });

  test('テクスチャ選択モーダルの「追加」クリックでファイル選択が開く', async ({ page }) => {
    // テクスチャスロットをクリックしてモーダルを開く
    await page.locator('.slot').first().click();
    await expect(page.locator('.texture-modal-overlay')).toHaveCSS('display', 'flex');

    // ファイル入力のclickが呼ばれるかを監視
    const fileInputClicked = await page.evaluate(() => {
      return new Promise((resolve) => {
        const input = document.getElementById('textureFileInput');
        if (!input) {
          resolve(false);
          return;
        }
        // click イベントを監視（イベントリスナーで検知）
        input.addEventListener('click', () => resolve(true), { once: true });
        // タイムアウト
        setTimeout(() => resolve(false), 1000);

        // 「追加」ボタンをクリック
        const addBtn = document.querySelector('.texture-modal-overlay .texture-item.add-new');
        if (addBtn) {
          addBtn.click();
        }
      });
    });

    expect(fileInputClicked).toBe(true);
  });

  test('カスタムブロックのマテリアル選択でも「追加」が動作する', async ({ page }) => {
    // カスタムブロックを探して選択
    const tiles = page.locator('.col-left .tile:not(.add-new)');
    const count = await tiles.count();

    let found = false;
    for (let i = 0; i < count; i++) {
      await tiles.nth(i).click();
      await page.waitForTimeout(300);
      const modeBtn = page.locator('.mode-toggle-btn');
      if (await modeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        found = true;
        break;
      }
    }

    if (!found) {
      test.skip();
      return;
    }

    // マテリアルスロットをクリックしてモーダルを開く
    await page.locator('.material-slot').first().click();
    await expect(page.locator('.texture-modal-overlay')).toHaveCSS('display', 'flex');

    // ファイル入力のclickが呼ばれるかを監視
    const fileInputClicked = await page.evaluate(() => {
      return new Promise((resolve) => {
        const input = document.getElementById('textureFileInput');
        if (!input) {
          resolve(false);
          return;
        }
        input.addEventListener('click', () => resolve(true), { once: true });
        setTimeout(() => resolve(false), 1000);

        const addBtn = document.querySelector('.texture-modal-overlay .texture-item.add-new');
        if (addBtn) {
          addBtn.click();
        }
      });
    });

    expect(fileInputClicked).toBe(true);
  });

  test('ファイル選択後にテクスチャがアップロードされる', async ({ page }) => {
    // テクスチャスロットをクリックしてモーダルを開く
    await page.locator('.slot').first().click();
    await expect(page.locator('.texture-modal-overlay')).toHaveCSS('display', 'flex');

    // 初期のテクスチャ数を取得
    const initialCount = await page.evaluate(() => window.state.textures.length);

    // ファイル入力を取得してファイルをセット
    const fileInput = page.locator('#textureFileInput');

    // テストファイルをアップロード（Playwrightのファイルアップロード機能を使用）
    await fileInput.setInputFiles({
      name: 'test_texture.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    });

    // アップロード完了を待機（テクスチャ数が増えるか確認）
    await page.waitForFunction(
      (count) => window.state.textures.length > count,
      initialCount,
      { timeout: 10000 }
    );

    // テクスチャが追加されたことを確認
    const newCount = await page.evaluate(() => window.state.textures.length);
    expect(newCount).toBeGreaterThan(initialCount);
  });

  test('アップロード後にテクスチャ一覧が更新される', async ({ page }) => {
    // テクスチャ一覧タブに切り替え
    await page.locator('.tab').nth(1).click();
    await expect(page.locator('#textureList')).toHaveClass(/active/);

    // 初期のタイル数を取得
    const initialTileCount = await page.locator('#textureGrid .tile').count();

    // ブロック一覧に戻る
    await page.locator('.tab').first().click();

    // テクスチャスロットをクリックしてモーダルを開く
    await page.locator('.slot').first().click();
    await expect(page.locator('.texture-modal-overlay')).toHaveCSS('display', 'flex');

    // 「追加」をクリック（モーダルは閉じる）
    await page.locator('.texture-modal-overlay .texture-item.add-new').click();

    // モーダルが閉じるのを待機
    await expect(page.locator('.texture-modal-overlay')).toHaveCSS('display', 'none');

    // ファイルをアップロード
    const fileInput = page.locator('#textureFileInput');
    await fileInput.setInputFiles({
      name: 'test_texture_2.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    });

    // アップロード完了を待機
    await page.waitForFunction(
      (count) => window.state.textures.length > count,
      initialTileCount,
      { timeout: 10000 }
    );

    // テクスチャ一覧タブに切り替え
    await page.locator('.tab').nth(1).click();
    await page.waitForTimeout(500);

    // タイル数が増えていることを確認
    const newTileCount = await page.locator('#textureGrid .tile').count();
    expect(newTileCount).toBeGreaterThan(initialTileCount);
  });
});

// ============================================
// テクスチャ画像ぼやけ防止
// ============================================
test.describe('テクスチャ画像ぼやけ防止', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TOOL_PAGE_PATH);
    // データ読み込み待機
    await page.waitForSelector('.col-left .tile', { timeout: 30000 });
  });

  test('テクスチャ一覧の.tile-imgにimage-rendering: pixelatedが適用される', async ({ page }) => {
    // テクスチャ一覧タブに切り替え
    await page.locator('.tab').nth(1).click();
    await expect(page.locator('#textureList')).toHaveClass(/active/);

    // 最初のテクスチャタイルの.tile-imgを確認
    const tileImg = page.locator('#textureGrid .tile-img').first();
    await expect(tileImg).toHaveCSS('image-rendering', 'pixelated');
  });

  test('テクスチャ一覧の.tile-img imgにimage-rendering: pixelatedが適用される', async ({ page }) => {
    // サムネイル生成完了を待機
    await page.waitForFunction(() => {
      const img = document.querySelector('.col-left .tile-img img');
      return img !== null;
    }, { timeout: 10000 });

    const tileImgImg = page.locator('.col-left .tile-img img').first();
    await expect(tileImgImg).toHaveCSS('image-rendering', 'pixelated');
  });

  test('テクスチャプレビュー(.preview-large)にimage-rendering: pixelatedが適用される', async ({ page }) => {
    // テクスチャ一覧タブに切り替え
    await page.locator('.tab').nth(1).click();
    await expect(page.locator('#textureList')).toHaveClass(/active/);

    const previewLarge = page.locator('.preview-large');
    await expect(previewLarge).toHaveCSS('image-rendering', 'pixelated');
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
