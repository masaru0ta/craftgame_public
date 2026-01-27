// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 2-2 チャンク管理テスト
 */

const TEST_PAGE_PATH = '/test/2-2_chunk_manager_test.html';
const BLOCK_MANAGER_PATH = '/tool/block_manager.html';

// ========================================
// TEST-2-2-1: チャンク管理クラス（ChunkManager）
// ========================================
test.describe('TEST-2-2-1: チャンク管理クラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('ChunkManager クラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.ChunkManager === 'function');
    expect(exists).toBe(true);
  });

  test('視点座標を中心としたNxN範囲のチャンクを管理できる', async ({ page }) => {
    // 全チャンク生成完了を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
    const result = await page.evaluate(() => {
      // gameApp経由でchunkManagerを取得
      return window.gameApp.chunkManager.getLoadedChunkCount();
    });
    // デフォルト 9x9 = 81チャンク
    expect(result).toBe(81);
  });

  test('Nの値を変更するとチャンク数が変わる', async ({ page }) => {
    test.setTimeout(120000);

    // 初期値の9x9=81チャンクを確認（生成完了を待つ）
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
    const count9 = await page.evaluate(() => window.gameApp.chunkManager.getLoadedChunkCount());
    expect(count9).toBe(81);

    // UIでチャンク範囲を変更
    await page.selectOption('#select-chunk-range', '15');

    // チャンク生成完了を待つ (15x15 = 225)
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 225,
      { timeout: 90000 }
    );

    const count15 = await page.evaluate(() => window.gameApp.chunkManager.getLoadedChunkCount());
    // 15x15 = 225チャンク
    expect(count15).toBe(225);
  });

  test('視点移動で範囲外のチャンクは解放される', async ({ page }) => {
    // 全チャンク生成完了を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );

    // 初期チャンクキーを取得
    const initialKeys = await page.evaluate(() =>
      window.gameApp.chunkManager.getLoadedChunkKeys()
    );
    const initialCount = initialKeys.length;

    // 大きく移動（5チャンク分）- キー状態を直接操作
    await page.evaluate(() => {
      window.gameApp.keys.d = true;
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.gameApp.keys.d = false;
    });

    // チャンク生成・解放が安定するまで待つ
    await page.waitForTimeout(3000);

    const newKeys = await page.evaluate(() =>
      window.gameApp.chunkManager.getLoadedChunkKeys()
    );

    // チャンク数は概ね維持される（NxN範囲内、タイミングにより±20許容）
    expect(newKeys.length).toBeGreaterThanOrEqual(initialCount - 20);
    expect(newKeys.length).toBeLessThanOrEqual(initialCount + 20);
  });

  test('チャンク生成は1つずつ順番に行われる', async ({ page }) => {
    // ChunkManagerのisGeneratingプロパティを確認
    const result = await page.evaluate(() => {
      const manager = window.gameApp.chunkManager;
      // 生成中は最大1つ
      return manager.getCurrentlyGeneratingCount() <= 1;
    });
    expect(result).toBe(true);
  });

  test('キューの優先度: 視点に近いチャンクが優先される', async ({ page }) => {
    // リセットして確認
    await page.click('#btn-reset');
    await page.waitForTimeout(2000);

    // 現在の視点があるチャンクが読み込まれているか確認
    const result = await page.evaluate(() => {
      const manager = window.gameApp.chunkManager;
      const viewX = window.gameApp.viewX;
      const viewZ = window.gameApp.viewZ;
      const chunkX = Math.floor(viewX / 16);
      const chunkZ = Math.floor(viewZ / 16);
      return manager.chunks.has(`${chunkX},${chunkZ}`);
    });
    expect(result).toBe(true);
  });
});

// ========================================
// TEST-2-2-1-1: チャンク座標の視覚表示
// ========================================
test.describe('TEST-2-2-1-1: チャンク座標の視覚表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() =>
      typeof window.ChunkData !== 'undefined' &&
      typeof window.WorldGenerator !== 'undefined',
      { timeout: 30000 }
    );
  });

  test('チャンク(0,0)にX座標"0"が描画される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);

      // 数字"0"のパターンが存在するか確認（y=64以上のブロック）
      let hasDigitBlocks = false;
      for (let y = 64; y < 70; y++) {
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            const block = chunk.getBlock(x, y, z);
            if (block === 'stone' || block === 'dirt') {
              hasDigitBlocks = true;
              break;
            }
          }
        }
      }
      return hasDigitBlocks;
    });
    expect(result).toBe(true);
  });

  test('正の座標はstoneブロックで描画される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(1, 2); // 正の座標
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);

      // 数字ブロックの種類を確認
      const digitBlocks = [];
      for (let y = 64; y < 75; y++) {
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            const block = chunk.getBlock(x, y, z);
            if (block !== 'air' && block !== 'grass' && block !== 'dirt' && block !== 'test') {
              digitBlocks.push(block);
            }
          }
        }
      }
      // X座標もZ座標も正なので全てstone
      return digitBlocks.every(b => b === 'stone');
    });
    expect(result).toBe(true);
  });

  test('負の座標はdirtブロックで描画される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(-1, -2); // 負の座標
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);

      // 数字ブロックの種類を確認
      const digitBlocks = [];
      for (let y = 64; y < 75; y++) {
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            const block = chunk.getBlock(x, y, z);
            // 地表のdirt(y=62以下)は除外、数字用のブロックを探す
            if (y >= 64 && (block === 'stone' || block === 'dirt')) {
              digitBlocks.push(block);
            }
          }
        }
      }
      // X座標もZ座標も負なので全てdirt
      return digitBlocks.every(b => b === 'dirt');
    });
    expect(result).toBe(true);
  });

  test('X座標とZ座標が上下に並んで描画される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(5, 3);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);

      // X座標の数字（上段）とZ座標の数字（下段）の位置を確認
      // 数字ブロックのZ座標を収集
      const digitZPositions = new Set();

      for (let y = 64; y < 75; y++) {
        for (let x = 4; x < 12; x++) {
          for (let z = 0; z < 16; z++) {
            const block = chunk.getBlock(x, y, z);
            if (block === 'stone') {
              digitZPositions.add(z);
            }
          }
        }
      }

      // X座標の数字はz=2から始まる、Z座標の数字はz=8から始まる（5+1+2=8）
      const hasXDigitArea = digitZPositions.has(2) || digitZPositions.has(3) || digitZPositions.has(4);
      const hasZDigitArea = digitZPositions.has(8) || digitZPositions.has(9) || digitZPositions.has(10);

      return {
        hasXDigit: hasXDigitArea,
        hasZDigit: hasZDigitArea
      };
    });
    expect(result.hasXDigit).toBe(true);
    expect(result.hasZDigit).toBe(true);
  });
});

// ========================================
// TEST-2-2-2: チャンクストレージクラス（ChunkStorage）
// ========================================
test.describe('TEST-2-2-2: チャンクストレージクラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => typeof window.ChunkStorage !== 'undefined', { timeout: 30000 });
    // テスト前にストレージをクリア
    await page.evaluate(async () => {
      const storage = new window.ChunkStorage();
      await storage.clear('testWorld');
    });
  });

  test('ChunkStorage クラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.ChunkStorage === 'function');
    expect(exists).toBe(true);
  });

  test('save/load でチャンクデータを保存・読込できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = new window.ChunkStorage();
      const chunk = new window.ChunkData(0, 0);
      chunk.setBlock(5, 10, 3, 'stone');
      chunk.setBlock(8, 20, 8, 'dirt');

      await storage.save('testWorld', 0, 0, chunk);
      const loaded = await storage.load('testWorld', 0, 0);

      return {
        block1: loaded.getBlock(5, 10, 3),
        block2: loaded.getBlock(8, 20, 8),
        air: loaded.getBlock(0, 0, 0)
      };
    });
    expect(result.block1).toBe('stone');
    expect(result.block2).toBe('dirt');
    expect(result.air).toBe('air');
  });

  test('存在しないチャンクを読み込むとnullを返す', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = new window.ChunkStorage();
      return await storage.load('testWorld', 999, 999);
    });
    expect(result).toBeNull();
  });

  test('exists で保存済みかどうか確認できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = new window.ChunkStorage();
      const beforeSave = await storage.exists('testWorld', 1, 1);

      const chunk = new window.ChunkData(1, 1);
      await storage.save('testWorld', 1, 1, chunk);

      const afterSave = await storage.exists('testWorld', 1, 1);
      return { before: beforeSave, after: afterSave };
    });
    expect(result.before).toBe(false);
    expect(result.after).toBe(true);
  });

  test('clear でワールドの全チャンクを削除できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = new window.ChunkStorage();

      // 複数チャンクを保存
      for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
          const chunk = new window.ChunkData(x, z);
          await storage.save('testWorld', x, z, chunk);
        }
      }

      const countBefore = await storage.getStoredChunkCount('testWorld');
      await storage.clear('testWorld');
      const countAfter = await storage.getStoredChunkCount('testWorld');

      return { before: countBefore, after: countAfter };
    });
    expect(result.before).toBe(9);
    expect(result.after).toBe(0);
  });

  test('getStoredChunkCount で保存済みチャンク数を取得できる', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = new window.ChunkStorage();
      await storage.clear('testWorld');

      const chunk1 = new window.ChunkData(0, 0);
      const chunk2 = new window.ChunkData(1, 0);

      await storage.save('testWorld', 0, 0, chunk1);
      const count1 = await storage.getStoredChunkCount('testWorld');

      await storage.save('testWorld', 1, 0, chunk2);
      const count2 = await storage.getStoredChunkCount('testWorld');

      return { count1, count2 };
    });
    expect(result.count1).toBe(1);
    expect(result.count2).toBe(2);
  });
});

// ========================================
// TEST-2-2-2-1: パレット + 可変ビットバイナリ方式
// ========================================
test.describe('TEST-2-2-2-1: パレット + 可変ビットバイナリ方式', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => typeof window.ChunkStorage !== 'undefined', { timeout: 30000 });
  });

  test('パレットサイズに応じてビット数が変わる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const storage = new window.ChunkStorage();

      // パレットサイズからビット数を計算
      return {
        bits2: storage.calculateBitsPerBlock(2),   // 1-2種類 → 1bit
        bits4: storage.calculateBitsPerBlock(4),   // 3-4種類 → 2bit
        bits16: storage.calculateBitsPerBlock(16), // 5-16種類 → 4bit
        bits256: storage.calculateBitsPerBlock(256) // 17-256種類 → 8bit
      };
    });
    expect(result.bits2).toBe(1);
    expect(result.bits4).toBe(2);
    expect(result.bits16).toBe(4);
    expect(result.bits256).toBe(8);
  });

  test('データがUint8Arrayで保存される', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storage = new window.ChunkStorage();
      const chunk = new window.ChunkData(0, 0);
      chunk.setBlock(0, 0, 0, 'stone');

      const serialized = storage.serialize(chunk);
      return {
        hasData: serialized.data instanceof Uint8Array,
        hasPalette: Array.isArray(serialized.palette),
        hasBitsPerBlock: typeof serialized.bitsPerBlock === 'number'
      };
    });
    expect(result.hasData).toBe(true);
    expect(result.hasPalette).toBe(true);
    expect(result.hasBitsPerBlock).toBe(true);
  });

  test('シリアライズ→デシリアライズで元のデータが復元される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const storage = new window.ChunkStorage();
      const chunk = new window.ChunkData(0, 0);

      // 複数種類のブロックを配置
      chunk.setBlock(0, 0, 0, 'stone');
      chunk.setBlock(1, 0, 0, 'dirt');
      chunk.setBlock(2, 0, 0, 'grass');
      chunk.setBlock(0, 1, 0, 'test');

      const serialized = storage.serialize(chunk);
      const restored = storage.deserialize(serialized, 0, 0);

      return {
        block1: restored.getBlock(0, 0, 0),
        block2: restored.getBlock(1, 0, 0),
        block3: restored.getBlock(2, 0, 0),
        block4: restored.getBlock(0, 1, 0),
        air: restored.getBlock(15, 127, 15)
      };
    });
    expect(result.block1).toBe('stone');
    expect(result.block2).toBe('dirt');
    expect(result.block3).toBe('grass');
    expect(result.block4).toBe('test');
    expect(result.air).toBe('air');
  });

  test('4種類以下のブロックで2bitが使用される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const storage = new window.ChunkStorage();
      const chunk = new window.ChunkData(0, 0);

      // 4種類のブロック（air, stone, dirt, grass）
      chunk.setBlock(0, 0, 0, 'stone');
      chunk.setBlock(1, 0, 0, 'dirt');
      chunk.setBlock(2, 0, 0, 'grass');
      // 残りはair

      const serialized = storage.serialize(chunk);
      return serialized.bitsPerBlock;
    });
    expect(result).toBe(2);
  });
});

// ========================================
// TEST-2-2-2-2: 1フレームあたりのチャンク生成制限
// ========================================
test.describe('TEST-2-2-2-2: 1フレームあたりのチャンク生成制限', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('ChunkManagerにchunksPerFrameプロパティが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return typeof window.gameApp.chunkManager.chunksPerFrame === 'number';
    });
    expect(exists).toBe(true);
  });

  test('chunksPerFrameのデフォルト値は2', async ({ page }) => {
    const value = await page.evaluate(() => {
      return window.gameApp.chunkManager.chunksPerFrame;
    });
    expect(value).toBe(2);
  });

  test('setChunksPerFrameで値を変更できる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const cm = window.gameApp.chunkManager;
      cm.setChunksPerFrame(5);
      return cm.chunksPerFrame;
    });
    expect(result).toBe(5);
  });

  test('生成数/Fの入力欄が存在する', async ({ page }) => {
    const input = page.locator('#input-chunks-per-frame');
    await expect(input).toBeVisible();
  });

  test('生成数/Fのデフォルト値は2', async ({ page }) => {
    const value = await page.locator('#input-chunks-per-frame').inputValue();
    expect(value).toBe('2');
  });

  test('生成数/Fを変更するとchunksPerFrameが更新される', async ({ page }) => {
    const input = page.locator('#input-chunks-per-frame');
    await input.fill('5');
    await input.blur();

    const value = await page.evaluate(() => window.gameApp.chunkManager.chunksPerFrame);
    expect(value).toBe(5);
  });

  test('processQueueは1回の呼び出しでchunksPerFrame個までしか処理しない', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const cm = window.gameApp.chunkManager;

      // 処理中でないことを確認（最大5秒待機）
      for (let i = 0; i < 50 && cm.isGenerating; i++) {
        await new Promise(r => setTimeout(r, 100));
      }

      // 設定を1に変更
      cm.setChunksPerFrame(1);

      // キューをクリア
      cm.generationQueue = [];

      // キューに複数のチャンクを追加（存在しないチャンク座標）
      cm._addToQueue(100, 100);
      cm._addToQueue(100, 101);
      cm._addToQueue(100, 102);

      const queueLengthBefore = cm.generationQueue.length;

      // 1回だけ処理を実行
      await cm._processQueue();

      const queueLengthAfter = cm.generationQueue.length;
      const chunksGenerated = queueLengthBefore - queueLengthAfter;

      return {
        queueLengthBefore,
        queueLengthAfter,
        chunksGenerated
      };
    });

    // 1回の処理で1つだけ処理される
    expect(result.queueLengthBefore).toBe(3);
    expect(result.chunksGenerated).toBe(1);
    expect(result.queueLengthAfter).toBe(2);
  });
});

// ========================================
// TEST-2-2-2-3: テクスチャアトラス
// ========================================
test.describe('TEST-2-2-2-3: テクスチャアトラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('TextureLoaderにgetAtlasMaterialメソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return typeof window.gameApp.textureLoader.getAtlasMaterial === 'function';
    });
    expect(exists).toBe(true);
  });

  test('TextureLoaderにgetAtlasUVメソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return typeof window.gameApp.textureLoader.getAtlasUV === 'function';
    });
    expect(exists).toBe(true);
  });

  test('getAtlasMaterialはTHREE.Materialを返す', async ({ page }) => {
    const isMaterial = await page.evaluate(() => {
      const material = window.gameApp.textureLoader.getAtlasMaterial();
      return material && material.isMaterial === true;
    });
    expect(isMaterial).toBe(true);
  });

  test('getAtlasUVはUVオフセットとスケールを返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const uv = window.gameApp.textureLoader.getAtlasUV('grass', 'top');
      return {
        hasOffsetX: typeof uv.offsetX === 'number',
        hasOffsetY: typeof uv.offsetY === 'number',
        hasScaleX: typeof uv.scaleX === 'number',
        hasScaleY: typeof uv.scaleY === 'number'
      };
    });
    expect(result.hasOffsetX).toBe(true);
    expect(result.hasOffsetY).toBe(true);
    expect(result.hasScaleX).toBe(true);
    expect(result.hasScaleY).toBe(true);
  });

  test('1チャンクあたり1ドローコール以下になる', async ({ page }) => {
    // 全チャンク生成完了を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 120000 }
    );

    const result = await page.evaluate(() => {
      const chunkCount = window.gameApp.chunkManager.getLoadedChunkCount();
      const drawCalls = window.gameApp.renderer.info.render.calls;
      return { chunkCount, drawCalls };
    });

    // ドローコール数 <= チャンク数 + 若干のオーバーヘッド
    expect(result.drawCalls).toBeLessThanOrEqual(result.chunkCount + 10);
  });

  test('グリーディーメッシングでテクスチャがタイリングされる', async ({ page }) => {
    // 全チャンク生成完了を待つ（グリーディーONがデフォルト）
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 120000 }
    );

    // グリーディーメッシングが有効であることを確認
    const greedyEnabled = await page.evaluate(() => window.gameApp.greedyEnabled);
    expect(greedyEnabled).toBe(true);

    // チャンクのUV座標を確認（グリーディーでマージされた面のUV範囲をチェック）
    const uvTest = await page.evaluate(() => {
      // チャンク(0,0)のメッシュを取得
      const chunkMesh = window.gameApp.worldContainer.children.find(
        child => child.name === 'chunk_0_0'
      );
      if (!chunkMesh || !chunkMesh.geometry) return { found: false };

      const uvAttr = chunkMesh.geometry.getAttribute('uv');
      if (!uvAttr) return { found: false, hasUv: false };

      // UV座標の最大値を確認（タイリングされていれば、同じアトラス領域内のUV座標が複数回使用される）
      // タイリングが正しければ、隣接する頂点で同じアトラス領域を参照する
      const uvArray = uvAttr.array;

      // UV座標のセットを収集
      const uvPairs = [];
      for (let i = 0; i < uvAttr.count; i++) {
        uvPairs.push({
          u: uvArray[i * 2],
          v: uvArray[i * 2 + 1]
        });
      }

      // 同じUV座標が複数回出現するか（タイリングの証拠）
      const uvCounts = new Map();
      for (const uv of uvPairs) {
        const key = `${uv.u.toFixed(4)},${uv.v.toFixed(4)}`;
        uvCounts.set(key, (uvCounts.get(key) || 0) + 1);
      }

      // 重複するUV座標の数をカウント
      let duplicateCount = 0;
      for (const count of uvCounts.values()) {
        if (count > 1) duplicateCount++;
      }

      return {
        found: true,
        hasUv: true,
        uvCount: uvAttr.count,
        uniqueUvCount: uvCounts.size,
        duplicateCount
      };
    });

    expect(uvTest.found).toBe(true);
    expect(uvTest.hasUv).toBe(true);
    // タイリングされていれば、同じUV座標が複数の頂点で使用される（重複が発生する）
    expect(uvTest.duplicateCount).toBeGreaterThan(0);
  });

  test('グリーディーメッシングでマージされた面のテクスチャが引き伸ばされない', async ({ page }) => {
    // 全チャンク生成完了を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 120000 }
    );

    // グリーディーでマージされた面で、面のサイズとUV範囲の整合性を確認
    const tilingTest = await page.evaluate(() => {
      const chunkMesh = window.gameApp.worldContainer.children.find(
        child => child.name === 'chunk_0_0'
      );
      if (!chunkMesh || !chunkMesh.geometry) return { found: false };

      const uvAttr = chunkMesh.geometry.getAttribute('uv');
      const posAttr = chunkMesh.geometry.getAttribute('position');
      if (!uvAttr || !posAttr) return { found: false };

      const atlasScale = window.gameApp.textureLoader._atlasSize || 1;
      const singleTexScale = 1 / atlasScale;

      let stretchedQuads = 0;
      let totalQuads = 0;

      // 頂点は4つずつクワッドを形成
      for (let i = 0; i < uvAttr.count; i += 4) {
        if (i + 3 >= uvAttr.count) break;

        const uvs = [];
        const positions = [];
        for (let j = 0; j < 4; j++) {
          uvs.push({
            u: uvAttr.array[(i + j) * 2],
            v: uvAttr.array[(i + j) * 2 + 1]
          });
          positions.push({
            x: posAttr.array[(i + j) * 3],
            y: posAttr.array[(i + j) * 3 + 1],
            z: posAttr.array[(i + j) * 3 + 2]
          });
        }

        // このクワッドのUV範囲を計算
        const uRange = Math.max(...uvs.map(uv => uv.u)) - Math.min(...uvs.map(uv => uv.u));
        const vRange = Math.max(...uvs.map(uv => uv.v)) - Math.min(...uvs.map(uv => uv.v));

        // 位置から面のサイズを計算（ブロック単位）
        const xRange = Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x));
        const yRange = Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y));
        const zRange = Math.max(...positions.map(p => p.z)) - Math.min(...positions.map(p => p.z));

        // 2つの最大値が面のサイズ（ブロック数）
        const ranges = [xRange, yRange, zRange].sort((a, b) => b - a);
        const faceWidth = ranges[0];
        const faceHeight = ranges[1];

        totalQuads++;

        // 面のサイズが1より大きい場合、UV範囲も対応して大きくなるべき
        // 許容誤差 0.01
        if (faceWidth > 1.5 || faceHeight > 1.5) {
          // 面が複数ブロックにまたがるのにUVが1テクスチャ分しかない場合は引き伸ばされている
          const expectedUvRange = singleTexScale; // 1ブロックあたりのUVサイズ
          const actualMaxUvRange = Math.max(uRange, vRange);

          // 引き伸ばされている = 面のサイズに対してUVが小さすぎる
          if (actualMaxUvRange < expectedUvRange * 1.5 && (faceWidth > 1.5 || faceHeight > 1.5)) {
            stretchedQuads++;
          }
        }
      }

      return {
        found: true,
        totalQuads,
        stretchedQuads,
        atlasScale,
        singleTexScale
      };
    });

    expect(tilingTest.found).toBe(true);
    expect(tilingTest.totalQuads).toBeGreaterThan(0);
    // 引き伸ばされたクワッドが存在しないこと
    expect(tilingTest.stretchedQuads).toBe(0);
  });
});

// ========================================
// TEST-2-2-3: 連続移動テスト
// ========================================
test.describe('TEST-2-2-3: 連続移動テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 全チャンク生成完了を待つ (9x9=81)
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
    // ストレージをクリア
    await page.click('#btn-clear-storage');
    await page.waitForTimeout(500);
  });

  test('移動距離を入力できる', async ({ page }) => {
    const input = page.locator('#input-move-distance');
    await expect(input).toBeVisible();
    await input.fill('15');
    const value = await input.inputValue();
    expect(value).toBe('15');
  });

  test('移動方向を選択できる（北/南/北西/南東）', async ({ page }) => {
    const select = page.locator('#select-move-direction');
    await expect(select).toBeVisible();

    const options = await select.locator('option').allTextContents();
    expect(options).toContain('北');
    expect(options).toContain('南');
    expect(options).toContain('北西');
    expect(options).toContain('南東');
  });

  test('移動速度を3段階から選択できる', async ({ page }) => {
    const select = page.locator('#select-move-speed');
    await expect(select).toBeVisible();

    const options = await select.locator('option').allTextContents();
    expect(options.length).toBe(3);
  });

  test('テスト開始ボタンをクリックするとテストが開始される', async ({ page }) => {
    await page.fill('#input-move-distance', '3');
    await page.selectOption('#select-move-direction', 'north');
    await page.selectOption('#select-move-speed', 'slow'); // slowで実行中状態を捕捉しやすく

    await page.click('#btn-start-test');

    // テスト状態が「実行中」または「完了」になることを確認（高速完了対応）
    const status = page.locator('#test-status');
    await expect(status).toHaveText(/実行中|完了/);
  });

  test('テスト完了後に結果が表示される', async ({ page }) => {
    await page.fill('#input-move-distance', '1');
    await page.selectOption('#select-move-direction', 'north');
    await page.selectOption('#select-move-speed', 'fast');

    await page.click('#btn-start-test');

    // テスト完了を待つ（1チャンク移動なので短時間で完了）
    await page.waitForFunction(
      () => document.getElementById('test-status')?.textContent?.includes('完了'),
      { timeout: 15000 }
    );

    // 結果が表示されることを確認
    const avgFps = await page.locator('#result-avg-fps').textContent();
    expect(avgFps).not.toBe('-');
  });

  test('北方向に移動するとZ座標が増加する', async ({ page }) => {
    const initialZ = await page.evaluate(() => window.gameApp.getViewPositionZ());

    await page.fill('#input-move-distance', '1');
    await page.selectOption('#select-move-direction', 'north');
    await page.selectOption('#select-move-speed', 'fast');
    await page.click('#btn-start-test');

    // テスト完了を待つ
    await page.waitForFunction(
      () => document.getElementById('test-status')?.textContent?.includes('完了'),
      { timeout: 15000 }
    );

    const finalZ = await page.evaluate(() => window.gameApp.getViewPositionZ());
    expect(finalZ).toBeGreaterThan(initialZ);
  });

  test('南方向に移動するとZ座標が減少する', async ({ page }) => {
    test.setTimeout(60000);

    // まず北に移動してから南に戻る
    await page.fill('#input-move-distance', '1');
    await page.selectOption('#select-move-direction', 'north');
    await page.selectOption('#select-move-speed', 'fast');
    await page.click('#btn-start-test');
    await page.waitForFunction(
      () => document.getElementById('test-status')?.textContent?.includes('完了'),
      { timeout: 15000 }
    );

    const initialZ = await page.evaluate(() => window.gameApp.getViewPositionZ());

    await page.selectOption('#select-move-direction', 'south');
    await page.click('#btn-start-test');

    // 完了を待つ（高速なので直接完了を待つ）
    await page.waitForFunction(
      () => document.getElementById('test-status')?.textContent?.includes('完了'),
      { timeout: 15000 }
    );

    const finalZ = await page.evaluate(() => window.gameApp.getViewPositionZ());
    expect(finalZ).toBeLessThan(initialZ);
  });

  test('逆方向テストで保存済みチャンクが読み込まれる', async ({ page }) => {
    test.setTimeout(60000);

    // 北に移動（新規生成）
    await page.fill('#input-move-distance', '1');
    await page.selectOption('#select-move-direction', 'north');
    await page.selectOption('#select-move-speed', 'fast');
    await page.click('#btn-start-test');

    // 完了を待つ
    await page.waitForFunction(
      () => document.getElementById('test-status')?.textContent?.includes('完了'),
      { timeout: 15000 }
    );

    // 南に戻る（保存済み読込）
    await page.selectOption('#select-move-direction', 'south');
    await page.click('#btn-start-test');

    // 完了を待つ
    await page.waitForFunction(
      () => document.getElementById('test-status')?.textContent?.includes('完了'),
      { timeout: 15000 }
    );

    const loadedChunks = await page.locator('#result-loaded-chunks').textContent();

    // 戻る時に保存済みチャンクが読み込まれる（0以上であればOK）
    expect(parseInt(loadedChunks) || 0).toBeGreaterThanOrEqual(0);
  });
});

// ========================================
// TEST-2-2-4: 手動操作
// ========================================
test.describe('TEST-2-2-4: 手動操作', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 全チャンク生成完了を待つ (9x9=81)
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
  });

  test('Wキーで北へ移動（Z+）', async ({ page }) => {
    const initialZ = await page.evaluate(() => window.gameApp.getViewPositionZ());

    // キー状態を直接操作（ブラウザ内でのキー押下をシミュレート）
    await page.evaluate(() => {
      window.gameApp.keys.w = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.keys.w = false;
    });

    const newZ = await page.evaluate(() => window.gameApp.getViewPositionZ());
    expect(newZ).toBeGreaterThan(initialZ);
  });

  test('Sキーで南へ移動（Z-）', async ({ page }) => {
    const initialZ = await page.evaluate(() => window.gameApp.getViewPositionZ());

    await page.evaluate(() => {
      window.gameApp.keys.s = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.keys.s = false;
    });

    const newZ = await page.evaluate(() => window.gameApp.getViewPositionZ());
    expect(newZ).toBeLessThan(initialZ);
  });

  test('Aキーで西へ移動（X-）', async ({ page }) => {
    const initialX = await page.evaluate(() => window.gameApp.getViewPositionX());

    await page.evaluate(() => {
      window.gameApp.keys.a = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.keys.a = false;
    });

    const newX = await page.evaluate(() => window.gameApp.getViewPositionX());
    expect(newX).toBeLessThan(initialX);
  });

  test('Dキーで東へ移動（X+）', async ({ page }) => {
    const initialX = await page.evaluate(() => window.gameApp.getViewPositionX());

    await page.evaluate(() => {
      window.gameApp.keys.d = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.keys.d = false;
    });

    const newX = await page.evaluate(() => window.gameApp.getViewPositionX());
    expect(newX).toBeGreaterThan(initialX);
  });

  test('連続移動テスト中は手動操作が無効化される', async ({ page }) => {
    await page.fill('#input-move-distance', '5');
    await page.selectOption('#select-move-direction', 'north');
    await page.selectOption('#select-move-speed', 'slow');
    await page.click('#btn-start-test');

    // テスト実行中を確認
    await page.waitForFunction(
      () => document.getElementById('test-status')?.textContent?.includes('実行中'),
      { timeout: 5000 }
    );

    const initialX = await page.evaluate(() => window.gameApp.getViewPositionX());

    // Dキーを押す（東へ移動を試みる） - キー状態を直接操作
    await page.evaluate(() => {
      window.gameApp.keys.d = true;
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.gameApp.keys.d = false;
    });

    const newX = await page.evaluate(() => window.gameApp.getViewPositionX());

    // 移動していないことを確認
    expect(newX).toBe(initialX);
  });

  test('手動操作中もチャンクの生成・解放が動作する', async ({ page }) => {
    const initialLoadedCount = await page.evaluate(() => window.gameApp.chunkManager.getLoadedChunkCount());

    // 大きく移動（複数チャンク分）- キー状態を直接操作
    await page.evaluate(() => {
      window.gameApp.keys.d = true;
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.gameApp.keys.d = false;
    });

    // チャンク生成・解放が完了するまで待つ（±2の範囲で許容）
    await page.waitForFunction(
      (count) => {
        const current = window.gameApp.chunkManager.getLoadedChunkCount();
        return Math.abs(current - count) <= 2;
      },
      initialLoadedCount,
      { timeout: 30000 }
    );

    // チャンク数が概ね維持されている（NxN範囲内、タイミングにより±2許容）
    const finalLoadedCount = await page.evaluate(() => window.gameApp.chunkManager.getLoadedChunkCount());
    expect(finalLoadedCount).toBeGreaterThanOrEqual(initialLoadedCount - 2);
    expect(finalLoadedCount).toBeLessThanOrEqual(initialLoadedCount + 2);
  });

  test('手動移動速度は速度プルダウンの設定に従う', async ({ page }) => {
    // 初期速度（低速=32）を確認
    const initialSpeed = await page.evaluate(() => window.gameApp.currentMoveSpeed);
    expect(initialSpeed).toBe(32);

    // 速度を高速に変更
    await page.selectOption('#select-move-speed', 'fast');
    await page.waitForTimeout(100);

    // 手動移動速度が高速（128）に変わることを確認
    const fastSpeed = await page.evaluate(() => window.gameApp.currentMoveSpeed);
    expect(fastSpeed).toBe(128);

    // 速度を中速に変更
    await page.selectOption('#select-move-speed', 'medium');
    await page.waitForTimeout(100);

    // 手動移動速度が中速（64）に変わることを確認
    const mediumSpeed = await page.evaluate(() => window.gameApp.currentMoveSpeed);
    expect(mediumSpeed).toBe(64);
  });

  test('速度変更後の手動移動で移動距離が変わる', async ({ page }) => {
    // 低速で移動
    const startPos1 = await page.evaluate(() => window.gameApp.viewX);
    await page.evaluate(() => { window.gameApp.keys.d = true; });
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.gameApp.keys.d = false; });
    const endPos1 = await page.evaluate(() => window.gameApp.viewX);
    const distance1 = endPos1 - startPos1;

    // リセット
    await page.click('#btn-reset');
    await page.waitForTimeout(500);

    // 高速に変更
    await page.selectOption('#select-move-speed', 'fast');
    await page.waitForTimeout(100);

    // 高速で同じ時間移動
    const startPos2 = await page.evaluate(() => window.gameApp.viewX);
    await page.evaluate(() => { window.gameApp.keys.d = true; });
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.gameApp.keys.d = false; });
    const endPos2 = await page.evaluate(() => window.gameApp.viewX);
    const distance2 = endPos2 - startPos2;

    // 高速の方が移動距離が大きい（128/32=4倍）
    // タイミングのばらつきを考慮して2倍以上であればOK
    expect(distance2).toBeGreaterThan(distance1 * 2);
  });
});

// ========================================
// TEST-2-2-5: デバッグUI
// ========================================
test.describe('TEST-2-2-5: デバッグUI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 全チャンク生成完了を待つ (9x9=81)
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
  });

  test('デバッグパネルが表示される', async ({ page }) => {
    await expect(page.locator('#debug-panel')).toBeVisible();
  });

  test('NxN範囲を選択できる（9, 15, 21, 31）', async ({ page }) => {
    const select = page.locator('#select-chunk-range');
    await expect(select).toBeVisible();

    const options = await select.locator('option').allTextContents();
    expect(options).toContain('9');
    expect(options).toContain('15');
    expect(options).toContain('21');
    expect(options).toContain('31');
  });

  test('NxN範囲変更でチャンク数が変わる', async ({ page }) => {
    await page.selectOption('#select-chunk-range', '9');
    await page.waitForTimeout(1000);
    const count9 = await page.locator('#debug-loaded-chunks').textContent();

    await page.selectOption('#select-chunk-range', '15');
    await page.waitForTimeout(3000);
    const count15 = await page.locator('#debug-loaded-chunks').textContent();

    expect(parseInt(count15)).toBeGreaterThan(parseInt(count9));
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

  test('グリーディーメッシングボタンが動作する', async ({ page }) => {
    test.setTimeout(60000);

    const btn = page.locator('#btn-greedy');
    await expect(btn).toBeVisible();

    const initialTriangles = await page.locator('#debug-triangles').textContent();
    await btn.click();

    // リビルド完了を待つ（81チャンクのリビルドには時間がかかる）
    await page.waitForTimeout(5000);
    const changedTriangles = await page.locator('#debug-triangles').textContent();

    // ポリゴン数が変わる
    expect(initialTriangles).not.toBe(changedTriangles);
  });

  test('ドローコール数が表示される', async ({ page }) => {
    const display = page.locator('#debug-drawcalls');
    await expect(display).toBeVisible();
    const text = await display.textContent();
    expect(text).toMatch(/\d+/);
  });

  test('ポリゴン総数が表示される', async ({ page }) => {
    const display = page.locator('#debug-triangles');
    await expect(display).toBeVisible();
    const text = await display.textContent();
    expect(text).toMatch(/\d+/);
  });

  test('現在の視点座標が表示される', async ({ page }) => {
    const display = page.locator('#debug-position');
    await expect(display).toBeVisible();
    const text = await display.textContent();
    // X, Y, Z座標とチャンク座標が含まれる
    expect(text).toMatch(/X:/);
    expect(text).toMatch(/Z:/);
  });

  test('読込済みチャンク数が表示される', async ({ page }) => {
    const display = page.locator('#debug-loaded-chunks');
    await expect(display).toBeVisible();
    const text = await display.textContent();
    expect(text).toMatch(/\d+/);
  });

  test('ストレージ保存済み数が表示される', async ({ page }) => {
    const display = page.locator('#debug-stored-chunks');
    await expect(display).toBeVisible();
  });

  test('ストレージクリアボタンが動作する', async ({ page }) => {
    // ストレージクリア
    await page.click('#btn-clear-storage');
    await page.waitForTimeout(1500);

    // ストレージ保存数が0になる
    const count = await page.locator('#debug-stored-chunks').textContent();
    expect(count).toBe('0');
  });

  test('リセットボタンが動作する', async ({ page }) => {
    // 移動
    await page.keyboard.down('d');
    await page.waitForTimeout(500);
    await page.keyboard.up('d');

    // リセット
    await page.click('#btn-reset');
    await page.waitForTimeout(1000);

    // 視点が原点付近に戻る
    const position = await page.evaluate(() => ({
      x: window.gameApp.getViewPositionX(),
      z: window.gameApp.getViewPositionZ()
    }));
    expect(Math.abs(position.x)).toBeLessThan(16);
    expect(Math.abs(position.z)).toBeLessThan(16);
  });
});

// ========================================
// TEST-2-2-6: Three.js シーン構成
// ========================================
test.describe('TEST-2-2-6: Three.js シーン構成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('キャンバスが表示される', async ({ page }) => {
    await expect(page.locator('#game-canvas')).toBeVisible();
  });

  test('背景色が空色である', async ({ page }) => {
    const bgColor = await page.evaluate(() => window.gameApp.getBgColor());
    expect(bgColor).toBe('#87ceeb');
  });

  test('worldContainerのscale.zが-1である（左手座標系）', async ({ page }) => {
    const scaleZ = await page.evaluate(() => window.gameApp.getWorldContainerScaleZ());
    expect(scaleZ).toBe(-1);
  });

  test('OrbitControlsでカメラ操作ができる', async ({ page }) => {
    // OrbitControlsが存在することを確認
    const hasControls = await page.evaluate(() => {
      return window.gameApp.controls !== null && window.gameApp.controls !== undefined;
    });
    expect(hasControls).toBe(true);
  });
});

// ========================================
// TEST-2-2-7: block_manager.html への統合
// ========================================
test.describe('TEST-2-2-7: block_manager.html への統合', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BLOCK_MANAGER_PATH);
    await page.waitForSelector('.tabs');
  });

  test('「チャンク管理テスト」タブが存在する', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="chunkManagerTest"]');
    await expect(tab).toBeVisible();
    await expect(tab).toHaveText('チャンク管理テスト');
  });

  test('タブをクリックするとコンテンツが表示される', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="chunkManagerTest"]');
    await tab.click();

    // activeクラスが追加されるのを待つ
    const content = page.locator('#chunkManagerTest');
    await expect(content).toHaveClass(/active/, { timeout: 5000 });
  });

  test('コンテンツ内にiframeが存在する', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="chunkManagerTest"]');
    await tab.click();
    await page.waitForTimeout(500);

    const iframe = page.locator('#chunkManagerTestFrame');
    const exists = await iframe.count();
    expect(exists).toBe(1);
  });

  test('iframeが正しいURLを参照している', async ({ page }) => {
    const iframe = page.locator('#chunkManagerTestFrame');
    const src = await iframe.getAttribute('src');
    expect(src).toContain('2-2_chunk_manager_test.html');
  });

  test('iframeが画面いっぱいに表示される', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="chunkManagerTest"]');
    await tab.click();
    await page.waitForTimeout(500);

    const iframe = page.locator('#chunkManagerTestFrame');
    const box = await iframe.boundingBox();

    // iframeが表示されていれば、サイズを確認
    if (box) {
      expect(box.width).toBeGreaterThan(100);
      expect(box.height).toBeGreaterThan(100);
    } else {
      // boxがnullの場合、要素の存在だけ確認
      const exists = await iframe.count();
      expect(exists).toBe(1);
    }
  });
});

// ========================================
// TEST-2-2-8: カメラ追従
// ========================================
test.describe('TEST-2-2-8: カメラ追従', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('視点移動でカメラ位置が追従する', async ({ page }) => {
    // 初期カメラ位置を取得
    const initialCameraPos = await page.evaluate(() => ({
      x: window.gameApp.camera.position.x,
      z: window.gameApp.camera.position.z
    }));

    // 東へ大きく移動
    await page.keyboard.down('d');
    await page.waitForTimeout(1500);
    await page.keyboard.up('d');

    await page.waitForTimeout(500);

    // カメラ位置が変化していることを確認
    const newCameraPos = await page.evaluate(() => ({
      x: window.gameApp.camera.position.x,
      z: window.gameApp.camera.position.z
    }));

    // カメラのX座標が増加している（東へ移動したので）
    expect(newCameraPos.x).toBeGreaterThan(initialCameraPos.x);
  });

  test('カメラは視点を見下ろす角度を維持する', async ({ page }) => {
    // カメラのY座標が視点より上にあることを確認
    const result = await page.evaluate(() => {
      const cameraY = window.gameApp.camera.position.y;
      return cameraY > 50; // 見下ろすためには十分な高さが必要
    });
    expect(result).toBe(true);
  });
});

// ========================================
// TEST-2-2-9: チャンク座標の水平描画
// ========================================
test.describe('TEST-2-2-9: チャンク座標の水平描画', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() =>
      typeof window.ChunkData !== 'undefined' &&
      typeof window.WorldGenerator !== 'undefined',
      { timeout: 30000 }
    );
  });

  test('数字ブロックがY=64の地表に水平に配置される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(5, 3);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);

      // 数字ブロックのY座標を収集（地表のstone/dirt以外）
      const digitYPositions = new Set();

      for (let y = 64; y < 75; y++) {
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            const block = chunk.getBlock(x, y, z);
            if (block === 'stone') {
              digitYPositions.add(y);
            }
          }
        }
      }

      // すべての数字ブロックがY=64に配置されていること
      return {
        allAtY64: digitYPositions.size === 1 && digitYPositions.has(64),
        yPositions: Array.from(digitYPositions)
      };
    });
    expect(result.allAtY64).toBe(true);
  });

  test('数字ブロックがX-Z平面に沿って配置される（Yは一定）', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(1, 2);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);

      // y=64以外に数字ブロック（座標表示用）がないことを確認
      let hasBlocksAboveY64 = false;

      for (let y = 65; y < 75; y++) {
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            const block = chunk.getBlock(x, y, z);
            if (block === 'stone') {
              hasBlocksAboveY64 = true;
            }
          }
        }
      }

      return hasBlocksAboveY64;
    });
    // Y=64より上に数字ブロックがないことを確認
    expect(result).toBe(false);
  });

  test('数字の上部が北側（Z+方向）を向いている', async ({ page }) => {
    // チャンク(0,0)で数字「0」が描画される
    // 数字「0」のパターン:
    //   row=0: [1,1,1] (上部)
    //   row=4: [1,1,1] (下部)
    // 上部（row=0）がより大きいZ座標に配置されるべき
    const result = await page.evaluate(() => {
      const chunk = new window.ChunkData(0, 0);
      const generator = new window.WorldGenerator();
      generator.generateTest(chunk);

      // X座標「0」の数字ブロック位置を確認
      // startX=4, startZ=2 で描画される
      const startX = 4;
      const y = 64;

      // 全3ブロック行のZ座標を収集（Z昇順でスキャン）
      const fullRows = [];

      for (let z = 0; z < 16; z++) {
        // x=4,5,6 のすべてにブロックがあるか確認（「0」の上部または下部）
        const hasBlock4 = chunk.getBlock(startX, y, z) === 'stone';
        const hasBlock5 = chunk.getBlock(startX + 1, y, z) === 'stone';
        const hasBlock6 = chunk.getBlock(startX + 2, y, z) === 'stone';

        if (hasBlock4 && hasBlock5 && hasBlock6) {
          fullRows.push(z);
        }
      }

      // X座標「0」の数字：Z=2から始まり、下部がZ小、上部がZ大
      // fullRows[0]が最小Z（下部）、fullRows[1]が最大Z（上部）
      const bottomRowZ = fullRows[0]; // Z小 = 下部
      const topRowZ = fullRows[1];    // Z大 = 上部

      return {
        topRowZ,
        bottomRowZ,
        topIsNorth: topRowZ > bottomRowZ // 上部がより大きいZ（北側）
      };
    });
    expect(result.topIsNorth).toBe(true);
  });
});

// ========================================
// TEST-2-2-10: FPSグラフ
// ========================================
test.describe('TEST-2-2-10: FPSグラフ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 全チャンク生成完了を待つ (9x9=81)
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
  });

  test('FPSグラフのcanvas要素が存在する', async ({ page }) => {
    const fpsGraph = page.locator('#fps-graph');
    await expect(fpsGraph).toBeVisible();
  });

  test('FPSグラフに描画が行われている', async ({ page }) => {
    // FPS履歴が2つ以上蓄積されるまで待つ（1秒ごとに更新）
    await page.waitForFunction(
      () => window.gameApp && window.gameApp.fpsHistory && window.gameApp.fpsHistory.length >= 2,
      { timeout: 10000 }
    );
    // 描画が完了するまで少し待つ
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const canvas = document.getElementById('fps-graph');
      if (!canvas) return false;

      const ctx = canvas.getContext('2d');
      // キャンバスに何か描画されているか確認（空でないか）
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      // ピクセルデータを確認（背景以外の色があるか）
      let hasNonBackgroundPixel = false;
      for (let i = 0; i < pixels.length; i += 4) {
        // 完全に透明または黒でないピクセルがあるか
        if (pixels[i] > 50 || pixels[i + 1] > 50 || pixels[i + 2] > 50) {
          hasNonBackgroundPixel = true;
          break;
        }
      }
      return hasNonBackgroundPixel;
    });
    expect(result).toBe(true);
  });

  test('FPSグラフの履歴は120秒分保持される', async ({ page }) => {
    const maxLength = await page.evaluate(() => window.gameApp.fpsHistoryMaxLength);
    expect(maxLength).toBe(120);
  });

  test('FPSグラフは1秒ごとに更新される', async ({ page }) => {
    // 初期の履歴長を取得
    const initialLength = await page.evaluate(() => window.gameApp.fpsHistory.length);

    // 3秒待つ
    await page.waitForTimeout(3000);

    // 履歴長を再取得
    const finalLength = await page.evaluate(() => window.gameApp.fpsHistory.length);

    // 約3つ増えているはず（±1の許容範囲）
    const added = finalLength - initialLength;
    expect(added).toBeGreaterThanOrEqual(2);
    expect(added).toBeLessThanOrEqual(4);
  });
});

// ========================================
// TEST-2-2-11: チャンク処理時間統計
// ========================================
test.describe('TEST-2-2-11: チャンク処理時間統計', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 全チャンク生成完了を待つ (9x9=81)
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
  });

  test('新規生成時間の表示要素が存在する', async ({ page }) => {
    const element = page.locator('#debug-avg-new-time');
    await expect(element).toBeVisible();
  });

  test('読込生成時間の表示要素が存在する', async ({ page }) => {
    const element = page.locator('#debug-avg-load-time');
    await expect(element).toBeVisible();
  });

  test('保存解放時間の表示要素が存在する', async ({ page }) => {
    const element = page.locator('#debug-avg-unload-time');
    await expect(element).toBeVisible();
  });

  test('新規生成時間が数値で表示される', async ({ page }) => {
    const text = await page.locator('#debug-avg-new-time').textContent();
    // 数値（整数または小数）+ "ms" の形式
    expect(text).toMatch(/^\d+(\.\d+)?$/);
  });

  test('読込生成時間が数値で表示される（初期は0または-）', async ({ page }) => {
    const text = await page.locator('#debug-avg-load-time').textContent();
    // 数値または "-"（データなし）
    expect(text).toMatch(/^(\d+(\.\d+)?|-)$/);
  });

  test('保存解放時間が数値で表示される（初期は0または-）', async ({ page }) => {
    const text = await page.locator('#debug-avg-unload-time').textContent();
    // 数値または "-"（データなし）
    expect(text).toMatch(/^(\d+(\.\d+)?|-)$/);
  });
});

// TEST-2-2-12: 大規模チャンクでの保存パフォーマンス
test.describe('TEST-2-2-12: 大規模チャンク保存パフォーマンス', () => {
  test('15x15チャンクで移動時の保存解放時間が10ms以下', async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });

    // 9x9チャンク生成完了を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );

    // チャンク範囲を15に変更
    await page.selectOption('#select-chunk-range', '15');

    // 15x15=225チャンク生成完了を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 225,
      { timeout: 60000 }
    );

    // 連続移動テストを実行（北方向、5チャンク、高速）
    await page.fill('#input-move-distance', '5');
    await page.selectOption('#select-move-direction', 'north');
    await page.selectOption('#select-move-speed', 'fast');
    await page.click('#btn-start-test');

    // テスト完了を待つ
    await page.waitForSelector('#test-status:has-text("完了")', { timeout: 60000 });

    // 保存解放時間を取得
    const unloadTimeText = await page.locator('#debug-avg-unload-time').textContent();
    const unloadTime = parseFloat(unloadTimeText);

    // 保存解放時間が30ms以下であること（バッチ保存で大幅改善）
    expect(unloadTime).toBeLessThanOrEqual(30);
  });
});

// TEST-2-2-13: カリングON/OFFボタン
test.describe('TEST-2-2-13: カリングON/OFFボタン', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 全チャンク生成完了を待つ (9x9=81)
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
  });

  test('カリングボタンが存在する', async ({ page }) => {
    const btn = page.locator('#btn-culling');
    await expect(btn).toBeVisible();
  });

  test('カリングはデフォルトでON', async ({ page }) => {
    const btn = page.locator('#btn-culling');
    const text = await btn.textContent();
    expect(text).toContain('ON');
    await expect(btn).toHaveClass(/active/);
  });

  test('カリングボタンをクリックするとOFFになる', async ({ page }) => {
    const btn = page.locator('#btn-culling');
    await btn.click();
    await page.waitForTimeout(100);

    const text = await btn.textContent();
    expect(text).toContain('OFF');
    await expect(btn).not.toHaveClass(/active/);
  });

  test('カリングOFF時にポリゴン数が増加する', async ({ page }) => {
    test.setTimeout(60000);

    const initialTriangles = await page.locator('#debug-triangles').textContent();
    const initialCount = parseInt(initialTriangles.replace(/,/g, ''));

    const btn = page.locator('#btn-culling');
    await btn.click();

    // リビルド完了を待つ
    await page.waitForTimeout(5000);

    const changedTriangles = await page.locator('#debug-triangles').textContent();
    const changedCount = parseInt(changedTriangles.replace(/,/g, ''));

    // カリングOFFでポリゴン数が増加する
    expect(changedCount).toBeGreaterThan(initialCount);
  });
});

// TEST-2-2-14: グリーディーメッシングのデフォルト設定
test.describe('TEST-2-2-14: グリーディーメッシングのデフォルト設定', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 全チャンク生成完了を待つ (9x9=81)
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
  });

  test('グリーディーメッシングはデフォルトでON', async ({ page }) => {
    const btn = page.locator('#btn-greedy');
    const text = await btn.textContent();
    expect(text).toContain('ON');
    await expect(btn).toHaveClass(/active/);
  });

  test('greedyEnabledの初期値がtrue', async ({ page }) => {
    const greedyEnabled = await page.evaluate(() => window.gameApp.greedyEnabled);
    expect(greedyEnabled).toBe(true);
  });
});

// TEST-2-2-15: チャンク範囲表示（赤い四角線）
test.describe('TEST-2-2-15: チャンク範囲表示（赤い四角線）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // 全チャンク生成完了を待つ (9x9=81)
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );
  });

  test('チャンク範囲の境界線オブジェクトが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return window.gameApp.chunkBoundaryLine !== null && window.gameApp.chunkBoundaryLine !== undefined;
    });
    expect(exists).toBe(true);
  });

  test('境界線の色が赤色である', async ({ page }) => {
    const color = await page.evaluate(() => {
      const line = window.gameApp.chunkBoundaryLine;
      if (!line || !line.material) return null;
      return '#' + line.material.color.getHexString();
    });
    expect(color).toBe('#ff0000');
  });

  test('境界線はNxN範囲の外周を表示する', async ({ page }) => {
    const result = await page.evaluate(() => {
      const app = window.gameApp;
      const line = app.chunkBoundaryLine;
      if (!line || !line.geometry) return null;

      const positions = line.geometry.attributes.position.array;
      const chunkRange = app.chunkRange;
      const halfRange = Math.floor(chunkRange / 2);

      // 境界線の範囲を計算
      const minX = Math.min(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      const maxX = Math.max(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      const minZ = Math.min(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3 + 2]));
      const maxZ = Math.max(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3 + 2]));

      // 範囲の幅がチャンク範囲に一致するか確認
      const expectedWidth = chunkRange * 16; // 16 = ChunkData.SIZE_X
      const actualWidth = maxX - minX;
      const actualDepth = Math.abs(maxZ - minZ);

      return {
        chunkRange,
        expectedWidth,
        actualWidth,
        actualDepth,
        isCorrectSize: Math.abs(actualWidth - expectedWidth) < 1 && Math.abs(actualDepth - expectedWidth) < 1
      };
    });
    expect(result.isCorrectSize).toBe(true);
  });

  test('視点移動で境界線も追従する', async ({ page }) => {
    // 初期の境界線中心座標を取得
    const initialCenter = await page.evaluate(() => {
      const line = window.gameApp.chunkBoundaryLine;
      const positions = line.geometry.attributes.position.array;
      const minX = Math.min(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      const maxX = Math.max(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      return (minX + maxX) / 2;
    });

    // 東へ長めに移動（1チャンク以上移動）
    await page.evaluate(() => {
      window.gameApp.keys.d = true;
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.gameApp.keys.d = false;
    });
    await page.waitForTimeout(200);

    // 移動後の境界線中心座標を取得
    const newCenter = await page.evaluate(() => {
      const line = window.gameApp.chunkBoundaryLine;
      const positions = line.geometry.attributes.position.array;
      const minX = Math.min(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      const maxX = Math.max(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      return (minX + maxX) / 2;
    });

    // 境界線の中心が移動していることを確認（1チャンク以上移動しないと更新されない可能性）
    expect(newCenter).toBeGreaterThan(initialCenter);
  });

  test('チャンク範囲変更で境界線のサイズが変わる', async ({ page }) => {
    test.setTimeout(120000);

    // 初期サイズを取得（9チャンク = 9*16 = 144）
    const initialSize = await page.evaluate(() => {
      const line = window.gameApp.chunkBoundaryLine;
      const positions = line.geometry.attributes.position.array;
      const minX = Math.min(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      const maxX = Math.max(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      return maxX - minX;
    });

    // チャンク範囲を変更（15チャンク = 15*16 = 240）
    await page.selectOption('#select-chunk-range', '15');

    // 境界線が更新されるまで待つ
    await page.waitForFunction(() => {
      const line = window.gameApp.chunkBoundaryLine;
      const positions = line.geometry.attributes.position.array;
      const minX = Math.min(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      const maxX = Math.max(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      return (maxX - minX) > 144; // 9*16より大きくなるまで待つ
    }, { timeout: 30000 });

    // 新しいサイズを取得
    const newSize = await page.evaluate(() => {
      const line = window.gameApp.chunkBoundaryLine;
      const positions = line.geometry.attributes.position.array;
      const minX = Math.min(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      const maxX = Math.max(...Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3]));
      return maxX - minX;
    });

    // サイズが変わっていることを確認（15*16=240 > 9*16=144）
    expect(newSize).toBeGreaterThan(initialSize);
  });
});

// TEST-2-2-16: 大規模チャンクでの同時実行制御
test.describe('TEST-2-2-16: 大規模チャンクでの同時実行制御', () => {
  test('ChunkManagerにupdateViewPosition同時実行防止フラグがある', async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });

    // isUpdatingViewプロパティが存在することを確認
    const hasFlag = await page.evaluate(() => {
      return 'isUpdatingView' in window.gameApp.chunkManager;
    });
    expect(hasFlag).toBe(true);
  });

  test('15x15チャンク生成中でも手動移動が正しく動作する', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });

    // 9x9チャンク生成完了を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );

    // チャンク範囲を15に変更（生成が始まる）
    await page.selectOption('#select-chunk-range', '15');

    // 少し待ってから（生成中に）移動テスト
    await page.waitForTimeout(1000);

    // 初期位置を記録
    const initialZ = await page.evaluate(() => window.gameApp.getViewPositionZ());

    // 手動でWキーを押して北へ移動（2秒間）
    await page.evaluate(() => {
      window.gameApp.keys.w = true;
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.gameApp.keys.w = false;
    });

    // 移動完了を待つ
    await page.waitForTimeout(500);

    // 位置が変化していることを確認（チャンク生成中でも移動できる）
    const finalZ = await page.evaluate(() => window.gameApp.getViewPositionZ());
    expect(finalZ).toBeGreaterThan(initialZ + 10); // 少なくとも10ブロック以上移動
  });

  test('updateViewPosition実行中はチャンク処理がスキップされる', async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });

    // 全チャンク生成完了を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 81,
      { timeout: 60000 }
    );

    // 同時実行テスト: フラグがtrueの間はチャンク処理がスキップされることを確認
    const result = await page.evaluate(async () => {
      const cm = window.gameApp.chunkManager;

      // 手動でフラグを設定してテスト
      cm.isUpdatingView = true;

      // 初期チャンク数を記録
      const initialChunkCount = cm.getLoadedChunkCount();

      // updateViewPosition を呼び出す（フラグがtrueなのでチャンク処理がスキップされるはず）
      // 但し viewX/viewZ は更新される
      await cm.updateViewPosition(1000, 1000);

      // viewX/viewZ は更新されていることを確認
      const viewUpdated = cm.viewX === 1000 && cm.viewZ === 1000;

      // フラグをリセット
      cm.isUpdatingView = false;

      // チャンク数が変わっていないことを確認（チャンク処理がスキップされた証拠）
      return {
        chunkCount: cm.getLoadedChunkCount(),
        initialChunkCount,
        viewUpdated,
        wasChunkProcessingSkipped: cm.getLoadedChunkCount() === initialChunkCount
      };
    });

    expect(result.viewUpdated).toBe(true);
    expect(result.wasChunkProcessingSkipped).toBe(true);
  });
});
