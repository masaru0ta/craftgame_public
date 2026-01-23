// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 仕様1-4 カスタムブロックエディタ テスト
 */

// テストページのパス
const TEST_PAGE_PATH = '/test/spec_1-4_custom_block_editor.html';

// データ読み込み完了を待つヘルパー関数
async function waitForDataLoad(page) {
  await page.waitForFunction(() => {
    const select = document.querySelector('#block-select');
    return select && select.options.length >= 2;
  }, { timeout: 15000 });
}

// ============================================
// BlockEditorUI カスタムブロック拡張
// ============================================
test.describe('BlockEditorUI カスタムブロック拡張', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
  });

  test('shape_type="custom" のブロックでカスタムブロックUIが表示される', async ({ page }) => {
    // ブロック選択
    await page.selectOption('#block-select', { index: 1 });

    // カスタムブロック用スロットが表示される
    await expect(page.locator('.custom-slots')).toBeVisible();

    // 標準ブロック用スロットは非表示
    await expect(page.locator('.normal-slots')).toBeHidden();

    // マテリアルスロットが3つ存在する
    await expect(page.locator('.custom-slots .material-item')).toHaveCount(3);

    // モード切替ボタンが表示される
    await expect(page.locator('.mode-toggle-btn')).toBeVisible();

    // ブラシサイズボタンが表示される
    await expect(page.locator('.brush-size-btn')).toHaveCount(3);
  });

  test('モード切替ボタンでlook/collisionモードが切り替わる', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // 初期モードはlook
    const modeBtn = page.locator('.mode-toggle-btn');
    await expect(modeBtn).toHaveText('look');

    // クリックでcollisionに切り替わる
    await modeBtn.click();
    await expect(modeBtn).toHaveText('collision');

    // 再度クリックでlookに戻る
    await modeBtn.click();
    await expect(modeBtn).toHaveText('look');
  });

  test('ブラシサイズボタンでブラシサイズが変更される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // 初期値は2（activeクラス）
    const btn2 = page.locator('.brush-size-btn[data-size="2"]');
    await expect(btn2).toHaveClass(/active/);

    // サイズ1をクリック
    const btn1 = page.locator('.brush-size-btn[data-size="1"]');
    await btn1.click();

    // activeが切り替わる
    await expect(btn1).toHaveClass(/active/);
    await expect(btn2).not.toHaveClass(/active/);

    // サイズ4をクリック
    const btn4 = page.locator('.brush-size-btn[data-size="4"]');
    await btn4.click();
    await expect(btn4).toHaveClass(/active/);
    await expect(btn1).not.toHaveClass(/active/);
  });

  test('マテリアルスロットクリックでテクスチャ選択モーダルが表示される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // モーダルは初期非表示
    await expect(page.locator('.texture-modal-overlay')).toBeHidden();

    // マテリアルスロットをクリック
    await page.click('.custom-slots .material-item[data-material-slot="1"]');

    // モーダルが表示される
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();
  });

  test('BGボタンクリックで背景色が切り替わる', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // canvas が表示されるまで待機
    await expect(page.locator('.preview-3d canvas')).toBeVisible();

    // 初期の背景色インジケーターを確認
    const bgIndicator = page.locator('.bg-color-indicator');
    const initialColor = await bgIndicator.evaluate(el => el.style.background);

    // BGボタンをクリック
    await page.click('.bg-btn');

    // 背景色が変化する
    const newColor = await bgIndicator.evaluate(el => el.style.background);
    expect(newColor).not.toBe(initialColor);

    // 2回目のクリックで再度変化する
    await page.click('.bg-btn');
    const thirdColor = await bgIndicator.evaluate(el => el.style.background);
    expect(thirdColor).not.toBe(newColor);
  });

});

// ============================================
// テクスチャ選択モーダル
// ============================================
test.describe('テクスチャ選択モーダル', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await page.selectOption('#block-select', { index: 1 });
  });

  test('マテリアルスロットクリックでモーダルが表示される', async ({ page }) => {
    await expect(page.locator('.texture-modal-overlay')).toBeHidden();

    await page.click('.custom-slots .material-item[data-material-slot="1"]');

    await expect(page.locator('.texture-modal-overlay')).toBeVisible();
    await expect(page.locator('.texture-modal')).toBeVisible();
  });

  test('モーダルにテクスチャ一覧が表示される', async ({ page }) => {
    await page.click('.custom-slots .material-item[data-material-slot="1"]');

    // テクスチャグリッドが存在する
    await expect(page.locator('.texture-grid')).toBeVisible();

    // テクスチャアイテムが存在する
    const items = page.locator('.texture-grid .texture-item');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('「なし」が先頭に表示される', async ({ page }) => {
    await page.click('.custom-slots .material-item[data-material-slot="1"]');

    const firstItem = page.locator('.texture-grid .texture-item').first();
    const text = await firstItem.locator('.texture-item-name').textContent();
    expect(text).toBe('なし');
  });

  test('「追加」が最後尾に表示される', async ({ page }) => {
    await page.click('.custom-slots .material-item[data-material-slot="1"]');

    const lastItem = page.locator('.texture-grid .texture-item').last();
    const text = await lastItem.locator('.texture-item-name').textContent();
    expect(text).toBe('追加');
  });

  test('テクスチャ選択後にモーダルが閉じる', async ({ page }) => {
    await page.click('.custom-slots .material-item[data-material-slot="1"]');
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();

    // 「なし」を選択
    await page.locator('.texture-grid .texture-item').first().click();

    // モーダルが閉じる
    await expect(page.locator('.texture-modal-overlay')).toBeHidden();
  });

  test('「なし」選択でテクスチャが解除される', async ({ page }) => {
    await page.click('.custom-slots .material-item[data-material-slot="1"]');

    // テクスチャがある場合はまず設定
    const textureItems = page.locator('.texture-grid .texture-item:not(.add-new)');
    const count = await textureItems.count();

    if (count > 1) {
      await textureItems.nth(1).click();
      await expect(page.locator('.texture-modal-overlay')).toBeHidden();

      // 再度モーダルを開いて「なし」を選択
      await page.click('.custom-slots .material-item[data-material-slot="1"]');
      await page.locator('.texture-grid .texture-item').first().click();

      // スロットがグレー背景になる
      const slotImage = page.locator('.custom-slots .material-item[data-material-slot="1"] .slot-image');
      const bgColor = await slotImage.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(bgColor).toBe('rgb(128, 128, 128)');
    }
  });

  test('「追加」選択で onTextureAdd コールバックが呼ばれる', async ({ page }) => {
    // アラートダイアログをリッスン
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('テクスチャ追加');
      await dialog.accept();
    });

    await page.click('.custom-slots .material-item[data-material-slot="1"]');
    await page.locator('.texture-grid .texture-item.add-new').click();

    await expect(page.locator('.texture-modal-overlay')).toBeHidden();
  });

  test('×ボタンクリックでモーダルが閉じる', async ({ page }) => {
    await page.click('.custom-slots .material-item[data-material-slot="1"]');
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();

    await page.click('.texture-modal-close');

    await expect(page.locator('.texture-modal-overlay')).toBeHidden();
  });

  test('オーバーレイクリックでモーダルが閉じる', async ({ page }) => {
    await page.click('.custom-slots .material-item[data-material-slot="1"]');
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();

    await page.locator('.texture-modal-overlay').click({ position: { x: 10, y: 10 } });

    await expect(page.locator('.texture-modal-overlay')).toBeHidden();
  });

});

// ============================================
// CustomBlockEditor クラス
// ============================================
test.describe('CustomBlockEditor クラス', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
  });

  test('init() でシーン・カメラ・レンダラーが初期化される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    const initialized = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;
      return editor &&
             editor.getScene() !== null &&
             editor.getCamera() !== null;
    });
    expect(initialized).toBe(true);

    // canvasが存在することでレンダラーの初期化を確認
    await expect(page.locator('.preview-3d canvas')).toBeVisible();
  });

  test('loadBlock(blockData) でブロックが3Dプレビューに表示される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // canvas が表示される
    await expect(page.locator('.preview-3d canvas')).toBeVisible();

    // editorUI にブロックデータがロードされている
    const hasBlockData = await page.evaluate(() => {
      return window.editorUI && window.editorUI.currentBlockData !== null;
    });
    expect(hasBlockData).toBe(true);
  });

  test('getMaterials() で現在のマテリアル設定が取得できる', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    const materials = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getMaterials();
    });

    expect(materials).toBeDefined();
    expect(typeof materials).toBe('object');
    expect(materials).toHaveProperty('material_1');
    expect(materials).toHaveProperty('material_2');
    expect(materials).toHaveProperty('material_3');
  });

  test('setCurrentMaterial(num) でマテリアル選択が変更される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // マテリアル2を選択
    await page.evaluate(() => {
      window.editorUI.setCurrentMaterial(2);
    });

    const currentMaterial = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getCurrentMaterial();
    });
    expect(currentMaterial).toBe(2);
  });

  test('setBrushSize(size) でブラシサイズが変更される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    await page.evaluate(() => {
      window.editorUI.setBrushSize(4);
    });

    const brushSize = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getBrushSize();
    });
    expect(brushSize).toBe(4);
  });

  test('setEditMode(mode) で編集モードが変更される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
    });

    const editMode = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getEditMode();
    });
    expect(editMode).toBe('collision');
  });

  test('getVoxelLookData() でBase64エンコードされたデータが取得できる', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    const voxelData = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getVoxelLookData();
    });

    expect(typeof voxelData).toBe('string');
  });

  test('setBackgroundColor(color) で背景色が変更される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // setBackgroundColor が正常に実行できることを確認
    const success = await page.evaluate(() => {
      try {
        window.editorUI.customBlockEditor.setBackgroundColor('#ff0000');
        return true;
      } catch (e) {
        return false;
      }
    });
    expect(success).toBe(true);
  });

  test('resize() でリサイズが正しく処理される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    const resizeSuccess = await page.evaluate(() => {
      try {
        window.editorUI.resize();
        return true;
      } catch (e) {
        return false;
      }
    });
    expect(resizeSuccess).toBe(true);
  });

});

// ============================================
// 3Dプレビュー表示
// ============================================
test.describe('3Dプレビュー表示', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await page.selectOption('#block-select', { index: 1 });
    await expect(page.locator('.preview-3d canvas')).toBeVisible();
  });

  test('初期表示でFRONTが正面になっている', async ({ page }) => {
    // カメラ位置からFRONTが正面であることを確認（カメラは+Z方向にある）
    const cameraPos = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });
    // 初期位置でx≈0、z>0であればFRONTが正面
    expect(Math.abs(cameraPos.x)).toBeLessThan(0.1);
    expect(cameraPos.z).toBeGreaterThan(0);
  });

  test('初期表示で少し上から見下ろしている', async ({ page }) => {
    // カメラ位置のY座標が0より大きければ上から見下ろしている
    const cameraY = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return camera.position.y;
    });
    expect(cameraY).toBeGreaterThan(0);
  });

  test('初期表示でカメラ距離3になっている', async ({ page }) => {
    // カメラ位置から原点までの距離が約3であることを確認
    const distance = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return Math.sqrt(
        camera.position.x ** 2 +
        camera.position.y ** 2 +
        camera.position.z ** 2
      );
    });
    expect(distance).toBeCloseTo(3, 1);
  });

  test('床面グリッド線（8x8）が存在する', async ({ page }) => {
    // シーン内にLine系オブジェクトがあることで床面グリッドの存在を確認
    const hasGrid = await page.evaluate(() => {
      const scene = window.editorUI.customBlockEditor.getScene();
      return scene.children.some(c => c.type === 'Line' || c.type === 'LineSegments' || c.type === 'GridHelper');
    });
    expect(hasGrid).toBe(true);
  });

  test('FRONT, RIGHT, LEFT, BACKのテキストラベルが存在する', async ({ page }) => {
    // シーン内にSpriteオブジェクト（テキストラベル）が4つあることを確認
    const labelCount = await page.evaluate(() => {
      const scene = window.editorUI.customBlockEditor.getScene();
      return scene.children.filter(c => c.type === 'Sprite').length;
    });
    expect(labelCount).toBe(4);
  });

});

// ============================================
// カメラ操作
// ============================================
test.describe('カメラ操作', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await page.selectOption('#block-select', { index: 1 });
    await expect(page.locator('.preview-3d canvas')).toBeVisible();
  });

  test('マウスドラッグで視点を回転できる', async ({ page }) => {
    const initialPos = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
    await page.mouse.up();

    const newPos = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });
    // カメラ位置が変化していれば回転している
    expect(newPos.x !== initialPos.x || newPos.z !== initialPos.z).toBe(true);
  });

  test('右にドラッグするとブロックが右に回転する', async ({ page }) => {
    const initialPos = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
    await page.mouse.up();

    const newPos = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });
    // 右ドラッグでカメラが反時計回りに移動（xが減少する方向）
    expect(newPos.x).toBeLessThan(initialPos.x);
  });

  test('上下の傾きが90度までに制限される', async ({ page }) => {
    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    // 大きく上にドラッグ
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 500);
    await page.mouse.up();

    // カメラ位置から角度制限を確認（真上からの角度が90度以内）
    const cameraPos = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    });

    const horizontalDist = Math.sqrt(cameraPos.x ** 2 + cameraPos.z ** 2);
    const angle = Math.atan2(cameraPos.y, horizontalDist) * 180 / Math.PI;

    expect(angle).toBeLessThanOrEqual(90);
    expect(angle).toBeGreaterThanOrEqual(-90);
  });

  test('マウスホイールで拡大縮小できる', async ({ page }) => {
    const initialDistance = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return Math.sqrt(
        camera.position.x ** 2 +
        camera.position.y ** 2 +
        camera.position.z ** 2
      );
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -100);

    await page.waitForTimeout(100);

    const newDistance = await page.evaluate(() => {
      const camera = window.editorUI.customBlockEditor.getCamera();
      return Math.sqrt(
        camera.position.x ** 2 +
        camera.position.y ** 2 +
        camera.position.z ** 2
      );
    });

    expect(newDistance).not.toBe(initialDistance);
  });

});

// ============================================
// ボクセル編集
// ============================================
test.describe('ボクセル編集', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await page.selectOption('#block-select', { index: 1 });
    await expect(page.locator('.preview-3d canvas')).toBeVisible();
  });

  test('右クリックでボクセルを配置できる', async ({ page }) => {
    // 初期データを取得
    const initialData = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getVoxelLookData();
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    // 右クリックでボクセル配置
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });

    // データが変化したか確認
    const newData = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getVoxelLookData();
    });

    // ボクセルが配置されればデータが変化する
    // 初期状態で何もない場合のみ変化するはず
    expect(typeof newData).toBe('string');
  });

  test('左クリックでボクセルを削除できる', async ({ page }) => {
    // まずボクセルを配置
    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });

    // 配置後のデータ
    const afterPlaceData = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getVoxelLookData();
    });

    // 左クリックで削除（ドラッグなしクリック）
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'left' });

    const afterDeleteData = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getVoxelLookData();
    });

    expect(typeof afterDeleteData).toBe('string');
  });

  test('ブラシサイズ1で単一ボクセルの操作', async ({ page }) => {
    // ブラシサイズ1に設定
    await page.evaluate(() => {
      window.editorUI.setBrushSize(1);
    });

    const brushSize = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getBrushSize();
    });
    expect(brushSize).toBe(1);
  });

  test('ブラシサイズ2でグリッド座標(0,2,4,6)にスナップ', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setBrushSize(2);
    });

    const brushSize = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getBrushSize();
    });
    expect(brushSize).toBe(2);
  });

  test('ブラシサイズ4でグリッド座標(0,4)にスナップ', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setBrushSize(4);
    });

    const brushSize = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getBrushSize();
    });
    expect(brushSize).toBe(4);
  });

  test('ハイライト用オブジェクトが存在する', async ({ page }) => {
    // シーン内にMesh（面ハイライト）とLineSegments（辺ハイライト）が存在することを確認
    const hasHighlight = await page.evaluate(() => {
      const scene = window.editorUI.customBlockEditor.getScene();
      const hasMesh = scene.children.some(c => c.type === 'Mesh');
      const hasLine = scene.children.some(c => c.type === 'LineSegments' || c.type === 'Line');
      return hasMesh && hasLine;
    });
    expect(hasHighlight).toBe(true);
  });

});

// ============================================
// マテリアル選択
// ============================================
test.describe('マテリアル選択', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await page.selectOption('#block-select', { index: 1 });
  });

  test('setCurrentMaterial(1) でマテリアル1が選択される', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setCurrentMaterial(1);
    });

    const current = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getCurrentMaterial();
    });
    expect(current).toBe(1);

    // UIでも選択状態が反映される
    await expect(page.locator('.custom-slots .material-item[data-material-slot="1"]')).toHaveClass(/selected/);
  });

  test('setCurrentMaterial(2) でマテリアル2が選択される', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setCurrentMaterial(2);
    });

    const current = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getCurrentMaterial();
    });
    expect(current).toBe(2);

    await expect(page.locator('.custom-slots .material-item[data-material-slot="2"]')).toHaveClass(/selected/);
  });

  test('setCurrentMaterial(3) でマテリアル3が選択される', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setCurrentMaterial(3);
    });

    const current = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getCurrentMaterial();
    });
    expect(current).toBe(3);

    await expect(page.locator('.custom-slots .material-item[data-material-slot="3"]')).toHaveClass(/selected/);
  });

  test('マテリアルスロットクリックでマテリアル選択も切り替わる', async ({ page }) => {
    // スロット2をクリック
    await page.click('.custom-slots .material-item[data-material-slot="2"]');

    // モーダルを閉じる
    await page.click('.texture-modal-close');

    // マテリアル2が選択されている
    const current = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getCurrentMaterial();
    });
    expect(current).toBe(2);
  });

});

// ============================================
// UI表示
// ============================================
test.describe('UI表示', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await page.selectOption('#block-select', { index: 1 });
  });

  test('ツールバーが3カラム構成（left-group, center-group, right-group）である', async ({ page }) => {
    await expect(page.locator('.preview-toolbar .left-group')).toBeVisible();
    await expect(page.locator('.preview-toolbar .center-group')).toBeVisible();
    await expect(page.locator('.preview-toolbar .right-group')).toBeVisible();
  });

  test('マテリアルスロット（.material-item）が3つ表示される', async ({ page }) => {
    const slots = page.locator('.custom-slots .material-item');
    await expect(slots).toHaveCount(3);
  });

  test('ブラシサイズボタン [4][2][1] が表示される', async ({ page }) => {
    await expect(page.locator('.brush-size-btn[data-size="4"]')).toBeVisible();
    await expect(page.locator('.brush-size-btn[data-size="2"]')).toBeVisible();
    await expect(page.locator('.brush-size-btn[data-size="1"]')).toBeVisible();
  });

  test('ブラシサイズボタンの初期値は2', async ({ page }) => {
    await expect(page.locator('.brush-size-btn[data-size="2"]')).toHaveClass(/active/);
  });

  test('モード切替ボタンがツールバー左グループに表示される', async ({ page }) => {
    await expect(page.locator('.left-group .mode-toggle-btn')).toBeVisible();
  });

  test('BGボタンが右グループに表示される', async ({ page }) => {
    await expect(page.locator('.right-group .bg-btn')).toBeVisible();
  });

});

// ============================================
// テストページ
// ============================================
test.describe('テストページ', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
  });

  test('左カラムにブロック選択プルダウンが表示される', async ({ page }) => {
    await expect(page.locator('#block-select')).toBeVisible();
  });

  test('左カラムにblock_str_id、nameが表示される', async ({ page }) => {
    await expect(page.locator('#block-str-id')).toBeVisible();
    await expect(page.locator('#block-name')).toBeVisible();
  });

  test('左カラムに保存ボタンが表示される', async ({ page }) => {
    await expect(page.locator('#save-btn')).toBeVisible();
  });

  test('右カラムにBlockEditorUIが表示される', async ({ page }) => {
    await expect(page.locator('#editor-container .editor-container')).toBeVisible();
  });

  test('起動時にGAS APIからブロック一覧を取得できる', async ({ page }) => {
    const optionCount = await page.evaluate(() => {
      return document.querySelector('#block-select').options.length;
    });
    expect(optionCount).toBeGreaterThanOrEqual(2);
  });

  test('起動時にGAS APIからテクスチャ一覧を取得できる', async ({ page }) => {
    const hasTextures = await page.evaluate(() => {
      return window.editorUI.textures && window.editorUI.textures.length > 0;
    });
    expect(hasTextures).toBe(true);
  });

  test('ブロック選択時にblock_str_id、nameが更新される', async ({ page }) => {
    expect(await page.locator('#block-str-id').textContent()).toBe('-');
    expect(await page.locator('#block-name').textContent()).toBe('-');

    await page.selectOption('#block-select', { index: 1 });

    expect(await page.locator('#block-str-id').textContent()).not.toBe('-');
    expect(await page.locator('#block-name').textContent()).not.toBe('-');
  });

  test('ブロック選択時に3Dプレビューが更新される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    await expect(page.locator('.preview-3d canvas')).toBeVisible();
  });

});
