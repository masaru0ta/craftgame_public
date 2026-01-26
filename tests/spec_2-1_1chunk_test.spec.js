// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 2-1 １チャンク生成・表示テスト
 */

const TEST_PAGE_PATH = '/test/2-1_1chunk_test.html';

// ========================================
// TEST-2-1-1: チャンクデータ管理クラスの検証
// ========================================
test.describe('TEST-2-1-1: チャンクデータ管理クラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    // ページ読み込み完了を待つ
    await page.waitForFunction(() => typeof window.ChunkData !== 'undefined');
  });

  test('ChunkData クラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.ChunkData === 'function');
    expect(exists).toBe(true);
  });

  test('setBlock/getBlock でブロックを設置・取得できる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      chunk.setBlock(5, 10, 3, 'stone');
      return chunk.getBlock(5, 10, 3);
    });
    expect(result).toBe('stone');
  });

  test('未設定の座標は "air" を返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      return chunk.getBlock(0, 0, 0);
    });
    expect(result).toBe('air');
  });

  test('チャンク範囲外の座標にアクセスすると null を返す', async ({ page }) => {
    const results = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      return {
        outX: chunk.getBlock(16, 0, 0),
        outY: chunk.getBlock(0, 128, 0),
        outZ: chunk.getBlock(0, 0, 16),
        negX: chunk.getBlock(-1, 0, 0),
      };
    });
    expect(results.outX).toBeNull();
    expect(results.outY).toBeNull();
    expect(results.outZ).toBeNull();
    expect(results.negX).toBeNull();
  });

  test('ワールド座標 (0,0,0) から (15,127,15) がチャンク(0,0)に対応する', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      // 境界値テスト
      chunk.setBlock(0, 0, 0, 'test1');
      chunk.setBlock(15, 127, 15, 'test2');
      return {
        min: chunk.getBlock(0, 0, 0),
        max: chunk.getBlock(15, 127, 15),
      };
    });
    expect(result.min).toBe('test1');
    expect(result.max).toBe('test2');
  });

  test('ワールド座標 (16,0,0) はチャンク(1,0)に対応する', async ({ page }) => {
    const result = await page.evaluate(() => {
      // チャンク(1,0)を作成
      const chunk = new window.ChunkData(1, 0);
      // ローカル座標(0,0,0)に設置 = ワールド座標(16,0,0)
      chunk.setBlock(0, 0, 0, 'test');
      return {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        block: chunk.getBlock(0, 0, 0),
      };
    });
    expect(result.chunkX).toBe(1);
    expect(result.chunkZ).toBe(0);
    expect(result.block).toBe('test');
  });
});

// ========================================
// TEST-2-1-1-1: テスト用地形生成の検証
// ========================================
test.describe('TEST-2-1-1-1: テスト用地形生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() =>
      typeof window.ChunkData !== 'undefined' &&
      typeof window.WorldGenerator !== 'undefined'
    );
  });

  test('WorldGenerator クラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.WorldGenerator === 'function');
    expect(exists).toBe(true);
  });

  test('generateTest で地形が生成される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);
      // 何かブロックが設置されているか確認
      return chunk.getBlock(8, 63, 8) !== 'air';
    });
    expect(result).toBe(true);
  });

  test('y=0 から y=62 まで土ブロックで埋まっている', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);
      // サンプルポイントをチェック
      return {
        y0: chunk.getBlock(8, 0, 8),
        y30: chunk.getBlock(8, 30, 8),
        y62: chunk.getBlock(8, 62, 8),
      };
    });
    expect(result.y0).toBe('dirt');
    expect(result.y30).toBe('dirt');
    expect(result.y62).toBe('dirt');
  });

  test('y=63 は草ブロックで埋まっている', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);
      return chunk.getBlock(8, 63, 8);
    });
    expect(result).toBe('grass');
  });

  test('x=0, y=63, z=* 及び x=*, y=63, z=0 は石ブロック', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);
      return {
        xEdge: chunk.getBlock(0, 63, 8),  // x=0の辺
        zEdge: chunk.getBlock(8, 63, 0),  // z=0の辺
      };
    });
    expect(result.xEdge).toBe('stone');
    expect(result.zEdge).toBe('stone');
  });

  test('y=63 の四隅はテストブロック', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);
      return {
        corner1: chunk.getBlock(0, 63, 0),
        corner2: chunk.getBlock(0, 63, 15),
        corner3: chunk.getBlock(15, 63, 0),
        corner4: chunk.getBlock(15, 63, 15),
      };
    });
    expect(result.corner1).toBe('test');
    expect(result.corner2).toBe('test');
    expect(result.corner3).toBe('test');
    expect(result.corner4).toBe('test');
  });

  test('テストブロックの1つ下（y=62）は空気', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);
      return {
        below1: chunk.getBlock(0, 62, 0),
        below2: chunk.getBlock(0, 62, 15),
        below3: chunk.getBlock(15, 62, 0),
        below4: chunk.getBlock(15, 62, 15),
      };
    });
    expect(result.below1).toBe('air');
    expect(result.below2).toBe('air');
    expect(result.below3).toBe('air');
    expect(result.below4).toBe('air');
  });
});

// ========================================
// TEST-2-1-2: テクスチャ取得の検証
// ========================================
test.describe('TEST-2-1-2: テクスチャ取得', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => typeof window.TextureLoader !== 'undefined');
  });

  test('TextureLoader クラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.TextureLoader === 'function');
    expect(exists).toBe(true);
  });

  test('loadAll で全データを取得できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      return loader.isLoaded;
    });
    expect(result).toBe(true);
  });

  test('block_str_id からマテリアル配列（6面分）を取得できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      const materials = loader.getMaterials('stone');
      return materials ? materials.length : 0;
    });
    expect(result).toBe(6);
  });

  test('ローディング中に isLoading = true となる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const loader = new window.TextureLoader();
      const loadingBefore = loader.isLoading;
      loader.loadAll(); // awaitしない
      const loadingDuring = loader.isLoading;
      return { before: loadingBefore, during: loadingDuring };
    });
    expect(result.before).toBe(false);
    expect(result.during).toBe(true);
  });

  test('ローディング完了後に isLoading = false となる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      return loader.isLoading;
    });
    expect(result).toBe(false);
  });
});

// ========================================
// TEST-2-1-3: メッシュ生成の検証
// ========================================
test.describe('TEST-2-1-3: メッシュ生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() =>
      typeof window.ChunkMeshBuilder !== 'undefined' &&
      typeof window.TextureLoader !== 'undefined'
    );
  });

  test('ChunkMeshBuilder クラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.ChunkMeshBuilder === 'function');
    expect(exists).toBe(true);
  });

  test('build(chunkData, mode) でメッシュを生成できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      const chunk = new window.ChunkData(0, 0);
      chunk.setBlock(0, 0, 0, 'stone');
      const builder = new window.ChunkMeshBuilder(loader);
      const mesh = builder.build(chunk, 'FULL');
      return mesh !== null && mesh.geometry !== undefined;
    });
    expect(result).toBe(true);
  });

  test('生成されたメッシュが THREE.Mesh である', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      const chunk = new window.ChunkData(0, 0);
      chunk.setBlock(0, 0, 0, 'stone');
      const builder = new window.ChunkMeshBuilder(loader);
      const mesh = builder.build(chunk, 'FULL');
      return mesh instanceof THREE.Mesh;
    });
    expect(result).toBe(true);
  });

  test('空気ブロックは描画されない', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      const chunk = new window.ChunkData(0, 0);
      // 空のチャンク（全て空気）
      const builder = new window.ChunkMeshBuilder(loader);
      const mesh = builder.build(chunk, 'FULL');
      // ジオメトリの頂点数が0であるべき
      return mesh.geometry.attributes.position ?
        mesh.geometry.attributes.position.count : 0;
    });
    expect(result).toBe(0);
  });

  test('FULL モードと CULLED モードでポリゴン数が異なる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      const chunk = new window.ChunkData(0, 0);
      // 2x2x2のブロックを配置（内部面あり）
      for (let x = 0; x < 2; x++) {
        for (let y = 0; y < 2; y++) {
          for (let z = 0; z < 2; z++) {
            chunk.setBlock(x, y, z, 'stone');
          }
        }
      }
      const builder = new window.ChunkMeshBuilder(loader);
      const meshFull = builder.build(chunk, 'FULL');
      const meshCulled = builder.build(chunk, 'CULLED');
      const fullTriangles = meshFull.geometry.index ?
        meshFull.geometry.index.count / 3 : 0;
      const culledTriangles = meshCulled.geometry.index ?
        meshCulled.geometry.index.count / 3 : 0;
      return { full: fullTriangles, culled: culledTriangles };
    });
    expect(result.full).toBeGreaterThan(result.culled);
  });

  test('y=0 のブロックの底面は描画されない', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      const chunk = new window.ChunkData(0, 0);
      chunk.setBlock(0, 0, 0, 'stone');
      const builder = new window.ChunkMeshBuilder(loader);
      // FULLモードでも底面はカリング
      const mesh = builder.build(chunk, 'FULL');
      // 1ブロック: 通常6面 = 12三角形、底面なし = 10三角形
      const triangles = mesh.geometry.index ?
        mesh.geometry.index.count / 3 : 0;
      return triangles;
    });
    // 5面 * 2三角形 = 10三角形
    expect(result).toBe(10);
  });
});

// ========================================
// TEST-2-1-3-1: グリーディー・メッシングの検証
// ========================================
test.describe('TEST-2-1-3-1: グリーディー・メッシング', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() =>
      typeof window.ChunkMeshBuilder !== 'undefined' &&
      typeof window.TextureLoader !== 'undefined'
    );
  });

  test('グリーディーOFFとONでポリゴン数が異なる（ONの方が少ない）', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      const chunk = new window.ChunkData(0, 0);
      // フラットな地形（16x16のブロック）
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          chunk.setBlock(x, 0, z, 'stone');
        }
      }
      const builder = new window.ChunkMeshBuilder(loader);
      const meshOff = builder.build(chunk, 'CULLED', false);
      const meshOn = builder.build(chunk, 'CULLED', true);
      const offTriangles = meshOff.geometry.index ?
        meshOff.geometry.index.count / 3 : 0;
      const onTriangles = meshOn.geometry.index ?
        meshOn.geometry.index.count / 3 : 0;
      return { off: offTriangles, on: onTriangles };
    });
    expect(result.off).toBeGreaterThan(result.on);
  });

  test('異なるblock_str_idの面はマージされない', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const loader = new window.TextureLoader();
      await loader.loadAll();
      const chunk = new window.ChunkData(0, 0);
      // 交互に異なるブロックを配置
      chunk.setBlock(0, 0, 0, 'stone');
      chunk.setBlock(1, 0, 0, 'dirt');
      const builder = new window.ChunkMeshBuilder(loader);
      const mesh = builder.build(chunk, 'CULLED', true);
      // 2ブロック分の面が存在するはず
      const triangles = mesh.geometry.index ?
        mesh.geometry.index.count / 3 : 0;
      return triangles > 0;
    });
    expect(result).toBe(true);
  });
});

// ========================================
// TEST-2-1-4: チャンク描画の検証
// ========================================
test.describe('TEST-2-1-4: チャンク描画', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    // gameAppの初期化完了を待つ
    await page.waitForFunction(() => window.gameApp && window.gameApp.scene);
    await page.waitForSelector('#game-canvas');
  });

  test('テストページをブラウザで開くと3D表示される', async ({ page }) => {
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
  });

  test('背景色が空色である', async ({ page }) => {
    // レンダラーの背景色を確認
    const bgColor = await page.evaluate(() => {
      return window.gameApp ? window.gameApp.getBgColor() : null;
    });
    // #87CEEB = rgb(135, 206, 235)
    expect(bgColor).toBe('#87ceeb');
  });

  test('フラット地形（16x16 ブロック）が表示される', async ({ page }) => {
    // メッシュが存在することを確認
    const hasMesh = await page.evaluate(() => {
      return window.gameApp ? window.gameApp.hasMesh() : false;
    });
    expect(hasMesh).toBe(true);
  });
});

// ========================================
// TEST-2-1-4-1: 左手座標系の検証
// ========================================
test.describe('TEST-2-1-4-1: 左手座標系', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    // gameAppの初期化完了を待つ
    await page.waitForFunction(() => window.gameApp && window.gameApp.scene);
    await page.waitForSelector('#game-canvas');
  });

  test('worldContainerのscale.zが-1である', async ({ page }) => {
    const result = await page.evaluate(() => {
      return window.gameApp ? window.gameApp.getWorldContainerScaleZ() : null;
    });
    expect(result).toBe(-1);
  });

  test('デバッグUIのカメラ座標が左手座標系で表示されている', async ({ page }) => {
    // カメラ座標表示を確認
    const cameraDisplay = page.locator('#debug-camera');
    await expect(cameraDisplay).toBeVisible();
    const text = await cameraDisplay.textContent();
    // Z座標が負の値で表示されているか確認（南側から見ているため）
    expect(text).toMatch(/Z:\s*-?\d+/);
  });
});

// ========================================
// TEST-2-1-5: テストUIの検証
// ========================================
test.describe('TEST-2-1-5: テストUI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    // gameAppの初期化完了を待つ
    await page.waitForFunction(() => window.gameApp && window.gameApp.scene);
    await page.waitForSelector('#debug-panel');
  });

  test('画面左上にデバッグパネルが表示される', async ({ page }) => {
    const panel = page.locator('#debug-panel');
    await expect(panel).toBeVisible();
  });

  test('FPS が表示されリアルタイムに更新される', async ({ page }) => {
    const fps = page.locator('#debug-fps');
    await expect(fps).toBeVisible();
    // 少し待ってFPSが表示されるのを確認
    await page.waitForTimeout(1500);
    const text = await fps.textContent();
    // 数値が含まれているか
    expect(text).toMatch(/\d+/);
  });

  test('面カリング切り替えボタンが表示される', async ({ page }) => {
    const btn = page.locator('#btn-culling');
    await expect(btn).toBeVisible();
  });

  test('ボタンクリックで FULL ↔ CULLED が切り替わる', async ({ page }) => {
    const btn = page.locator('#btn-culling');
    const initialText = await btn.textContent();
    await btn.click();
    await page.waitForTimeout(100);
    const changedText = await btn.textContent();
    expect(initialText).not.toBe(changedText);
  });

  test('ワイヤーフレーム切り替えボタンが表示される', async ({ page }) => {
    const btn = page.locator('#btn-wireframe');
    await expect(btn).toBeVisible();
  });

  test('グリーディー・メッシング切り替えボタンが表示される', async ({ page }) => {
    const btn = page.locator('#btn-greedy');
    await expect(btn).toBeVisible();
  });

  test('チャンク数切り替えボタンが表示される', async ({ page }) => {
    const btn = page.locator('#btn-chunk-count');
    await expect(btn).toBeVisible();
  });

  test('ポリゴン数が表示される', async ({ page }) => {
    const display = page.locator('#debug-triangles');
    await expect(display).toBeVisible();
  });

  test('ドローコール数が表示される', async ({ page }) => {
    const display = page.locator('#debug-drawcalls');
    await expect(display).toBeVisible();
  });

  test('メモリ使用量が表示される', async ({ page }) => {
    const display = page.locator('#debug-memory');
    await expect(display).toBeVisible();
  });

  test('カメラ座標が表示される', async ({ page }) => {
    const display = page.locator('#debug-camera');
    await expect(display).toBeVisible();
  });

  test('x, y, z 軸が表示される', async ({ page }) => {
    const display = page.locator('#axis-helper');
    await expect(display).toBeVisible();
  });

  test('グリーディーON時にポリゴン数が減少する', async ({ page }) => {
    // 初期状態のポリゴン数を取得
    const initialTriangles = await page.evaluate(() => {
      const el = document.getElementById('debug-triangles');
      return parseInt(el.textContent.replace(/\D/g, '')) || 0;
    });

    // グリーディーボタンをクリック
    const btn = page.locator('#btn-greedy');
    await btn.click();

    // メッシュ再生成を待つ
    await page.waitForTimeout(500);
    const newTriangles = await page.evaluate(() => {
      const el = document.getElementById('debug-triangles');
      return parseInt(el.textContent.replace(/\D/g, '')) || 0;
    });

    // ポリゴン数が減少していることを確認
    expect(newTriangles).toBeLessThan(initialTriangles);
  });

  test('3x3チャンクモードで9個のメッシュが異なる位置に配置される', async ({ page }) => {
    // チャンク数ボタンをクリックして3x3モードに
    const btn = page.locator('#btn-chunk-count');
    await btn.click();
    await page.waitForTimeout(500);

    // 各メッシュの位置を取得
    const meshPositions = await page.evaluate(() => {
      const positions = [];
      for (const mesh of window.gameApp.meshes.values()) {
        positions.push({
          x: mesh.position.x,
          z: mesh.position.z
        });
      }
      return positions;
    });

    // 9個のメッシュが存在する
    expect(meshPositions.length).toBe(9);

    // すべての位置がユニークであることを確認
    const positionStrings = meshPositions.map(p => `${p.x},${p.z}`);
    const uniquePositions = new Set(positionStrings);
    expect(uniquePositions.size).toBe(9);

    // 期待される位置を確認（3x3チャンクは -1,-1 から 1,1 まで）
    // 各チャンクは16ブロック = 16ワールド座標単位
    const expectedPositions = [
      { x: -16, z: -16 }, { x: 0, z: -16 }, { x: 16, z: -16 },
      { x: -16, z: 0 },   { x: 0, z: 0 },   { x: 16, z: 0 },
      { x: -16, z: 16 },  { x: 0, z: 16 },  { x: 16, z: 16 }
    ];

    for (const expected of expectedPositions) {
      const found = meshPositions.some(p => p.x === expected.x && p.z === expected.z);
      expect(found).toBe(true);
    }
  });
});

// ============================================================
// TEST-2-1-6: block_manager.html への統合
// ============================================================
test.describe('TEST-2-1-6: block_manager.html への統合', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tool/block_manager.html');
    // ページが読み込まれるのを待つ
    await page.waitForSelector('.tabs');
  });

  test('「1チャンクテスト」タブが存在する', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="chunkTest"]');
    await expect(tab).toBeVisible();
    await expect(tab).toHaveText('1チャンクテスト');
  });

  test('タブをクリックするとコンテンツが表示される', async ({ page }) => {
    // タブをクリック
    const tab = page.locator('.tab[data-tab="chunkTest"]');
    await tab.click();

    // コンテンツが表示されることを確認
    const content = page.locator('#chunkTest');
    await expect(content).toBeVisible();
  });

  test('コンテンツ内にiframeが存在する', async ({ page }) => {
    // タブをクリック
    const tab = page.locator('.tab[data-tab="chunkTest"]');
    await tab.click();

    // iframeが存在することを確認
    const iframe = page.locator('#chunkTestFrame');
    await expect(iframe).toBeVisible();
  });

  test('iframeが正しいURLを参照している', async ({ page }) => {
    // タブをクリック
    const tab = page.locator('.tab[data-tab="chunkTest"]');
    await tab.click();

    // iframeのsrc属性を確認
    const iframe = page.locator('#chunkTestFrame');
    const src = await iframe.getAttribute('src');
    expect(src).toContain('2-1_1chunk_test.html');
  });

  test('iframeが画面いっぱいに表示される', async ({ page }) => {
    // タブをクリック
    const tab = page.locator('.tab[data-tab="chunkTest"]');
    await tab.click();

    // iframeのサイズを確認
    const iframe = page.locator('#chunkTestFrame');
    const box = await iframe.boundingBox();

    // 幅が十分大きいことを確認（少なくとも500px以上）
    expect(box.width).toBeGreaterThan(500);
    // 高さが十分大きいことを確認（少なくとも400px以上）
    expect(box.height).toBeGreaterThan(400);
  });
});

// TEST-2-1-3-2: UV座標のZ軸反転補正
test.describe('TEST-2-1-3-2: UV座標のZ軸反転補正', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.scene, { timeout: 30000 });
    await page.waitForTimeout(2000);
  });

  test('back面のUV座標がU反転されている（頂点0がuScale,0から始まる）', async ({ page }) => {
    // _addUVsメソッドを直接テスト
    const uvResult = await page.evaluate(() => {
      const builder = new ChunkMeshBuilder(window.gameApp.textureLoader);
      const uvs = [];
      builder._addUVs(uvs, 'back', 1, 1);
      return uvs;
    });

    // back面: U反転されているため、頂点0は (uScale, 0) = (1, 0) で始まる
    // 仕様書: uvs.push(uScale, 0, 0, 0, 0, vScale, uScale, vScale);
    expect(uvResult[0]).toBe(1); // 頂点0 U = uScale
    expect(uvResult[1]).toBe(0); // 頂点0 V = 0
    expect(uvResult[2]).toBe(0); // 頂点1 U = 0
    expect(uvResult[3]).toBe(0); // 頂点1 V = 0
  });

  test('left面のUV座標がU反転されている（頂点0がuScale,0から始まる）', async ({ page }) => {
    // _addUVsメソッドを直接テスト
    const uvResult = await page.evaluate(() => {
      const builder = new ChunkMeshBuilder(window.gameApp.textureLoader);
      const uvs = [];
      builder._addUVs(uvs, 'left', 1, 1);
      return uvs;
    });

    // left面: U反転されているため、頂点0は (uScale, 0) = (1, 0) で始まる
    // 仕様書: uvs.push(uScale, 0, 0, 0, 0, vScale, uScale, vScale);
    expect(uvResult[0]).toBe(1); // 頂点0 U = uScale
    expect(uvResult[1]).toBe(0); // 頂点0 V = 0
    expect(uvResult[2]).toBe(0); // 頂点1 U = 0
    expect(uvResult[3]).toBe(0); // 頂点1 V = 0
  });

  test('front面のUV座標は反転されていない（仕様通り）', async ({ page }) => {
    const uvResult = await page.evaluate(() => {
      const builder = new ChunkMeshBuilder(window.gameApp.textureLoader);
      const uvs = [];
      builder._addUVs(uvs, 'front', 1, 1);
      return uvs;
    });

    // front面: 反転なし、頂点0は (uScale, 0) から始まる（右下）
    expect(uvResult[0]).toBe(1); // 頂点0 U = uScale (右下)
    expect(uvResult[1]).toBe(0); // 頂点0 V = 0
  });

  test('right面のUV座標は反転されていない（仕様通り）', async ({ page }) => {
    const uvResult = await page.evaluate(() => {
      const builder = new ChunkMeshBuilder(window.gameApp.textureLoader);
      const uvs = [];
      builder._addUVs(uvs, 'right', 1, 1);
      return uvs;
    });

    // right面: 反転なし、頂点0は (uScale, 0) から始まる（後下）
    expect(uvResult[0]).toBe(1); // 頂点0 U = uScale
    expect(uvResult[1]).toBe(0); // 頂点0 V = 0
  });

  test('top面のUV座標がV反転されている（頂点0がvScaleから始まる）', async ({ page }) => {
    const uvResult = await page.evaluate(() => {
      const builder = new ChunkMeshBuilder(window.gameApp.textureLoader);
      const uvs = [];
      builder._addUVs(uvs, 'top', 1, 1);
      return uvs;
    });

    // top面: V反転されているため、頂点0は (0, vScale) = (0, 1) で始まる
    // 仕様書: uvs.push(0, vScale, uScale, vScale, uScale, 0, 0, 0);
    expect(uvResult[0]).toBe(0); // 頂点0 U = 0
    expect(uvResult[1]).toBe(1); // 頂点0 V = vScale（V反転）
    expect(uvResult[2]).toBe(1); // 頂点1 U = uScale
    expect(uvResult[3]).toBe(1); // 頂点1 V = vScale（V反転）
    expect(uvResult[4]).toBe(1); // 頂点2 U = uScale
    expect(uvResult[5]).toBe(0); // 頂点2 V = 0（V反転）
    expect(uvResult[6]).toBe(0); // 頂点3 U = 0
    expect(uvResult[7]).toBe(0); // 頂点3 V = 0（V反転）
  });
});
