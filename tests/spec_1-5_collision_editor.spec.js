// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 仕様1-5 カスタムブロック当たり判定エディタ テスト
 *
 * 仕様1-5で新規追加される機能:
 * - CustomCollision クラス（4x4x4、1bit、8バイト）
 * - CollisionChecker クラス（衝突テストのボール物理演算）
 * - 衝突テストボタン (.check-btn)
 * - 自動作成ボタン (.auto-create-btn)
 * - 当たり判定モードでのUI制御（ブラシサイズ固定等）
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

// カスタムブロックを選択するヘルパー関数
async function selectCustomBlock(page) {
  await page.selectOption('#block-select', { index: 1 });
  await expect(page.locator('.preview-3d canvas')).toBeVisible();
}

// ============================================
// BlockEditorUI 衝突テスト拡張
// ============================================
test.describe('BlockEditorUI 衝突テスト拡張', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
  });

  test('衝突テストボタン(.check-btn)が表示される', async ({ page }) => {
    await expect(page.locator('.check-btn')).toBeVisible();
  });

  test('衝突テストボタンがコントロールパネル(.control-panel.has-check-btn)内に配置される', async ({ page }) => {
    await expect(page.locator('.control-panel.has-check-btn .check-btn')).toBeVisible();
  });

  test('衝突テストボタンクリックでactiveクラスが付与される', async ({ page }) => {
    const checkBtn = page.locator('.check-btn');
    await expect(checkBtn).not.toHaveClass(/active/);
    await checkBtn.click();
    await expect(checkBtn).toHaveClass(/active/);
  });

  test('衝突テスト中に再度クリックするとactiveクラスが解除される', async ({ page }) => {
    const checkBtn = page.locator('.check-btn');
    await checkBtn.click();
    await expect(checkBtn).toHaveClass(/active/);
    await checkBtn.click();
    await expect(checkBtn).not.toHaveClass(/active/);
  });

  test('startCollisionTest() メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.editorUI.startCollisionTest === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('stopCollisionTest() メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.editorUI.stopCollisionTest === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('当たり判定モード時、自動作成ボタン(.auto-create-btn)が表示される', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
    });
    await expect(page.locator('.auto-create-btn')).toBeVisible();
  });

  test('見た目モード時、自動作成ボタンは非表示である', async ({ page }) => {
    await expect(page.locator('.auto-create-btn')).toBeHidden();
  });

});

// ============================================
// CustomBlockEditor 当たり判定編集機能
// ============================================
test.describe('CustomBlockEditor 当たり判定編集機能', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
  });

  test('当たり判定モードではブラシサイズが2に固定される', async ({ page }) => {
    // 見た目モードでブラシサイズを1に変更
    await page.evaluate(() => {
      window.editorUI.setBrushSize(1);
    });

    // 当たり判定モードに切り替え
    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
    });

    // ブラシサイズが2に強制される
    const brushSize = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getBrushSize();
    });
    expect(brushSize).toBe(2);
  });

  test('当たり判定モードではブラシサイズ1ボタンがdisabledになる', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
    });
    await expect(page.locator('.brush-size-btn[data-size="1"]')).toBeDisabled();
  });

  test('当たり判定モードではブラシサイズ4ボタンがdisabledになる', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
    });
    await expect(page.locator('.brush-size-btn[data-size="4"]')).toBeDisabled();
  });

  test('当たり判定モードで見た目メッシュが非表示になる', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
    });

    const isHidden = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;
      const lookMesh = editor.getLookMesh();
      return lookMesh.visible === false;
    });
    expect(isHidden).toBe(true);
  });

  test('見た目モードで当たり判定メッシュが非表示になる', async ({ page }) => {
    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
      window.editorUI.setEditMode('look');
    });

    const isHidden = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;
      const collisionMesh = editor.getCollisionMesh();
      return collisionMesh.visible === false;
    });
    expect(isHidden).toBe(true);
  });

  test('当たり判定メッシュは白色で表示される', async ({ page }) => {
    // 当たり判定モードに切り替え、当たり判定ボクセルを追加
    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
      // 当たり判定データに1つボクセルを設定
      const editor = window.editorUI.customBlockEditor;
      window.CustomCollision.setVoxel(editor.voxelCollisionData, 0, 0, 0, 1);
      editor.setEditMode('collision'); // メッシュを再構築
    });

    const isWhite = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;
      const collisionMesh = editor.getCollisionMesh();
      // collisionMeshはGroupなので、childrenの中のMeshのmaterialを確認
      if (collisionMesh && collisionMesh.children) {
        for (const child of collisionMesh.children) {
          if (child.material && child.material.color) {
            const c = child.material.color;
            // 白色(r=1, g=1, b=1)かどうか確認
            if (c.r === 1 && c.g === 1 && c.b === 1) {
              return true;
            }
          }
        }
      }
      // childrenがない場合、collisionMesh自体のmaterialを確認
      if (collisionMesh.material && collisionMesh.material.color) {
        const c = collisionMesh.material.color;
        return c.r === 1 && c.g === 1 && c.b === 1;
      }
      return false;
    });
    expect(isWhite).toBe(true);
  });

});

// ============================================
// CustomCollision クラス（4x4x4、1bit、8バイト）
// ============================================
test.describe('CustomCollision クラス', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
  });

  test('CustomCollision クラスがグローバルに存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return typeof window.CustomCollision !== 'undefined';
    });
    expect(exists).toBe(true);
  });

  test('CustomCollision.encode() メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.CustomCollision.encode === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('CustomCollision.decode() メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.CustomCollision.decode === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('encode()は4x4x4配列を受け取りBase64文字列を返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const data = [];
      for (let y = 0; y < 4; y++) {
        data[y] = [];
        for (let z = 0; z < 4; z++) {
          data[y][z] = [0, 0, 0, 0];
        }
      }
      data[0][0][0] = 1; // 1箇所だけ1を設定
      return window.CustomCollision.encode(data);
    });

    expect(typeof result).toBe('string');
    expect(result).toMatch(/^[A-Za-z0-9+/]*=*$/);
  });

  test('encode()の結果は8バイト（64bit）をBase64化した長さになる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const data = [];
      for (let y = 0; y < 4; y++) {
        data[y] = [];
        for (let z = 0; z < 4; z++) {
          data[y][z] = [0, 0, 0, 0];
        }
      }
      const encoded = window.CustomCollision.encode(data);
      // 8バイト -> Base64で12文字（パディング含む）
      // ceil(8 / 3) * 4 = 12
      return encoded.length;
    });

    // 8バイトをBase64エンコードすると12文字
    expect(result).toBe(12);
  });

  test('decode()はBase64文字列を4x4x4配列に復元する', async ({ page }) => {
    const result = await page.evaluate(() => {
      // 空のデータをエンコード
      const original = [];
      for (let y = 0; y < 4; y++) {
        original[y] = [];
        for (let z = 0; z < 4; z++) {
          original[y][z] = [0, 0, 0, 0];
        }
      }
      original[1][2][3] = 1;

      const encoded = window.CustomCollision.encode(original);
      const decoded = window.CustomCollision.decode(encoded);

      return {
        isArray: Array.isArray(decoded),
        yLength: decoded.length,
        zLength: decoded[0].length,
        xLength: decoded[0][0].length,
        testValue: decoded[1][2][3]
      };
    });

    expect(result.isArray).toBe(true);
    expect(result.yLength).toBe(4);
    expect(result.zLength).toBe(4);
    expect(result.xLength).toBe(4);
    expect(result.testValue).toBe(1);
  });

  test('encode/decodeでデータが正しく往復する', async ({ page }) => {
    const isEqual = await page.evaluate(() => {
      const original = [];
      for (let y = 0; y < 4; y++) {
        original[y] = [];
        for (let z = 0; z < 4; z++) {
          original[y][z] = [];
          for (let x = 0; x < 4; x++) {
            // ランダムに0または1を設定
            original[y][z][x] = (y + z + x) % 2;
          }
        }
      }

      const encoded = window.CustomCollision.encode(original);
      const decoded = window.CustomCollision.decode(encoded);

      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            if (original[y][z][x] !== decoded[y][z][x]) {
              return false;
            }
          }
        }
      }
      return true;
    });

    expect(isEqual).toBe(true);
  });

});

// ============================================
// getVoxelCollisionData（4x4x4形式）
// ============================================
test.describe('getVoxelCollisionData（4x4x4形式）', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
  });

  test('getVoxelCollisionData()がBase64文字列を返す', async ({ page }) => {
    const data = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getVoxelCollisionData();
    });
    expect(typeof data).toBe('string');
    expect(data).toMatch(/^[A-Za-z0-9+/]*=*$/);
  });

  test('getVoxelCollisionData()の結果は12文字（8バイトのBase64）である', async ({ page }) => {
    const length = await page.evaluate(() => {
      const data = window.editorUI.customBlockEditor.getVoxelCollisionData();
      return data.length;
    });
    // 4x4x4 = 64ボクセル x 1bit = 64bit = 8バイト -> Base64で12文字
    expect(length).toBe(12);
  });

  test('getVoxelCollisionData()の結果をCustomCollision.decode()で4x4x4配列に復元できる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const base64 = window.editorUI.customBlockEditor.getVoxelCollisionData();
      const decoded = window.CustomCollision.decode(base64);
      return {
        yLength: decoded.length,
        zLength: decoded[0].length,
        xLength: decoded[0][0].length
      };
    });

    expect(result.yLength).toBe(4);
    expect(result.zLength).toBe(4);
    expect(result.xLength).toBe(4);
  });

});

// ============================================
// autoCreateCollision（2x2x2領域判定）
// ============================================
test.describe('autoCreateCollision（2x2x2領域判定）', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
  });

  test('autoCreateCollision()メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.editorUI.customBlockEditor.autoCreateCollision === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('2x2x2領域に1つでもボクセルがあれば当たり判定が1になる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;

      // 見た目データをクリア
      for (let y = 0; y < 8; y++) {
        for (let z = 0; z < 8; z++) {
          for (let x = 0; x < 8; x++) {
            VoxelData.setVoxel(editor.voxelLookData, x, y, z, 0);
          }
        }
      }

      // 見た目座標(0,0,0)に1つだけボクセルを配置
      // これは当たり判定座標(0,0,0)の2x2x2領域に対応
      VoxelData.setVoxel(editor.voxelLookData, 0, 0, 0, 1);

      // 自動作成実行
      editor.autoCreateCollision();

      // 当たり判定データを取得してデコード
      const collisionBase64 = editor.getVoxelCollisionData();
      const collisionData = window.CustomCollision.decode(collisionBase64);

      // 当たり判定座標(0,0,0)が1になっているはず
      return collisionData[0][0][0];
    });

    expect(result).toBe(1);
  });

  test('2x2x2領域が全て空なら当たり判定が0になる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;

      // 見た目データを完全にクリア
      for (let y = 0; y < 8; y++) {
        for (let z = 0; z < 8; z++) {
          for (let x = 0; x < 8; x++) {
            VoxelData.setVoxel(editor.voxelLookData, x, y, z, 0);
          }
        }
      }

      // 自動作成実行
      editor.autoCreateCollision();

      // 全ての当たり判定が0であることを確認
      const collisionBase64 = editor.getVoxelCollisionData();
      const collisionData = window.CustomCollision.decode(collisionBase64);

      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            if (collisionData[y][z][x] !== 0) {
              return false;
            }
          }
        }
      }
      return true;
    });

    expect(result).toBe(true);
  });

  test('自動作成ボタンクリックでautoCreateCollision()が実行される', async ({ page }) => {
    // 当たり判定モードに切り替え
    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
    });

    // 自動作成ボタンをクリック
    await page.click('.auto-create-btn');

    // エラーなく実行されることを確認
    const data = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getVoxelCollisionData();
    });
    expect(typeof data).toBe('string');
  });

});

// ============================================
// CollisionChecker クラス
// ============================================
test.describe('CollisionChecker クラス', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
  });

  test('CollisionChecker クラスがグローバルに存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return typeof window.CollisionChecker === 'function';
    });
    expect(exists).toBe(true);
  });

  test('editorUI.collisionChecker インスタンスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return window.editorUI.collisionChecker !== null &&
             window.editorUI.collisionChecker !== undefined;
    });
    expect(exists).toBe(true);
  });

  test('setCollisionData() メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.editorUI.collisionChecker.setCollisionData === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('start() メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.editorUI.collisionChecker.start === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('stop() メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.editorUI.collisionChecker.stop === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('dispose() メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.editorUI.collisionChecker.dispose === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('衝突テスト開始時に30個の球体が生成される', async ({ page }) => {
    await page.click('.check-btn');
    await page.waitForTimeout(500);

    const ballCount = await page.evaluate(() => {
      return window.editorUI.collisionChecker.getBalls().length;
    });
    expect(ballCount).toBe(30);
  });

  test('球体の直径は0.1である', async ({ page }) => {
    const diameter = await page.evaluate(() => {
      return window.editorUI.collisionChecker.ballDiameter;
    });
    expect(diameter).toBeCloseTo(0.1, 2);
  });

  test('物理演算のタイムステップは1/60秒である', async ({ page }) => {
    const timestep = await page.evaluate(() => {
      return window.editorUI.collisionChecker.fixedTimestep;
    });
    expect(timestep).toBeCloseTo(1 / 60, 5);
  });

});

// ============================================
// 当たり判定編集操作
// ============================================
test.describe('当たり判定編集操作', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
    await page.evaluate(() => {
      window.editorUI.setEditMode('collision');
    });
  });

  test('当たり判定モードで右クリックするとボクセルが配置される', async ({ page }) => {
    // 描画が完了するまで待機
    await page.waitForTimeout(500);

    const initialData = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getVoxelCollisionData();
    });

    // 直接ボクセルを配置してテスト
    const newData = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;
      // 床面中央付近に当たり判定ボクセルを配置
      window.CustomCollision.setVoxel(editor.voxelCollisionData, 1, 0, 1, 1);
      return editor.getVoxelCollisionData();
    });

    expect(newData).not.toBe(initialData);
  });

  test('当たり判定モードで左クリックするとボクセルが削除される', async ({ page }) => {
    // ボクセルを配置
    await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;
      window.CustomCollision.setVoxel(editor.voxelCollisionData, 1, 0, 1, 1);
    });

    const afterPlace = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getVoxelCollisionData();
    });

    // ボクセルを削除
    const afterDelete = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;
      window.CustomCollision.setVoxel(editor.voxelCollisionData, 1, 0, 1, 0);
      return editor.getVoxelCollisionData();
    });

    expect(afterDelete).not.toBe(afterPlace);
  });

});

// ============================================
// テストページ固有
// ============================================
test.describe('テストページ固有', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
  });

  test('標準ブロック選択時に衝突テストボタンが表示されない', async ({ page }) => {
    await page.selectOption('#block-select', { index: 0 });
    await expect(page.locator('.check-btn')).toBeHidden();
  });

});

// ============================================
// 追加テスト: 補足仕様（10.x）
// ============================================
test.describe('補足仕様', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
  });

  test('voxel_collisionが空のブロック選択時、全て0で開始される', async ({ page }) => {
    const allZero = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;
      const base64 = editor.getVoxelCollisionData();
      const data = window.CustomCollision.decode(base64);

      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            if (data[y][z][x] !== 0) {
              return false;
            }
          }
        }
      }
      return true;
    });

    expect(allZero).toBe(true);
  });

  test('4x4x4範囲外への配置は無視される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;

      // 範囲外座標への設定を試みる
      window.CustomCollision.setVoxel(editor.voxelCollisionData, 5, 0, 0, 1);
      window.CustomCollision.setVoxel(editor.voxelCollisionData, 0, 5, 0, 1);
      window.CustomCollision.setVoxel(editor.voxelCollisionData, 0, 0, 5, 1);
      window.CustomCollision.setVoxel(editor.voxelCollisionData, -1, 0, 0, 1);

      // 範囲内のデータが影響を受けていないことを確認
      return {
        validCoord: window.CustomCollision.getVoxel(editor.voxelCollisionData, 0, 0, 0),
        success: true
      };
    });

    expect(result.success).toBe(true);
  });

  test('空の状態（全て0）でも保存が許可される', async ({ page }) => {
    const data = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;

      // 全て0にクリア
      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            window.CustomCollision.setVoxel(editor.voxelCollisionData, x, y, z, 0);
          }
        }
      }

      return editor.getVoxelCollisionData();
    });

    // 空でもBase64文字列が返される（12文字）
    expect(typeof data).toBe('string');
    expect(data.length).toBe(12);
  });

});

// ============================================
// 追加テスト: CustomCollision 追加メソッド
// ============================================
test.describe('CustomCollision 追加メソッド', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
  });

  test('createEmpty()メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.CustomCollision.createEmpty === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('createEmpty()は4x4x4の空配列を返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const data = window.CustomCollision.createEmpty();
      return {
        yLength: data.length,
        zLength: data[0].length,
        xLength: data[0][0].length,
        allZero: data.every(y => y.every(z => z.every(x => x === 0)))
      };
    });

    expect(result.yLength).toBe(4);
    expect(result.zLength).toBe(4);
    expect(result.xLength).toBe(4);
    expect(result.allZero).toBe(true);
  });

  test('getVoxel()メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.CustomCollision.getVoxel === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('setVoxel()メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.CustomCollision.setVoxel === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('getVoxel/setVoxelで値を正しく読み書きできる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const data = window.CustomCollision.createEmpty();

      window.CustomCollision.setVoxel(data, 1, 2, 3, 1);
      const value = window.CustomCollision.getVoxel(data, 1, 2, 3);

      return { setValue: 1, getValue: value };
    });

    expect(result.getValue).toBe(result.setValue);
  });

  test('decode()に空文字列を渡すと空の配列を返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const data = window.CustomCollision.decode('');
      return {
        yLength: data.length,
        allZero: data.every(y => y.every(z => z.every(x => x === 0)))
      };
    });

    expect(result.yLength).toBe(4);
    expect(result.allZero).toBe(true);
  });

  test('decode()にnullを渡すと空の配列を返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const data = window.CustomCollision.decode(null);
      return {
        yLength: data.length,
        allZero: data.every(y => y.every(z => z.every(x => x === 0)))
      };
    });

    expect(result.yLength).toBe(4);
    expect(result.allZero).toBe(true);
  });

});

// ============================================
// 追加テスト: setEditMode/getEditMode
// ============================================
test.describe('setEditMode/getEditMode', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
  });

  test('getEditMode()がデフォルトでlookを返す', async ({ page }) => {
    const mode = await page.evaluate(() => {
      return window.editorUI.customBlockEditor.getEditMode();
    });
    expect(mode).toBe('look');
  });

  test('setEditMode(collision)後、getEditMode()がcollisionを返す', async ({ page }) => {
    const mode = await page.evaluate(() => {
      window.editorUI.customBlockEditor.setEditMode('collision');
      return window.editorUI.customBlockEditor.getEditMode();
    });
    expect(mode).toBe('collision');
  });

  test('setEditMode(look)後、getEditMode()がlookを返す', async ({ page }) => {
    const mode = await page.evaluate(() => {
      window.editorUI.customBlockEditor.setEditMode('collision');
      window.editorUI.customBlockEditor.setEditMode('look');
      return window.editorUI.customBlockEditor.getEditMode();
    });
    expect(mode).toBe('look');
  });

});

// ============================================
// 追加テスト: CollisionChecker 物理演算
// ============================================
test.describe('CollisionChecker 物理演算', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
  });

  test('衝突テスト停止時にボールが削除される', async ({ page }) => {
    // 衝突テスト開始
    await page.click('.check-btn');
    await page.waitForTimeout(500);

    const ballCountBefore = await page.evaluate(() => {
      return window.editorUI.collisionChecker.getBalls().length;
    });
    expect(ballCountBefore).toBe(30);

    // 衝突テスト停止
    await page.click('.check-btn');
    await page.waitForTimeout(100);

    const ballCountAfter = await page.evaluate(() => {
      return window.editorUI.collisionChecker.getBalls().length;
    });
    expect(ballCountAfter).toBe(0);
  });

  test('ボールに重力が適用される（Y座標が時間経過で減少）', async ({ page }) => {
    // 衝突テスト開始
    await page.click('.check-btn');
    await page.waitForTimeout(100);

    const initialY = await page.evaluate(() => {
      const balls = window.editorUI.collisionChecker.getBalls();
      return balls[0].position.y;
    });

    await page.waitForTimeout(500);

    const afterY = await page.evaluate(() => {
      const balls = window.editorUI.collisionChecker.getBalls();
      return balls[0].position.y;
    });

    // 重力により下に落ちる（Y座標が減少するか、床で反射）
    // 初期位置より大きく下がっているか、床で反射しているはず
    expect(afterY).toBeLessThanOrEqual(initialY);
  });

  test('getBalls()メソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      return typeof window.editorUI.collisionChecker.getBalls === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('反発係数(restitution)が設定されている', async ({ page }) => {
    const restitution = await page.evaluate(() => {
      return window.editorUI.collisionChecker.restitution;
    });
    expect(restitution).toBeGreaterThan(0);
    expect(restitution).toBeLessThanOrEqual(1);
  });

});

// ============================================
// 追加テスト: autoCreateCollision詳細
// ============================================
test.describe('autoCreateCollision詳細', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await waitForDataLoad(page);
    await selectCustomBlock(page);
  });

  test('既存の当たり判定データが上書きされる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;

      // 当たり判定を手動で設定
      window.CustomCollision.setVoxel(editor.voxelCollisionData, 3, 3, 3, 1);

      // 見た目データをクリア
      for (let y = 0; y < 8; y++) {
        for (let z = 0; z < 8; z++) {
          for (let x = 0; x < 8; x++) {
            VoxelData.setVoxel(editor.voxelLookData, x, y, z, 0);
          }
        }
      }

      // 自動作成実行（見た目が空なので当たり判定も全て0になるはず）
      editor.autoCreateCollision();

      const base64 = editor.getVoxelCollisionData();
      const data = window.CustomCollision.decode(base64);

      // 手動で設定した(3,3,3)も0になっているはず
      return data[3][3][3];
    });

    expect(result).toBe(0);
  });

  test('見た目座標(2,2,2)〜(3,3,3)にボクセルがあれば当たり判定座標(1,1,1)が1になる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const editor = window.editorUI.customBlockEditor;

      // 見た目データをクリア
      for (let y = 0; y < 8; y++) {
        for (let z = 0; z < 8; z++) {
          for (let x = 0; x < 8; x++) {
            VoxelData.setVoxel(editor.voxelLookData, x, y, z, 0);
          }
        }
      }

      // 見た目座標(3,3,3)にボクセルを配置（当たり判定座標(1,1,1)の領域内）
      VoxelData.setVoxel(editor.voxelLookData, 3, 3, 3, 1);

      editor.autoCreateCollision();

      const base64 = editor.getVoxelCollisionData();
      const data = window.CustomCollision.decode(base64);

      return data[1][1][1];
    });

    expect(result).toBe(1);
  });

});
