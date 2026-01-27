// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 2-3 LoD設定と表示テスト
 */

const TEST_PAGE_PATH = '/test/2-3_lod_test.html';
const BLOCK_MANAGER_PATH = '/tool/block_manager.html';

// ========================================
// TEST-2-3-1: LoDレベル定義
// ========================================
test.describe('TEST-2-3-1: LoDレベル定義', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('ChunkManager に getChunkLoD メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.chunkManager.getChunkLoD === 'function');
    expect(exists).toBe(true);
  });

  test('LoDレベルは0から3の値を返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cm = window.gameApp.chunkManager;
      // 視点位置のチャンク
      const lod0 = cm.getChunkLoD(0, 0);
      return lod0 >= 0 && lod0 <= 3;
    });
    expect(result).toBe(true);
  });

  test('近距離チャンクはLoD 0を返す', async ({ page }) => {
    const lod = await page.evaluate(() => {
      const cm = window.gameApp.chunkManager;
      // 視点直下のチャンク
      return cm.getChunkLoD(0, 0);
    });
    expect(lod).toBe(0);
  });

  test('距離に応じてLoDレベルが上がる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cm = window.gameApp.chunkManager;
      const lod0 = cm.getChunkLoD(0, 0);
      const lodFar = cm.getChunkLoD(20, 20); // 遠くのチャンク
      return lodFar > lod0;
    });
    expect(result).toBe(true);
  });
});

// ========================================
// TEST-2-3-2: 距離閾値設定
// ========================================
test.describe('TEST-2-3-2: 距離閾値設定', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('setLoDRanges メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.chunkManager.setLoDRanges === 'function');
    expect(exists).toBe(true);
  });

  test('LoD 0 範囲の入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-lod0-range')).toBeVisible();
  });

  test('LoD 1 範囲の入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-lod1-range')).toBeVisible();
  });

  test('LoD 2 範囲の入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-lod2-range')).toBeVisible();
  });

  test('LoD 0 範囲のデフォルト値は3', async ({ page }) => {
    const value = await page.locator('#input-lod0-range').inputValue();
    expect(value).toBe('3');
  });

  test('LoD 1 範囲のデフォルト値は7', async ({ page }) => {
    const value = await page.locator('#input-lod1-range').inputValue();
    expect(value).toBe('7');
  });

  test('LoD 2 範囲のデフォルト値は15', async ({ page }) => {
    const value = await page.locator('#input-lod2-range').inputValue();
    expect(value).toBe('15');
  });

  test('LoD範囲を変更するとLoDレベルが変わる', async ({ page }) => {
    // 初期値で遠くのチャンクのLoDを取得
    const initialLoD = await page.evaluate(() => window.gameApp.chunkManager.getChunkLoD(5, 5));

    // LoD 0範囲を10に変更
    await page.fill('#input-lod0-range', '10');
    await page.locator('#input-lod0-range').blur();
    await page.waitForTimeout(100);

    // 同じチャンクのLoDを再取得
    const newLoD = await page.evaluate(() => window.gameApp.chunkManager.getChunkLoD(5, 5));

    // 範囲を広げたのでLoDが下がる
    expect(newLoD).toBeLessThan(initialLoD);
  });

  test('距離計算はチェビシェフ距離を使用する', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cm = window.gameApp.chunkManager;
      // チェビシェフ距離 = max(|dx|, |dz|)
      // (3, 0) と (0, 3) は同じ距離になるはず
      const lod1 = cm.getChunkLoD(3, 0);
      const lod2 = cm.getChunkLoD(0, 3);
      const lod3 = cm.getChunkLoD(3, 3); // max(3, 3) = 3
      return { lod1, lod2, lod3 };
    });
    expect(result.lod1).toBe(result.lod2);
    expect(result.lod1).toBe(result.lod3);
  });
});

// ========================================
// TEST-2-3-3: WorldGenerator 拡張
// ========================================
test.describe('TEST-2-3-3: WorldGenerator 拡張', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => typeof window.WorldGenerator !== 'undefined', { timeout: 30000 });
  });

  test('getTerrainHeight メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      const gen = new window.WorldGenerator();
      return typeof gen.getTerrainHeight === 'function';
    });
    expect(exists).toBe(true);
  });

  test('getTerrainColor メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      const gen = new window.WorldGenerator();
      return typeof gen.getTerrainColor === 'function';
    });
    expect(exists).toBe(true);
  });

  test('getTerrainHeight は数値を返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const gen = new window.WorldGenerator();
      const height = gen.getTerrainHeight(0, 0);
      return typeof height === 'number';
    });
    expect(result).toBe(true);
  });

  test('getTerrainColor は16進数形式の色を返す', async ({ page }) => {
    const color = await page.evaluate(() => {
      const gen = new window.WorldGenerator();
      return gen.getTerrainColor(0, 0);
    });
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('フラット地形の高さは64を返す', async ({ page }) => {
    const height = await page.evaluate(() => {
      const gen = new window.WorldGenerator();
      return gen.getTerrainHeight(100, 100);
    });
    expect(height).toBe(64);
  });
});

// ========================================
// TEST-2-3-4: LoDHelper クラス
// ========================================
test.describe('TEST-2-3-4: LoDHelper クラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => typeof window.LoDHelper !== 'undefined', { timeout: 30000 });
  });

  test('LoDHelper クラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.LoDHelper === 'function' || typeof window.LoDHelper === 'object');
    expect(exists).toBe(true);
  });

  test('createLoD2Mesh メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.LoDHelper.createLoD2Mesh === 'function');
    expect(exists).toBe(true);
  });

  test('createLoD3Mesh メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.LoDHelper.createLoD3Mesh === 'function');
    expect(exists).toBe(true);
  });

  test('getLoD3Grid メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.LoDHelper.getLoD3Grid === 'function');
    expect(exists).toBe(true);
  });

  test('createLoD2Mesh は THREE.Mesh を返す', async ({ page }) => {
    const isMesh = await page.evaluate(() => {
      const gen = new window.WorldGenerator();
      const mesh = window.LoDHelper.createLoD2Mesh(0, 0, gen);
      return mesh && mesh.isMesh === true;
    });
    expect(isMesh).toBe(true);
  });

  test('createLoD3Mesh は THREE.Mesh を返す', async ({ page }) => {
    const isMesh = await page.evaluate(() => {
      const gen = new window.WorldGenerator();
      const mesh = window.LoDHelper.createLoD3Mesh(0, 0, gen);
      return mesh && mesh.isMesh === true;
    });
    expect(isMesh).toBe(true);
  });

  test('getLoD3Grid は4の倍数のグリッド座標を返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      // チャンク(5, 7) -> グリッド(4, 4)
      const grid1 = window.LoDHelper.getLoD3Grid(5, 7);
      // チャンク(-3, -1) -> グリッド(-4, -4)
      const grid2 = window.LoDHelper.getLoD3Grid(-3, -1);
      return {
        grid1,
        grid2,
        isGrid1Valid: grid1.gridX % 4 === 0 && grid1.gridZ % 4 === 0,
        isGrid2Valid: grid2.gridX % 4 === 0 && grid2.gridZ % 4 === 0
      };
    });
    expect(result.isGrid1Valid).toBe(true);
    expect(result.isGrid2Valid).toBe(true);
  });

  test('LoD 2 メッシュのポリゴン数は2（1四角形）', async ({ page }) => {
    const triangles = await page.evaluate(() => {
      const gen = new window.WorldGenerator();
      const mesh = window.LoDHelper.createLoD2Mesh(0, 0, gen);
      return mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
    });
    expect(triangles).toBe(2);
  });

  test('LoD 3 メッシュのポリゴン数は2（1四角形）', async ({ page }) => {
    const triangles = await page.evaluate(() => {
      const gen = new window.WorldGenerator();
      const mesh = window.LoDHelper.createLoD3Mesh(0, 0, gen);
      return mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
    });
    expect(triangles).toBe(2);
  });
});

// ========================================
// TEST-2-3-5: LoD 0 表示テスト
// ========================================
test.describe('TEST-2-3-5: LoD 0 表示テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // チャンク生成完了を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('近距離チャンクがテクスチャ付きで表示される', async ({ page }) => {
    const hasTexture = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        child => child.name && child.name.startsWith('chunk_') && child.userData.lodLevel === 0
      );
      if (!mesh || !mesh.material) return false;
      // シェーダーマテリアルまたはテクスチャ付きマテリアル
      return mesh.material.isShaderMaterial || (mesh.material.map !== null);
    });
    expect(hasTexture).toBe(true);
  });

  test('LoD 0 チャンクのポリゴン数が50以上', async ({ page }) => {
    // グリーディーメッシングでは面が結合されるため、ポリゴン数は少なくなる
    const triangles = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        child => child.name && child.name.startsWith('chunk_') && child.userData.lodLevel === 0
      );
      if (!mesh || !mesh.geometry) return 0;
      return mesh.geometry.index ? mesh.geometry.index.count / 3 : 0;
    });
    expect(triangles).toBeGreaterThan(50);
  });
});

// ========================================
// TEST-2-3-6: LoD 1 表示テスト
// ========================================
test.describe('TEST-2-3-6: LoD 1 表示テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 総描画範囲を広げてLoD 1チャンクを表示
    await page.fill('#input-total-range', '15');
    await page.locator('#input-total-range').blur();
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 49,
      { timeout: 60000 }
    );
  });

  test('ChunkMeshBuilder に buildLoD1 メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      const builder = new window.ChunkMeshBuilder(window.gameApp.textureLoader);
      return typeof builder.buildLoD1 === 'function';
    });
    expect(exists).toBe(true);
  });

  test('LoD 1 チャンクは頂点カラーを使用する', async ({ page }) => {
    const hasVertexColors = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        child => child.name && child.name.startsWith('chunk_') && child.userData.lodLevel === 1
      );
      if (!mesh || !mesh.material) return false;
      return mesh.material.vertexColors === true;
    });
    expect(hasVertexColors).toBe(true);
  });

  test('LoD 1 チャンクはテクスチャを使用しない', async ({ page }) => {
    const noTexture = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        child => child.name && child.name.startsWith('chunk_') && child.userData.lodLevel === 1
      );
      if (!mesh || !mesh.material) return true;
      return !mesh.material.isShaderMaterial && mesh.material.map === null;
    });
    expect(noTexture).toBe(true);
  });
});

// ========================================
// TEST-2-3-7: LoD 2 表示テスト
// ========================================
test.describe('TEST-2-3-7: LoD 2 表示テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 総描画範囲を広げてLoD 2チャンクを表示
    await page.fill('#input-total-range', '31');
    await page.locator('#input-total-range').blur();
    await page.waitForTimeout(3000); // LoD 2/3メッシュの生成を待つ
  });

  test('LoD 2 チャンクが1四角形で表示される', async ({ page }) => {
    const triangles = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        child => child.name && child.name.startsWith('lod2_')
      );
      if (!mesh || !mesh.geometry) return -1;
      return mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
    });
    expect(triangles).toBe(2);
  });

  test('LoD 2 メッシュに頂点カラーが設定されている', async ({ page }) => {
    const hasColors = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        child => child.name && child.name.startsWith('lod2_')
      );
      if (!mesh || !mesh.geometry) return false;
      return mesh.geometry.attributes.color !== undefined;
    });
    expect(hasColors).toBe(true);
  });

  test('LoD 2 の4隅の高さが WorldGenerator から取得される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        child => child.name && child.name.startsWith('lod2_')
      );
      if (!mesh || !mesh.geometry) return { found: false };

      const positions = mesh.geometry.attributes.position.array;
      // Y座標を取得（4頂点）
      const heights = [positions[1], positions[4], positions[7], positions[10]];
      const gen = new window.WorldGenerator();
      const expectedHeight = gen.getTerrainHeight(0, 0);

      return {
        found: true,
        heights,
        expectedHeight,
        allMatch: heights.every(h => Math.abs(h - expectedHeight) < 1)
      };
    });
    expect(result.found).toBe(true);
    expect(result.allMatch).toBe(true);
  });
});

// ========================================
// TEST-2-3-8: LoD 3 表示テスト
// ========================================
test.describe('TEST-2-3-8: LoD 3 表示テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 総描画範囲を大きく広げてLoD 3チャンクを表示
    await page.fill('#input-total-range', '63');
    await page.locator('#input-total-range').blur();
    await page.waitForTimeout(5000); // LoD 3メッシュの生成を待つ
  });

  test('LoD 3 メッシュが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return window.gameApp.worldContainer.children.some(
        child => child.name && child.name.startsWith('lod3_')
      );
    });
    expect(exists).toBe(true);
  });

  test('LoD 3 は4x4チャンクを1つのメッシュで表現する', async ({ page }) => {
    const result = await page.evaluate(() => {
      const lod3Meshes = window.gameApp.worldContainer.children.filter(
        child => child.name && child.name.startsWith('lod3_')
      );
      // 各LoD3メッシュは2ポリゴン（1四角形）
      return lod3Meshes.every(mesh => {
        const count = mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
        return count === 2;
      });
    });
    expect(result).toBe(true);
  });

  test('LoD 3 グリッド境界が4の倍数で区切られている', async ({ page }) => {
    const result = await page.evaluate(() => {
      const lod3Meshes = window.gameApp.worldContainer.children.filter(
        child => child.name && child.name.startsWith('lod3_')
      );
      // メッシュ名からグリッド座標を取得（例: lod3_0_0, lod3_4_4, lod3_-4_0）
      return lod3Meshes.every(mesh => {
        const parts = mesh.name.split('_');
        const gridX = parseInt(parts[1]);
        const gridZ = parseInt(parts[2]);
        return gridX % 4 === 0 && gridZ % 4 === 0;
      });
    });
    expect(result).toBe(true);
  });
});

// ========================================
// TEST-2-3-9: LoD切り替えテスト
// ========================================
test.describe('TEST-2-3-9: LoD切り替えテスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('視点移動でLoDレベルが変わる', async ({ page }) => {
    // 特定のチャンクのLoDを取得
    const initialLoD = await page.evaluate(() => window.gameApp.chunkManager.getChunkLoD(5, 0));

    // 視点を移動（updateViewPositionを呼び出して視点を更新）
    await page.evaluate(async () => {
      const newX = 5 * 16 + 8; // チャンク(5,0)の中心へ
      const newZ = 8;
      await window.gameApp.chunkManager.updateViewPosition(newX, newZ);
    });
    await page.waitForTimeout(500);

    // 同じチャンクのLoDを再取得（視点が近づいたので下がるはず）
    const newLoD = await page.evaluate(() => window.gameApp.chunkManager.getChunkLoD(5, 0));

    expect(newLoD).toBeLessThan(initialLoD);
  });

  test('閾値設定が即座に反映される', async ({ page }) => {
    // LoD 0範囲を変更
    await page.fill('#input-lod0-range', '10');
    await page.locator('#input-lod0-range').blur();

    // 変更が反映されていることを確認
    const lod0Range = await page.evaluate(() => window.gameApp.chunkManager.lod0Range);
    expect(lod0Range).toBe(10);
  });

  test('LoDレベルが変わるとメッシュが再生成される', async ({ page }) => {
    // 初期状態のメッシュ数を記録
    const initialMeshCount = await page.evaluate(() =>
      window.gameApp.worldContainer.children.filter(c => c.name && c.name.startsWith('chunk_')).length
    );

    // LoD範囲を大幅に変更
    await page.fill('#input-lod0-range', '1');
    await page.locator('#input-lod0-range').blur();
    await page.waitForTimeout(1000);

    // メッシュが更新されていることを確認（userData.lodLevelの変化）
    const hasLoD1Mesh = await page.evaluate(() =>
      window.gameApp.worldContainer.children.some(c => c.userData && c.userData.lodLevel === 1)
    );
    expect(hasLoD1Mesh).toBe(true);
  });
});

// ========================================
// TEST-2-3-9-1: LoD動的切り替え
// ========================================
test.describe('TEST-2-3-9-1: LoD動的切り替え', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // デフォルトの範囲（31）でLoD 0/1両方を含める状態で待機
    // 初期視点(8,8)→チャンク(0,0)で、十分なチャンクが生成されるまで待つ
    await page.waitForFunction(
      () => {
        const cm = window.gameApp.chunkManager;
        // LoD0とLoD1の両方のチャンクが存在することを確認
        const counts = cm.getLoDCounts();
        return counts.lod0 >= 49 && counts.lod1 >= 100;
      },
      { timeout: 60000 }
    );
  });

  test('LoD1チャンクに近づくとLoD0に切り替わる', async ({ page }) => {
    // LoD1範囲内のチャンクを特定（距離4〜7のチャンク）
    // 初期視点(8,8)→チャンク(0,0)、lod0Range=3なので距離4のチャンクはLoD1
    const targetChunk = await page.evaluate(() => {
      // 距離4のチャンク（LoD1範囲内）を探す
      const mesh = window.gameApp.worldContainer.children.find(
        c => c.name === 'chunk_4_0' && c.userData.lodLevel === 1
      );
      if (!mesh) return null;
      return { name: mesh.name, lodLevel: mesh.userData.lodLevel };
    });

    // LoD1チャンクが存在することを確認
    expect(targetChunk).not.toBeNull();
    expect(targetChunk.lodLevel).toBe(1);

    // そのチャンクに向かって移動（チャンク4,0の中心 = ワールド座標 64+8=72, 8）
    await page.evaluate(async () => {
      await window.gameApp.chunkManager.updateViewPosition(4 * 16 + 8, 8);
    });
    await page.waitForTimeout(1000);

    // チャンク4,0がLoD0に切り替わったか確認
    const newLodLevel = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        c => c.name === 'chunk_4_0'
      );
      return mesh ? mesh.userData.lodLevel : null;
    });

    expect(newLodLevel).toBe(0);
  });

  test('LoD0チャンクから離れるとLoD1に切り替わる', async ({ page }) => {
    // 初期状態でチャンク0,0はLoD0のはず
    const initialLodLevel = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        c => c.name === 'chunk_0_0'
      );
      return mesh ? mesh.userData.lodLevel : null;
    });
    expect(initialLodLevel).toBe(0);

    // 遠くへ移動（チャンク0,0から距離5以上離れる）
    // 視点をチャンク(5,0)に移動すると、チャンク(0,0)は距離5でLoD1になる
    await page.evaluate(async () => {
      await window.gameApp.chunkManager.updateViewPosition(5 * 16 + 8, 8);
    });
    await page.waitForTimeout(1000);

    // チャンク0,0がLoD1に切り替わったか確認
    const newLodLevel = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        c => c.name === 'chunk_0_0'
      );
      return mesh ? mesh.userData.lodLevel : null;
    });

    // 距離5なのでLoD1（lod0Range=3の範囲外、lod1Range=7の範囲内）
    expect(newLodLevel).toBe(1);
  });

  test('LoD切り替え時にメッシュのマテリアルが変わる', async ({ page }) => {
    // 距離4のチャンクを確認（LoD1のはず）
    const initialMaterial = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        c => c.name === 'chunk_4_0'
      );
      if (!mesh || !mesh.material) return null;
      // LoD0はShaderMaterial（テクスチャ）、LoD1はMeshLambertMaterial（頂点カラー）
      return {
        isShaderMaterial: mesh.material.isShaderMaterial || false,
        type: mesh.material.type
      };
    });

    // LoD1なのでShaderMaterialではない（MeshLambertMaterial）
    expect(initialMaterial).not.toBeNull();
    expect(initialMaterial.isShaderMaterial).toBe(false);

    // チャンク4,0に近づく
    await page.evaluate(async () => {
      await window.gameApp.chunkManager.updateViewPosition(4 * 16 + 8, 8);
    });
    await page.waitForTimeout(1000);

    // LoD0に切り替わりShaderMaterial（テクスチャ）になったか確認
    const newMaterial = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        c => c.name === 'chunk_4_0'
      );
      if (!mesh || !mesh.material) return null;
      return {
        isShaderMaterial: mesh.material.isShaderMaterial || false,
        type: mesh.material.type
      };
    });

    expect(newMaterial).not.toBeNull();
    expect(newMaterial.isShaderMaterial).toBe(true);
  });
});

// ========================================
// TEST-2-3-10: デバッグUI
// ========================================
test.describe('TEST-2-3-10: デバッグUI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('デバッグパネルが表示される', async ({ page }) => {
    await expect(page.locator('#debug-panel')).toBeVisible();
  });

  test('FPS表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-fps')).toBeVisible();
  });

  test('総ポリゴン数表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-triangles')).toBeVisible();
  });

  test('ドローコール数表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-drawcalls')).toBeVisible();
  });

  test('視点座標表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-position')).toBeVisible();
  });

  test('LoD別チャンク数表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-lod-counts')).toBeVisible();
  });

  test('LoD別チャンク数が正しく表示される', async ({ page }) => {
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );

    const text = await page.locator('#debug-lod-counts').textContent();
    // "LoD0: X, LoD1: Y, LoD2: Z, LoD3: W" の形式
    expect(text).toMatch(/LoD0:\s*\d+/);
  });

  test('総描画範囲入力が存在する', async ({ page }) => {
    await expect(page.locator('#input-total-range')).toBeVisible();
  });

  test('ワイヤーフレームボタンが動作する', async ({ page }) => {
    const btn = page.locator('#btn-wireframe');
    await expect(btn).toBeVisible();

    const initialText = await btn.textContent();
    await btn.click();
    await page.waitForTimeout(100);
    const changedText = await btn.textContent();

    expect(initialText).not.toBe(changedText);
  });

  test('グリーディーボタンがデフォルトでON', async ({ page }) => {
    const btn = page.locator('#btn-greedy');
    const text = await btn.textContent();
    expect(text).toContain('ON');
  });

  test('カリングボタンがデフォルトでON', async ({ page }) => {
    const btn = page.locator('#btn-culling');
    const text = await btn.textContent();
    expect(text).toContain('ON');
  });

  test('LoD色分けボタンが存在する', async ({ page }) => {
    await expect(page.locator('#btn-lod-debug')).toBeVisible();
  });

  test('LoD色分けボタンをクリックすると表示が切り替わる', async ({ page }) => {
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );

    const btn = page.locator('#btn-lod-debug');
    await btn.click();
    await page.waitForTimeout(500);

    // デバッグモードが有効になっていることを確認
    const debugEnabled = await page.evaluate(() => window.gameApp.lodDebugMode);
    expect(debugEnabled).toBe(true);
  });

  test('リセットボタンが動作する', async ({ page }) => {
    // 移動
    await page.evaluate(() => {
      window.gameApp.viewX = 100;
      window.gameApp.viewZ = 100;
    });

    // リセット
    await page.click('#btn-reset');
    await page.waitForTimeout(500);

    // 視点が原点付近に戻る
    const position = await page.evaluate(() => ({
      x: window.gameApp.viewX,
      z: window.gameApp.viewZ
    }));
    expect(Math.abs(position.x)).toBeLessThan(16);
    expect(Math.abs(position.z)).toBeLessThan(16);
  });

  test('ストレージクリアボタンが動作する', async ({ page }) => {
    await page.click('#btn-clear-storage');
    await page.waitForTimeout(500);

    const count = await page.evaluate(async () => {
      const storage = new window.ChunkStorage();
      return await storage.getStoredChunkCount('world1');
    });
    expect(count).toBe(0);
  });
});

// ========================================
// TEST-2-3-11: 手動操作
// ========================================
test.describe('TEST-2-3-11: 手動操作', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('Wキーで北へ移動（Z+）', async ({ page }) => {
    const initialZ = await page.evaluate(() => window.gameApp.viewZ);

    await page.evaluate(() => {
      window.gameApp.keys.w = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.keys.w = false;
    });

    const newZ = await page.evaluate(() => window.gameApp.viewZ);
    expect(newZ).toBeGreaterThan(initialZ);
  });

  test('Sキーで南へ移動（Z-）', async ({ page }) => {
    const initialZ = await page.evaluate(() => window.gameApp.viewZ);

    await page.evaluate(() => {
      window.gameApp.keys.s = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.keys.s = false;
    });

    const newZ = await page.evaluate(() => window.gameApp.viewZ);
    expect(newZ).toBeLessThan(initialZ);
  });

  test('Aキーで西へ移動（X-）', async ({ page }) => {
    const initialX = await page.evaluate(() => window.gameApp.viewX);

    await page.evaluate(() => {
      window.gameApp.keys.a = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.keys.a = false;
    });

    const newX = await page.evaluate(() => window.gameApp.viewX);
    expect(newX).toBeLessThan(initialX);
  });

  test('Dキーで東へ移動（X+）', async ({ page }) => {
    const initialX = await page.evaluate(() => window.gameApp.viewX);

    await page.evaluate(() => {
      window.gameApp.keys.d = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.keys.d = false;
    });

    const newX = await page.evaluate(() => window.gameApp.viewX);
    expect(newX).toBeGreaterThan(initialX);
  });

  test('移動に応じてLoDが更新される', async ({ page }) => {
    // 初期のLoD別チャンク数を取得
    const initialCounts = await page.evaluate(() => window.gameApp.getLoDCounts());

    // 大きく移動
    await page.evaluate(() => {
      window.gameApp.keys.d = true;
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.gameApp.keys.d = false;
    });
    await page.waitForTimeout(1000);

    // LoD別チャンク数が更新されていることを確認
    const newCounts = await page.evaluate(() => window.gameApp.getLoDCounts());

    // 何らかの変化があることを確認（移動により再計算されている）
    const hasChange = JSON.stringify(initialCounts) !== JSON.stringify(newCounts);
    expect(hasChange).toBe(true);
  });
});

// ========================================
// TEST-2-3-11-1: カメラ操作（OrbitControls）
// ========================================
test.describe('TEST-2-3-11-1: カメラ操作（OrbitControls）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('マウスホイールでズームが変わる', async ({ page }) => {
    // 初期のカメラ位置を取得
    const initialDistance = await page.evaluate(() => {
      const camera = window.gameApp.camera;
      const target = window.gameApp.controls.target;
      return camera.position.distanceTo(target);
    });

    // キャンバスにフォーカスしてホイール操作
    const canvas = page.locator('#game-canvas');
    await canvas.click();
    await canvas.hover();

    // ホイールスクロール（ズームイン）
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(500);

    // カメラ距離が変わったか確認
    const newDistance = await page.evaluate(() => {
      const camera = window.gameApp.camera;
      const target = window.gameApp.controls.target;
      return camera.position.distanceTo(target);
    });

    expect(newDistance).not.toBe(initialDistance);
    expect(newDistance).toBeLessThan(initialDistance); // ズームインなので距離が縮まる
  });

  test('左ドラッグでカメラの角度が変わる', async ({ page }) => {
    // 初期のカメラ位置を取得
    const initialPosition = await page.evaluate(() => {
      const camera = window.gameApp.camera;
      return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    });

    // キャンバス上でドラッグ
    const canvas = page.locator('#game-canvas');
    const box = await canvas.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // カメラ位置が変わったか確認
    const newPosition = await page.evaluate(() => {
      const camera = window.gameApp.camera;
      return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    });

    // X または Z 位置が変わっていることを確認（回転によりカメラ位置が変わる）
    const positionChanged =
      Math.abs(newPosition.x - initialPosition.x) > 0.1 ||
      Math.abs(newPosition.z - initialPosition.z) > 0.1;
    expect(positionChanged).toBe(true);
  });

  test('視点移動時にカメラオフセットが維持される', async ({ page }) => {
    // 初期状態のカメラオフセット（ターゲットとの相対位置）を取得
    const initialOffset = await page.evaluate(() => {
      const camera = window.gameApp.camera;
      const target = window.gameApp.controls.target;
      return {
        x: camera.position.x - target.x,
        y: camera.position.y - target.y,
        z: camera.position.z - target.z
      };
    });

    // 視点を移動
    await page.evaluate(() => {
      window.gameApp.keys.d = true;
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.gameApp.keys.d = false;
    });
    await page.waitForTimeout(300);

    // 移動後のカメラオフセットを取得
    const newOffset = await page.evaluate(() => {
      const camera = window.gameApp.camera;
      const target = window.gameApp.controls.target;
      return {
        x: camera.position.x - target.x,
        y: camera.position.y - target.y,
        z: camera.position.z - target.z
      };
    });

    // オフセットが維持されていることを確認（許容誤差: 1.0）
    expect(Math.abs(newOffset.x - initialOffset.x)).toBeLessThan(1.0);
    expect(Math.abs(newOffset.y - initialOffset.y)).toBeLessThan(1.0);
    expect(Math.abs(newOffset.z - initialOffset.z)).toBeLessThan(1.0);
  });

  test('ドラッグ後の角度が視点移動で保持される', async ({ page }) => {
    // カメラを回転
    const canvas = page.locator('#game-canvas');
    const box = await canvas.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 回転後のカメラオフセットを取得
    const offsetAfterRotation = await page.evaluate(() => {
      const camera = window.gameApp.camera;
      const target = window.gameApp.controls.target;
      return {
        x: camera.position.x - target.x,
        y: camera.position.y - target.y,
        z: camera.position.z - target.z
      };
    });

    // 視点を移動
    await page.evaluate(() => {
      window.gameApp.keys.w = true;
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.gameApp.keys.w = false;
    });
    await page.waitForTimeout(300);

    // 移動後のカメラオフセットを取得
    const offsetAfterMove = await page.evaluate(() => {
      const camera = window.gameApp.camera;
      const target = window.gameApp.controls.target;
      return {
        x: camera.position.x - target.x,
        y: camera.position.y - target.y,
        z: camera.position.z - target.z
      };
    });

    // 回転で設定したオフセットが維持されていることを確認（許容誤差: 1.0）
    expect(Math.abs(offsetAfterMove.x - offsetAfterRotation.x)).toBeLessThan(1.0);
    expect(Math.abs(offsetAfterMove.y - offsetAfterRotation.y)).toBeLessThan(1.0);
    expect(Math.abs(offsetAfterMove.z - offsetAfterRotation.z)).toBeLessThan(1.0);
  });
});

// ========================================
// TEST-2-3-12: block_manager.html への統合
// ========================================
test.describe('TEST-2-3-12: block_manager.html への統合', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BLOCK_MANAGER_PATH);
    await page.waitForSelector('.tabs');
  });

  test('「LoDテスト」タブが存在する', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="lodTest"]');
    await expect(tab).toBeVisible();
    await expect(tab).toHaveText('LoDテスト');
  });

  test('タブをクリックするとコンテンツが表示される', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="lodTest"]');
    await tab.click();

    const content = page.locator('#lodTest');
    await expect(content).toHaveClass(/active/, { timeout: 5000 });
  });

  test('コンテンツ内にiframeが存在する', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="lodTest"]');
    await tab.click();
    await page.waitForTimeout(500);

    const iframe = page.locator('#lodTestFrame');
    const exists = await iframe.count();
    expect(exists).toBe(1);
  });

  test('iframeが正しいURLを参照している', async ({ page }) => {
    const iframe = page.locator('#lodTestFrame');
    const src = await iframe.getAttribute('src');
    expect(src).toContain('2-3_lod_test.html');
  });

  test('iframeが画面いっぱいに表示される', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="lodTest"]');
    await tab.click();
    await page.waitForTimeout(500);

    const iframe = page.locator('#lodTestFrame');
    const box = await iframe.boundingBox();

    if (box) {
      expect(box.width).toBeGreaterThan(100);
      expect(box.height).toBeGreaterThan(100);
    } else {
      const exists = await iframe.count();
      expect(exists).toBe(1);
    }
  });
});

// ========================================
// TEST-2-3-13: LoD色分け表示モード
// ========================================
test.describe('TEST-2-3-13: LoD色分け表示モード', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('LoD色分けモードでLoD 1は黄色になる', async ({ page }) => {
    // LoD 1 チャンクを表示するために範囲を広げる
    await page.fill('#input-total-range', '15');
    await page.locator('#input-total-range').blur();
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 49,
      { timeout: 60000 }
    );

    // 色分けモードを有効化
    await page.click('#btn-lod-debug');
    await page.waitForTimeout(500);

    // LoD 1 チャンクは頂点カラーを使用しているので material.color が存在する
    const color = await page.evaluate(() => {
      const mesh = window.gameApp.worldContainer.children.find(
        child => child.userData && child.userData.lodLevel === 1
      );
      if (!mesh || !mesh.material || !mesh.material.color) return null;
      return '#' + mesh.material.color.getHexString();
    });
    expect(color).toBe('#ffff00');
  });

  test('LoD色分けモードを解除すると元の表示に戻る', async ({ page }) => {
    // 色分けモードを有効化
    await page.click('#btn-lod-debug');
    await page.waitForTimeout(500);

    // 色分けモードを解除
    await page.click('#btn-lod-debug');
    await page.waitForTimeout(500);

    const debugMode = await page.evaluate(() => window.gameApp.lodDebugMode);
    expect(debugMode).toBe(false);
  });
});

// ========================================
// TEST-2-3-14: パフォーマンステスト
// ========================================
test.describe('TEST-2-3-14: パフォーマンステスト', () => {
  test('LoD 2/3 によりポリゴン数が大幅に削減される', async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });

    // 小さい範囲（全てLoD 0）
    await page.fill('#input-total-range', '7');
    await page.locator('#input-total-range').blur();
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 49,
      { timeout: 60000 }
    );
    const smallRangeTriangles = await page.evaluate(() => {
      let total = 0;
      window.gameApp.worldContainer.children.forEach(child => {
        if (child.geometry && child.geometry.index) {
          total += child.geometry.index.count / 3;
        }
      });
      return total;
    });

    // 大きい範囲（LoD 2/3含む）
    await page.fill('#input-total-range', '31');
    await page.locator('#input-total-range').blur();
    await page.waitForTimeout(3000);

    const largeRangeTriangles = await page.evaluate(() => {
      let total = 0;
      window.gameApp.worldContainer.children.forEach(child => {
        if (child.geometry && child.geometry.index) {
          total += child.geometry.index.count / 3;
        }
      });
      return total;
    });

    // 大きい範囲でも、ポリゴン数の増加が抑えられている
    // (全てLoD 0だと範囲の2乗に比例するが、LoD 2/3があるので線形に近い)
    const ratio = largeRangeTriangles / smallRangeTriangles;
    // 31/7 ≈ 4.4倍だが、LoD 2/3により増加率が抑えられる
    expect(ratio).toBeLessThan(10);
  });
});

// ========================================
// TEST-2-3-15: ワールド選択機能
// ========================================
test.describe('TEST-2-3-15: ワールド選択機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('ワールド選択ドロップダウンが存在する', async ({ page }) => {
    await expect(page.locator('#select-world')).toBeVisible();
  });

  test('フラットテストオプションが存在する', async ({ page }) => {
    const option = page.locator('#select-world option[value="flat"]');
    await expect(option).toHaveCount(1);
    await expect(option).toHaveText('フラットテスト');
  });

  test('簡易パーリンノイズオプションが存在する', async ({ page }) => {
    const option = page.locator('#select-world option[value="perlin"]');
    await expect(option).toHaveCount(1);
    await expect(option).toHaveText('簡易パーリンノイズ');
  });

  test('デフォルトはフラットテスト', async ({ page }) => {
    const value = await page.locator('#select-world').inputValue();
    expect(value).toBe('flat');
  });

  test('ワールドタイプを切り替えると地形が変わる', async ({ page }) => {
    // フラット地形の高さを取得（固定値64）
    const flatHeight = await page.evaluate(() => {
      return window.gameApp.chunkManager.worldGenerator.getTerrainHeight(0, 0);
    });
    expect(flatHeight).toBe(64);

    // パーリンノイズに切り替え
    await page.selectOption('#select-world', 'perlin');

    // チャンクが再生成されるまで待機
    await page.waitForTimeout(2000);

    // パーリンノイズ地形では座標によって高さが異なる
    const perlinHeights = await page.evaluate(() => {
      const wg = window.gameApp.chunkManager.worldGenerator;
      return {
        h1: wg.getTerrainHeight(0, 0),
        h2: wg.getTerrainHeight(100, 100),
        h3: wg.getTerrainHeight(200, 50)
      };
    });

    // パーリンノイズでは位置によって異なる高さになる（同じ値でない可能性が高い）
    // 少なくとも範囲内（40-100）であることを確認
    expect(perlinHeights.h1).toBeGreaterThanOrEqual(40);
    expect(perlinHeights.h1).toBeLessThanOrEqual(100);
    expect(perlinHeights.h2).toBeGreaterThanOrEqual(40);
    expect(perlinHeights.h2).toBeLessThanOrEqual(100);
  });

  test('パーリンノイズに切り替えるとチャンクが再生成される', async ({ page }) => {
    // 初期状態のチャンク数を確認
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() > 0,
      { timeout: 30000 }
    );

    // パーリンノイズに切り替え
    await page.selectOption('#select-world', 'perlin');

    // 再生成されるまで待機
    await page.waitForTimeout(3000);

    // チャンクが存在することを確認
    const chunkCount = await page.evaluate(() => {
      return window.gameApp.chunkManager.getLoadedChunkCount();
    });
    expect(chunkCount).toBeGreaterThan(0);

    // ワールドタイプがperlinに変更されていることを確認
    const worldType = await page.evaluate(() => {
      return window.gameApp.chunkManager.worldGenerator.worldType;
    });
    expect(worldType).toBe('perlin');
  });

  test('フラットに戻すと元の地形に戻る', async ({ page }) => {
    // パーリンノイズに切り替え
    await page.selectOption('#select-world', 'perlin');
    await page.waitForTimeout(2000);

    // フラットに戻す
    await page.selectOption('#select-world', 'flat');
    await page.waitForTimeout(2000);

    // フラット地形の高さ（固定値64）を確認
    const flatHeight = await page.evaluate(() => {
      return window.gameApp.chunkManager.worldGenerator.getTerrainHeight(0, 0);
    });
    expect(flatHeight).toBe(64);

    // ワールドタイプがflatに戻っていることを確認
    const worldType = await page.evaluate(() => {
      return window.gameApp.chunkManager.worldGenerator.worldType;
    });
    expect(worldType).toBe('flat');
  });
});

// ========================================
// TEST-2-3-16: パーリンノイズ山地形
// ========================================
test.describe('TEST-2-3-16: パーリンノイズ山地形', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // パーリンノイズに切り替え
    await page.selectOption('#select-world', 'perlin');
    await page.waitForTimeout(2000);
  });

  test('パーリンノイズの高さ範囲が40〜100である', async ({ page }) => {
    const heightRange = await page.evaluate(() => {
      const wg = window.gameApp.chunkManager.worldGenerator;
      return {
        min: wg.perlinMinHeight,
        max: wg.perlinMaxHeight
      };
    });
    expect(heightRange.min).toBe(40);
    expect(heightRange.max).toBe(100);
  });

  test('ノイズ2スケールが0.005である（山の間隔が広い）', async ({ page }) => {
    const scale = await page.evaluate(() => {
      return window.gameApp.chunkManager.worldGenerator.perlin2Scale;
    });
    expect(scale).toBe(0.005);
  });

  test('高さ64以上でノイズが強調される', async ({ page }) => {
    // 複数の座標で高さをサンプリングして、64以上の値が存在することを確認
    const heights = await page.evaluate(() => {
      const wg = window.gameApp.chunkManager.worldGenerator;
      const samples = [];
      // 広い範囲でサンプリング
      for (let x = 0; x < 1000; x += 50) {
        for (let z = 0; z < 1000; z += 50) {
          samples.push(wg.getTerrainHeight(x, z));
        }
      }
      return samples;
    });

    // 高さ64以上が存在することを確認（山が生成されている）
    const hasHighTerrain = heights.some(h => h >= 64);
    expect(hasHighTerrain).toBe(true);

    // 高さ40以下がないことを確認（最低値が40）
    const allAboveMin = heights.every(h => h >= 40);
    expect(allAboveMin).toBe(true);

    // 高さ100以上がないことを確認（最高値が100）
    const allBelowMax = heights.every(h => h <= 100);
    expect(allBelowMax).toBe(true);
  });

  test('隣接座標間の高さ差が3以下（段差がない）', async ({ page }) => {
    // 隣接座標間の高さ差をチェックして段差がないことを確認
    const maxHeightDiff = await page.evaluate(() => {
      const wg = window.gameApp.chunkManager.worldGenerator;
      let maxDiff = 0;

      // 広い範囲で隣接座標をチェック
      for (let x = 0; x < 500; x += 10) {
        for (let z = 0; z < 500; z += 10) {
          const h = wg.getTerrainHeight(x, z);
          const hRight = wg.getTerrainHeight(x + 1, z);
          const hForward = wg.getTerrainHeight(x, z + 1);

          maxDiff = Math.max(maxDiff, Math.abs(h - hRight));
          maxDiff = Math.max(maxDiff, Math.abs(h - hForward));
        }
      }

      return maxDiff;
    });

    // 隣接ブロック間の高さ差が3以下であることを確認（段差がない）
    expect(maxHeightDiff).toBeLessThanOrEqual(3);
  });

  test('LoD 2/3用の色が高さに応じて変化する', async ({ page }) => {
    const colors = await page.evaluate(() => {
      const wg = window.gameApp.chunkManager.worldGenerator;
      // 低地、中地、高地の代表的な高さで色を確認
      // _heightToColor メソッドを直接呼び出す
      return {
        low: wg._heightToColor(50),    // 低地
        mid: wg._heightToColor(70),    // 中地
        high: wg._heightToColor(90)    // 高地（山頂）
      };
    });

    // 低地は緑系（#で始まり、G成分が高い）
    expect(colors.low).toMatch(/^#[0-9a-f]{6}$/i);

    // 高地は灰色/茶色系（低地とは異なる色）
    expect(colors.high).not.toBe(colors.low);
  });

  test('総描画範囲を広げるとLoD3が生成される', async ({ page }) => {
    // 総描画範囲を63に設定
    await page.fill('#input-total-range', '63');
    await page.locator('#input-total-range').blur();

    // LoD3が生成されるまで待機
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoDCounts().lod3 > 0,
      { timeout: 30000 }
    );

    // LoD3のチャンク数を確認
    const lod3Count = await page.evaluate(() => {
      return window.gameApp.chunkManager.getLoDCounts().lod3;
    });

    // LoD3が生成されていることを確認
    expect(lod3Count).toBeGreaterThan(0);
  });
});

// ========================================
// TEST-2-3-17: パーリンノイズパラメータ設定
// ========================================
test.describe('TEST-2-3-17: パーリンノイズパラメータ設定', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // パーリンノイズに切り替え
    await page.selectOption('#select-world', 'perlin');
    await page.waitForTimeout(1000);
  });

  // --- UI要素の存在確認 ---
  test('ノイズ1シード入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-perlin1-seed')).toBeVisible();
  });

  test('ノイズ1スケール入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-perlin1-scale')).toBeVisible();
  });

  test('ノイズ1振幅入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-perlin1-amplitude')).toBeVisible();
  });

  test('ノイズ2シード入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-perlin2-seed')).toBeVisible();
  });

  test('ノイズ2スケール入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-perlin2-scale')).toBeVisible();
  });

  test('ノイズ2振幅入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-perlin2-amplitude')).toBeVisible();
  });

  test('ノイズ2山閾値入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-perlin2-threshold')).toBeVisible();
  });

  test('最低高さ入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-perlin-min-height')).toBeVisible();
  });

  test('最高高さ入力欄が存在する', async ({ page }) => {
    await expect(page.locator('#input-perlin-max-height')).toBeVisible();
  });

  // --- デフォルト値の確認 ---
  test('ノイズ1シードのデフォルト値は12345', async ({ page }) => {
    const value = await page.locator('#input-perlin1-seed').inputValue();
    expect(value).toBe('12345');
  });

  test('ノイズ1スケールのデフォルト値は0.02', async ({ page }) => {
    const value = await page.locator('#input-perlin1-scale').inputValue();
    expect(value).toBe('0.02');
  });

  test('ノイズ1振幅のデフォルト値は0.3', async ({ page }) => {
    const value = await page.locator('#input-perlin1-amplitude').inputValue();
    expect(value).toBe('0.3');
  });

  test('ノイズ2シードのデフォルト値は67890', async ({ page }) => {
    const value = await page.locator('#input-perlin2-seed').inputValue();
    expect(value).toBe('67890');
  });

  test('ノイズ2スケールのデフォルト値は0.005', async ({ page }) => {
    const value = await page.locator('#input-perlin2-scale').inputValue();
    expect(value).toBe('0.005');
  });

  test('ノイズ2振幅のデフォルト値は1.0', async ({ page }) => {
    const value = await page.locator('#input-perlin2-amplitude').inputValue();
    expect(value).toBe('1');
  });

  test('ノイズ2山閾値のデフォルト値は60', async ({ page }) => {
    const value = await page.locator('#input-perlin2-threshold').inputValue();
    expect(value).toBe('60');
  });

  test('最低高さのデフォルト値は40', async ({ page }) => {
    const value = await page.locator('#input-perlin-min-height').inputValue();
    expect(value).toBe('40');
  });

  test('最高高さのデフォルト値は100', async ({ page }) => {
    const value = await page.locator('#input-perlin-max-height').inputValue();
    expect(value).toBe('100');
  });

  // --- パラメータ変更の動作確認 ---
  test('ノイズ1シードを変更すると地形が変わる', async ({ page }) => {
    // 変更前の高さを取得
    const heightBefore = await page.evaluate(() => {
      return window.gameApp.chunkManager.worldGenerator.getTerrainHeight(100, 100);
    });

    // シードを変更
    await page.fill('#input-perlin1-seed', '99999');
    await page.locator('#input-perlin1-seed').blur();
    await page.waitForTimeout(1000);

    // 変更後の高さを取得
    const heightAfter = await page.evaluate(() => {
      return window.gameApp.chunkManager.worldGenerator.getTerrainHeight(100, 100);
    });

    // 高さが変わっていることを確認（シードが変わると地形が変わる）
    expect(heightAfter).not.toBe(heightBefore);
  });

  test('ノイズ2スケールを変更するとWorldGeneratorに反映される', async ({ page }) => {
    // スケールを変更
    await page.fill('#input-perlin2-scale', '0.01');
    await page.locator('#input-perlin2-scale').blur();
    await page.waitForTimeout(500);

    // WorldGeneratorのパラメータを確認
    const scale = await page.evaluate(() => {
      return window.gameApp.chunkManager.worldGenerator.perlin2Scale;
    });

    expect(scale).toBe(0.01);
  });

  test('山閾値を超えると振幅が3倍になる', async ({ page }) => {
    // 山閾値を低く設定して効果を確認しやすくする
    await page.fill('#input-perlin2-threshold', '50');
    await page.locator('#input-perlin2-threshold').blur();
    await page.waitForTimeout(1000);

    // 複数座標で高さをサンプリング
    const heights = await page.evaluate(() => {
      const wg = window.gameApp.chunkManager.worldGenerator;
      const samples = [];
      for (let x = 0; x < 500; x += 20) {
        for (let z = 0; z < 500; z += 20) {
          samples.push(wg.getTerrainHeight(x, z));
        }
      }
      return samples;
    });

    // 山閾値（50）を大きく超える高さが存在することを確認
    // 振幅3倍により、より高い山が生成される
    const hasHighMountain = heights.some(h => h > 70);
    expect(hasHighMountain).toBe(true);
  });

  test('2つのノイズが合成されて地形が生成される', async ({ page }) => {
    // WorldGeneratorが2層ノイズを使用していることを確認
    const hasMultipleNoise = await page.evaluate(() => {
      const wg = window.gameApp.chunkManager.worldGenerator;
      // 両方のノイズパラメータが存在することを確認
      return (
        typeof wg.perlin1Seed === 'number' &&
        typeof wg.perlin2Seed === 'number' &&
        typeof wg.perlin1Scale === 'number' &&
        typeof wg.perlin2Scale === 'number' &&
        typeof wg.perlin1Amplitude === 'number' &&
        typeof wg.perlin2Amplitude === 'number'
      );
    });

    expect(hasMultipleNoise).toBe(true);
  });

  test('パラメータ変更時にワールドが再生成される', async ({ page }) => {
    // チャンク数を取得
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() > 0,
      { timeout: 30000 }
    );

    // パラメータを変更
    await page.fill('#input-perlin1-seed', '11111');
    await page.locator('#input-perlin1-seed').blur();

    // 再生成が完了するまで待機
    await page.waitForTimeout(2000);

    // チャンクが再生成されていることを確認
    const chunkCount = await page.evaluate(() => {
      return window.gameApp.chunkManager.getLoadedChunkCount();
    });
    expect(chunkCount).toBeGreaterThan(0);

    // パラメータが反映されていることを確認
    const seed = await page.evaluate(() => {
      return window.gameApp.chunkManager.worldGenerator.perlin1Seed;
    });
    expect(seed).toBe(11111);
  });
});
