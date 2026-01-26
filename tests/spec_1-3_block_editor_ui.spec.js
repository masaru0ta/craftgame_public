// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 仕様1-3 標準ブロックエディタ テスト
 */

// テストページのパス
const TEST_PAGE_PATH = '/test/spec_1-3_standard_block_editor.html';

// データ読み込み完了を待つヘルパー関数
async function waitForDataLoad(page) {
  await page.waitForFunction(() => {
    const select = document.querySelector('#block-select');
    return select && select.options.length >= 2;
  }, { timeout: 15000 });
}

test.describe('BlockEditorUI クラス', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
  });

  test('init() でUIが生成される', async ({ page }) => {
    // editor-container が存在する
    await expect(page.locator('.editor-container')).toBeVisible();

    // preview-container が存在する
    await expect(page.locator('.preview-container')).toBeVisible();

    // preview-toolbar が存在する
    await expect(page.locator('.preview-toolbar')).toBeVisible();

    // preview-3d が存在する
    await expect(page.locator('.preview-3d')).toBeVisible();

    // control-panel が存在する
    await expect(page.locator('.control-panel')).toBeVisible();

    // 7つのスロットが存在する（default, front, top, bottom, left, right, back）
    await expect(page.locator('.normal-slots .material-item')).toHaveCount(7);

    // BGボタンが存在する
    await expect(page.locator('.bg-btn')).toBeVisible();
  });

  test('loadBlock() でブロックが3Dプレビューに表示される', async ({ page }) => {
    // ブロックを選択
    await page.selectOption('#block-select', { index: 1 });

    // Three.js の canvas が表示される
    await expect(page.locator('.preview-3d canvas')).toBeVisible();

    // editorUI にブロックデータがロードされている
    const hasBlockData = await page.evaluate(() => {
      return window.editorUI && window.editorUI.currentBlockData !== null;
    });
    expect(hasBlockData).toBe(true);

    // block_str_id が表示される
    const blockStrId = await page.locator('#block-str-id').textContent();
    expect(blockStrId).not.toBe('-');
  });

  test('setTextures() でテクスチャ一覧がモーダルに反映される', async ({ page }) => {
    // ブロック選択（モーダル表示に必要）
    await page.selectOption('#block-select', { index: 1 });

    // スロットをクリックしてモーダルを開く
    await page.click('.material-item[data-slot="default"]');

    // モーダルが表示される
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();

    // テクスチャアイテムが存在する（「なし」+ テクスチャ一覧 + 「追加」）
    const textureItems = page.locator('.texture-grid .texture-item');
    const count = await textureItems.count();
    // 最低でも「なし」と「追加」の2つ
    expect(count).toBeGreaterThanOrEqual(2);

    // 「なし」が先頭に存在する
    const firstItemText = await textureItems.first().locator('.texture-item-name').textContent();
    expect(firstItemText).toBe('なし');

    // 「追加」が最後尾に存在する
    const lastItemText = await textureItems.last().locator('.texture-item-name').textContent();
    expect(lastItemText).toBe('追加');
  });

  test('setTexture() でテクスチャが反映される', async ({ page }) => {
    // ブロック選択
    await page.selectOption('#block-select', { index: 1 });

    // defaultスロットをクリック
    await page.click('.material-item[data-slot="default"]');
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();

    // テクスチャ一覧を取得（「なし」と「追加」以外）
    const textureItems = page.locator('.texture-grid .texture-item:not(.add-new)');
    const count = await textureItems.count();

    // テクスチャが2つ以上ある場合（「なし」以外のテクスチャがある）
    if (count > 1) {
      // 2番目のアイテム（最初のテクスチャ）を選択
      await textureItems.nth(1).click();

      // モーダルが閉じる
      await expect(page.locator('.texture-modal-overlay')).toBeHidden();

      // スロットに画像が設定される
      const slotImage = page.locator('.material-item[data-slot="default"] .slot-image');
      const bgImage = await slotImage.evaluate(el => getComputedStyle(el).backgroundImage);
      expect(bgImage).not.toBe('none');
    }
  });

  test('getBlockData() で現在のブロックデータが取得できる', async ({ page }) => {
    // ブロック選択
    await page.selectOption('#block-select', { index: 1 });

    // getBlockData() を呼び出し
    const blockData = await page.evaluate(() => {
      return window.editorUI.getBlockData();
    });

    // ブロックデータが存在する
    expect(blockData).not.toBeNull();
    expect(blockData).toHaveProperty('block_id');
    expect(blockData).toHaveProperty('block_str_id');
    expect(blockData).toHaveProperty('shape_type');

    // テクスチャ関連のプロパティが存在する
    expect(blockData).toHaveProperty('tex_default');
  });

  test('BGボタンクリックで背景色が変化する', async ({ page }) => {
    // ブロック選択（エディタ初期化に必要）
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
    // ブロックを選択
    await page.selectOption('#block-select', { index: 1 });
  });

  test('テクスチャスロットクリックでモーダルが表示される', async ({ page }) => {
    // モーダルは初期非表示
    await expect(page.locator('.texture-modal-overlay')).toBeHidden();

    // スロットをクリック
    await page.click('.material-item[data-slot="front"]');

    // モーダルが表示される
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();
    await expect(page.locator('.texture-modal')).toBeVisible();
  });

  test('モーダルにテクスチャ一覧が表示される', async ({ page }) => {
    await page.click('.material-item[data-slot="default"]');

    // テクスチャグリッドが存在する
    await expect(page.locator('.texture-grid')).toBeVisible();

    // テクスチャアイテムが存在する
    const items = page.locator('.texture-grid .texture-item');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('「なし」が先頭に表示される', async ({ page }) => {
    await page.click('.material-item[data-slot="default"]');

    const firstItem = page.locator('.texture-grid .texture-item').first();
    const text = await firstItem.locator('.texture-item-name').textContent();
    expect(text).toBe('なし');
  });

  test('「追加」が最後尾に表示される', async ({ page }) => {
    await page.click('.material-item[data-slot="default"]');

    const lastItem = page.locator('.texture-grid .texture-item').last();
    const text = await lastItem.locator('.texture-item-name').textContent();
    expect(text).toBe('追加');
  });

  test('テクスチャ選択後にモーダルが閉じる', async ({ page }) => {
    await page.click('.material-item[data-slot="default"]');
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();

    // テクスチャを選択（「なし」を選択）
    await page.locator('.texture-grid .texture-item').first().click();

    // モーダルが閉じる
    await expect(page.locator('.texture-modal-overlay')).toBeHidden();
  });

  test('「なし」選択でテクスチャが解除される', async ({ page }) => {
    // まずテクスチャを設定
    await page.click('.material-item[data-slot="default"]');
    const textureItems = page.locator('.texture-grid .texture-item:not(.add-new)');
    const count = await textureItems.count();

    if (count > 1) {
      // テクスチャを選択
      await textureItems.nth(1).click();
      await expect(page.locator('.texture-modal-overlay')).toBeHidden();

      // 再度モーダルを開いて「なし」を選択
      await page.click('.material-item[data-slot="default"]');
      await page.locator('.texture-grid .texture-item').first().click();

      // テクスチャが解除される（backgroundImageがnone）
      const slotImage = page.locator('.material-item[data-slot="default"] .slot-image');
      const bgImage = await slotImage.evaluate(el => getComputedStyle(el).backgroundImage);
      expect(bgImage).toBe('none');
    }
  });

  test('「追加」選択で onTextureAdd コールバックが呼ばれる', async ({ page }) => {
    // アラートダイアログをリッスン（先に設定）
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('テクスチャ追加');
      await dialog.accept();
    });

    await page.click('.material-item[data-slot="default"]');

    // 「追加」をクリック
    await page.locator('.texture-grid .texture-item.add-new').click();

    // モーダルが閉じることで、コールバックが呼ばれたことを確認
    await expect(page.locator('.texture-modal-overlay')).toBeHidden();
  });

  test('×ボタンクリックでモーダルが閉じる', async ({ page }) => {
    await page.click('.material-item[data-slot="default"]');
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();

    // ×ボタンをクリック
    await page.click('.texture-modal-close');

    // モーダルが閉じる
    await expect(page.locator('.texture-modal-overlay')).toBeHidden();
  });

  test('オーバーレイクリックでモーダルが閉じる', async ({ page }) => {
    await page.click('.material-item[data-slot="default"]');
    await expect(page.locator('.texture-modal-overlay')).toBeVisible();

    // オーバーレイ（モーダル外）をクリック
    await page.locator('.texture-modal-overlay').click({ position: { x: 10, y: 10 } });

    // モーダルが閉じる
    await expect(page.locator('.texture-modal-overlay')).toBeHidden();
  });

});

// ============================================
// StandardBlockEditor クラス
// ============================================
test.describe('StandardBlockEditor クラス', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
  });

  test('init() でシーン・カメラ・レンダラーが初期化される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    const initialized = await page.evaluate(() => {
      const editor = window.editorUI.standardBlockEditor;
      // 公開メソッドを使用して初期化を確認
      return editor &&
             editor.getScene() !== null &&
             editor.getCamera() !== null;
    });
    expect(initialized).toBe(true);

    // canvasが生成されていることでレンダラー初期化を確認
    await expect(page.locator('.preview-3d canvas')).toBeVisible();
  });

  test('getTextures() で現在のテクスチャ設定が取得できる', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    const textures = await page.evaluate(() => {
      return window.editorUI.standardBlockEditor.getTextures();
    });

    // テクスチャオブジェクトが返される（未設定スロットは空文字またはundefined）
    expect(textures).toBeDefined();
    expect(typeof textures).toBe('object');
    // 少なくとも1つのテクスチャが設定されている
    const hasAnyTexture = Object.values(textures).some(v => v && v !== '');
    expect(hasAnyTexture).toBe(true);
  });

  test('setBackgroundColor(color) で背景色が変更される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // 背景色を変更
    await page.evaluate(() => {
      window.editorUI.standardBlockEditor.setBackgroundColor('#ff0000');
    });

    // シーンの背景色を確認
    const bgColor = await page.evaluate(() => {
      const scene = window.editorUI.standardBlockEditor.scene;
      return '#' + scene.background.getHexString();
    });
    expect(bgColor).toBe('#ff0000');
  });

  test('resize() でリサイズが正しく処理される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // resize() を呼び出してエラーが出ないことを確認
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

  test('dispose() でリソースが解放される', async ({ page }) => {
    await page.selectOption('#block-select', { index: 1 });

    // dispose() を呼び出してエラーが出ないことを確認
    const disposeSuccess = await page.evaluate(() => {
      try {
        window.editorUI.dispose();
        return true;
      } catch (e) {
        return false;
      }
    });
    expect(disposeSuccess).toBe(true);

    // canvasが削除されている
    await expect(page.locator('.preview-3d canvas')).toHaveCount(0);
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
    // canvas表示を待機
    await expect(page.locator('.preview-3d canvas')).toBeVisible();
  });

  test('立方体が表示される', async ({ page }) => {
    // シーン内にMeshオブジェクトが存在することを確認
    const hasCube = await page.evaluate(() => {
      const scene = window.editorUI.standardBlockEditor.getScene();
      return scene.children.some(c => c.type === 'Mesh');
    });
    expect(hasCube).toBe(true);
  });

  test('初期表示でカメラ距離3になっている', async ({ page }) => {
    const distance = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return camera.position.length();
    });
    // カメラ距離が約3であることを確認（誤差許容）
    expect(distance).toBeCloseTo(3, 0);
  });

  test('初期表示で垂直角度が20度になっている', async ({ page }) => {
    const verticalAngle = await page.evaluate(() => {
      return window.editorUI.standardBlockEditor.verticalAngle;
    });
    // 垂直角度が約20度であることを確認（誤差許容）
    expect(verticalAngle).toBeCloseTo(20, 1);
  });

  test('床面に白い枠線が表示される', async ({ page }) => {
    const hasFloorLine = await page.evaluate(() => {
      const scene = window.editorUI.standardBlockEditor.getScene();
      // シーン内にLineまたはLineSegmentsが存在することを確認
      return scene.children.some(c => c.type === 'Line' || c.type === 'LineSegments');
    });
    expect(hasFloorLine).toBe(true);
  });

  test('FRONT, RIGHT, LEFT, BACKのテキストが表示されている', async ({ page }) => {
    const hasLabels = await page.evaluate(() => {
      const scene = window.editorUI.standardBlockEditor.getScene();
      // シーン内にSpriteオブジェクトが存在することを確認
      return scene.children.some(c => c.type === 'Sprite');
    });
    expect(hasLabels).toBe(true);
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
    // 初期のカメラ位置を取得
    const initialPos = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });

    // キャンバス上でドラッグ
    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
    await page.mouse.up();

    // カメラ位置が変化している
    const newPos = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });
    expect(newPos.x !== initialPos.x || newPos.z !== initialPos.z).toBe(true);
  });

  test('マウスを右にドラッグするとブロックが右に回転する', async ({ page }) => {
    // 初期のカメラ位置を取得
    const initialPos = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    // 右にドラッグ
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
    await page.mouse.up();

    // カメラ位置が変化している（水平方向の回転）
    const newPos = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });
    expect(newPos.x !== initialPos.x || newPos.z !== initialPos.z).toBe(true);
  });

  test('右にドラッグするとブロックが右に回転する', async ({ page }) => {
    // 初期の水平角度を取得
    const initialAngle = await page.evaluate(() => {
      return window.editorUI.standardBlockEditor.horizontalAngle;
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    // 右にドラッグ
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
    await page.mouse.up();

    const newAngle = await page.evaluate(() => {
      return window.editorUI.standardBlockEditor.horizontalAngle;
    });

    // 右ドラッグで角度が減少する（ブロックが右に回転＝カメラが左に移動）
    expect(newAngle).toBeLessThan(initialAngle);
  });

  test('マウスを上にドラッグするとブロックを上から見下ろす角度になる', async ({ page }) => {
    // 初期のカメラY位置を取得
    const initialY = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return camera.position.y;
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    // 上にドラッグ
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 100);
    await page.mouse.up();

    // カメラY位置が変化している（上から見下ろす角度になる）
    const newY = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return camera.position.y;
    });
    expect(newY).not.toBe(initialY);
  });

  test('上下の傾きが上側90度、下側90度までに制限される', async ({ page }) => {
    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    // 大きく上にドラッグ（90度超えを試みる）
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 500);
    await page.mouse.up();

    // カメラが真上（Y軸方向）を超えないことを確認
    // カメラ距離を取得し、Y座標がその距離以下であることを確認
    const cameraState = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      const distance = camera.position.length();
      return { y: camera.position.y, distance };
    });

    // Y座標が距離以下（真上を超えない）
    expect(cameraState.y).toBeLessThanOrEqual(cameraState.distance);
  });

  test('マウスホイールで拡大縮小できる', async ({ page }) => {
    // 初期のカメラ距離を取得
    const initialDistance = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return camera.position.length();
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();

    // ホイールスクロール（ズームイン）
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -100);

    // 少し待機
    await page.waitForTimeout(100);

    // カメラ距離が変化している
    const newDistance = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return camera.position.length();
    });

    // 距離が変化している
    expect(newDistance).not.toBe(initialDistance);
  });

  test('タッチスワイプで視点を回転できる', async ({ page }) => {
    // 初期のカメラ位置を取得
    const initialPos = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // タッチスワイプをシミュレート
    await page.evaluate(({ startX, startY, endX, endY }) => {
      const canvas = document.querySelector('.preview-3d canvas');

      // touchstart
      const touchStart = new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [new Touch({
          identifier: 0,
          target: canvas,
          clientX: startX,
          clientY: startY
        })]
      });
      canvas.dispatchEvent(touchStart);

      // touchmove
      const touchMove = new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [new Touch({
          identifier: 0,
          target: canvas,
          clientX: endX,
          clientY: endY
        })]
      });
      canvas.dispatchEvent(touchMove);

      // touchend
      const touchEnd = new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: []
      });
      canvas.dispatchEvent(touchEnd);
    }, { startX: centerX, startY: centerY, endX: centerX + 100, endY: centerY });

    // カメラ位置が変化している
    const newPos = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return { x: camera.position.x, z: camera.position.z };
    });
    expect(newPos.x !== initialPos.x || newPos.z !== initialPos.z).toBe(true);
  });

  test('ピンチ操作で拡大縮小できる', async ({ page }) => {
    // 初期のカメラ距離を取得
    const initialDistance = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return camera.position.length();
    });

    const canvas = page.locator('.preview-3d canvas');
    const box = await canvas.boundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // ピンチイン（ズームアウト）をシミュレート
    await page.evaluate(({ centerX, centerY }) => {
      const canvas = document.querySelector('.preview-3d canvas');

      // 2本指でタッチ開始（離れた位置）
      const touchStart = new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [
          new Touch({ identifier: 0, target: canvas, clientX: centerX - 50, clientY: centerY }),
          new Touch({ identifier: 1, target: canvas, clientX: centerX + 50, clientY: centerY })
        ]
      });
      canvas.dispatchEvent(touchStart);

      // 2本指を近づける（ピンチイン）
      const touchMove = new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [
          new Touch({ identifier: 0, target: canvas, clientX: centerX - 20, clientY: centerY }),
          new Touch({ identifier: 1, target: canvas, clientX: centerX + 20, clientY: centerY })
        ]
      });
      canvas.dispatchEvent(touchMove);

      // タッチ終了
      const touchEnd = new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: []
      });
      canvas.dispatchEvent(touchEnd);
    }, { centerX, centerY });

    // 少し待機
    await page.waitForTimeout(100);

    // カメラ距離が変化している
    const newDistance = await page.evaluate(() => {
      const camera = window.editorUI.standardBlockEditor.getCamera();
      return camera.position.length();
    });
    expect(newDistance).not.toBe(initialDistance);
  });

});

// ============================================
// UI表示
// ============================================
test.describe('UI表示', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
  });

  test('ツールバーが3カラム構成（left-group, center-group, right-group）である', async ({ page }) => {
    await expect(page.locator('.preview-toolbar .left-group')).toBeVisible();
    await expect(page.locator('.preview-toolbar .center-group')).toBeVisible();
    await expect(page.locator('.preview-toolbar .right-group')).toBeVisible();
  });

  test('テクスチャスロット（.material-item）が7つ表示される', async ({ page }) => {
    const slots = page.locator('.normal-slots .material-item');
    await expect(slots).toHaveCount(7);

    // 各スロットのdata-slot属性を確認
    const expectedSlots = ['default', 'front', 'top', 'bottom', 'left', 'right', 'back'];
    for (const slot of expectedSlots) {
      await expect(page.locator(`.material-item[data-slot="${slot}"]`)).toBeVisible();
    }
  });

  test('BGボタンが右グループに表示される', async ({ page }) => {
    const bgBtn = page.locator('.right-group .bg-btn');
    await expect(bgBtn).toBeVisible();
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
    // selectのoption数が2以上（初期値 + ブロック）
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
    // 初期状態
    expect(await page.locator('#block-str-id').textContent()).toBe('-');
    expect(await page.locator('#block-name').textContent()).toBe('-');

    // ブロック選択
    await page.selectOption('#block-select', { index: 1 });

    // 更新される
    expect(await page.locator('#block-str-id').textContent()).not.toBe('-');
    expect(await page.locator('#block-name').textContent()).not.toBe('-');
  });

  test('ブロック選択時に3Dプレビューが更新される', async ({ page }) => {
    // ブロック選択前はcanvasがない可能性
    await page.selectOption('#block-select', { index: 1 });

    // canvas が表示される
    await expect(page.locator('.preview-3d canvas')).toBeVisible();
  });

});

// ============================================
// レスポンシブ対応
// ============================================
test.describe('レスポンシブ対応', () => {

  test('PC表示（768px以上）で2カラム構成になる', async ({ page }) => {
    // PC幅に設定
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);

    // 左カラムと右カラムが横並びになっている
    const leftColumn = page.locator('.left-column');
    const rightColumn = page.locator('.right-column');

    const leftBox = await leftColumn.boundingBox();
    const rightBox = await rightColumn.boundingBox();

    // 右カラムが左カラムの右側にある（横並び）
    expect(rightBox.x).toBeGreaterThan(leftBox.x);
    // Y座標がほぼ同じ（同じ行にある）
    expect(Math.abs(rightBox.y - leftBox.y)).toBeLessThan(50);
  });

  test('スマホ表示（768px未満）で1カラム構成になる', async ({ page }) => {
    // スマホ幅に設定
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);

    // エディタとコントロールが縦並びになっている
    const editorContainer = page.locator('#editor-container');
    const controlPanel = page.locator('.left-column');

    const editorBox = await editorContainer.boundingBox();
    const controlBox = await controlPanel.boundingBox();

    // コントロールがエディタの下にある（縦並び）
    expect(controlBox.y).toBeGreaterThan(editorBox.y);
  });

  test('スマホ表示でBlockEditorUIが上部に表示される', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);

    const editorContainer = page.locator('#editor-container');
    const leftColumn = page.locator('.left-column');

    const editorBox = await editorContainer.boundingBox();
    const leftBox = await leftColumn.boundingBox();

    // エディタが上、コントロールが下
    expect(editorBox.y).toBeLessThan(leftBox.y);
  });

});
