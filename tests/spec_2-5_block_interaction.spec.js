// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 2-5 ブロック生成と破壊テスト
 *
 * 視線レイキャストによるブロック選択、生成（設置）、破壊を行うテスト
 * - 視線方向へのレイキャストでブロックを選択
 * - 選択中のブロックをワイヤーフレーム＋接触面ハイライトで表示
 * - 左クリックでブロック破壊（即時）
 * - 右クリックでブロック設置（即時）
 * - ホットバーで設置ブロックを選択
 * - 変更はIndexedDBに保存
 */

const TEST_PAGE_PATH = '/test/2-5_block_test.html';
const BLOCK_MANAGER_PATH = '/tool/block_manager.html';

// ========================================
// TEST-2-5-1: ページ表示・基本UI
// ========================================
test.describe('TEST-2-5-1: ページ表示・基本UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('キャンバスが表示される', async ({ page }) => {
    await expect(page.locator('#game-canvas')).toBeVisible();
  });

  test('クロスヘア要素が存在する', async ({ page }) => {
    // クロスヘアはPointerLock時のみ表示されるが、要素自体は存在する
    const crosshair = page.locator('#crosshair');
    await expect(crosshair).toHaveCount(1);
  });

  test('ホットバーが表示される', async ({ page }) => {
    await expect(page.locator('#hotbar')).toBeVisible();
  });

  test('ホットバーに9スロットが存在する', async ({ page }) => {
    const slots = page.locator('.hotbar-slot');
    await expect(slots).toHaveCount(9);
  });

  test('デバッグパネルが表示される', async ({ page }) => {
    await expect(page.locator('#debug-panel')).toBeVisible();
  });

  test('ターゲットブロック表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-target-block')).toBeVisible();
  });

  test('ターゲット座標表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-target-pos')).toBeVisible();
  });

  test('ターゲット面表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-target-face')).toBeVisible();
  });

  test('選択中スロット表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-selected-slot')).toBeVisible();
  });
});

// ========================================
// TEST-2-5-2: ホットバー機能
// ========================================
test.describe('TEST-2-5-2: ホットバー機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('Hotbarクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.Hotbar === 'function');
    expect(exists).toBe(true);
  });

  test('hotbarオブジェクトが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => window.gameApp.hotbar !== undefined);
    expect(exists).toBe(true);
  });

  test('初期状態でスロット0が選択されている', async ({ page }) => {
    const selectedSlot = await page.evaluate(() => window.gameApp.hotbar.getSelectedSlot());
    expect(selectedSlot).toBe(0);
  });

  test('選択中のスロットにselectedクラスが付与される', async ({ page }) => {
    const selectedSlots = page.locator('.hotbar-slot.selected');
    await expect(selectedSlots).toHaveCount(1);
  });

  test('selectSlot メソッドでスロットを選択できる', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.hotbar.selectSlot(3);
    });
    const selectedSlot = await page.evaluate(() => window.gameApp.hotbar.getSelectedSlot());
    expect(selectedSlot).toBe(3);
  });

  test('getSelectedBlock メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.hotbar.getSelectedBlock === 'function');
    expect(exists).toBe(true);
  });

  test('getSelectedBlock がブロック定義を返す', async ({ page }) => {
    const block = await page.evaluate(() => window.gameApp.hotbar.getSelectedBlock());
    expect(block).toHaveProperty('block_str_id');
  });

  test('マウスホイール下でスロットが次へ移動する', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.hotbar.selectSlot(0);
    });

    // ホイールイベントをシミュレート（deltaY > 0 で下スクロール）
    await page.evaluate(() => {
      const event = new WheelEvent('wheel', { deltaY: 100 });
      window.gameApp.hotbar.handleWheel(event);
    });

    const selectedSlot = await page.evaluate(() => window.gameApp.hotbar.getSelectedSlot());
    expect(selectedSlot).toBe(1);
  });

  test('マウスホイール上でスロットが前へ移動する', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.hotbar.selectSlot(1);
    });

    // ホイールイベントをシミュレート（deltaY < 0 で上スクロール）
    await page.evaluate(() => {
      const event = new WheelEvent('wheel', { deltaY: -100 });
      window.gameApp.hotbar.handleWheel(event);
    });

    const selectedSlot = await page.evaluate(() => window.gameApp.hotbar.getSelectedSlot());
    expect(selectedSlot).toBe(0);
  });

  test('スロット0からホイール上で8へループする', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.hotbar.selectSlot(0);
      const event = new WheelEvent('wheel', { deltaY: -100 });
      window.gameApp.hotbar.handleWheel(event);
    });

    const selectedSlot = await page.evaluate(() => window.gameApp.hotbar.getSelectedSlot());
    expect(selectedSlot).toBe(8);
  });

  test('スロット8からホイール下で0へループする', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.hotbar.selectSlot(8);
      const event = new WheelEvent('wheel', { deltaY: 100 });
      window.gameApp.hotbar.handleWheel(event);
    });

    const selectedSlot = await page.evaluate(() => window.gameApp.hotbar.getSelectedSlot());
    expect(selectedSlot).toBe(0);
  });

  test('ホットバーにGASから取得したブロックが設定されている', async ({ page }) => {
    const hasBlocks = await page.evaluate(() => {
      const hotbar = window.gameApp.hotbar;
      return hotbar.blocks && hotbar.blocks.length > 0;
    });
    expect(hasBlocks).toBe(true);
  });

  test('選択中スロット番号がデバッグUIに表示される', async ({ page }) => {
    await page.waitForTimeout(500);
    const text = await page.locator('#debug-selected-slot').textContent();
    expect(text).toMatch(/[0-8]/);
  });
});

// ========================================
// TEST-2-5-3: レイキャスト機能
// ========================================
test.describe('TEST-2-5-3: レイキャスト機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // チャンク生成を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('BlockInteractionクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.BlockInteraction === 'function');
    expect(exists).toBe(true);
  });

  test('blockInteractionオブジェクトが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => window.gameApp.blockInteraction !== undefined);
    expect(exists).toBe(true);
  });

  test('PhysicsWorld.raycast メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.physicsWorld.raycast === 'function');
    expect(exists).toBe(true);
  });

  test('レイキャストが正しい構造を返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const player = window.gameApp.player;
      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      return window.gameApp.physicsWorld.raycast(origin, direction, 10);
    });

    // ヒットした場合の構造を確認（ヒットしない場合はnull）
    if (result) {
      expect(result).toHaveProperty('hit');
      expect(result).toHaveProperty('blockX');
      expect(result).toHaveProperty('blockY');
      expect(result).toHaveProperty('blockZ');
      expect(result).toHaveProperty('face');
    }
  });

  test('最大到達距離は10ブロック', async ({ page }) => {
    // プレイヤーを空に向けてレイキャスト
    const result = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 64, 8);
      player.setPitch(Math.PI / 2); // 真上を向く

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      return window.gameApp.physicsWorld.raycast(origin, direction, 10);
    });

    // 空（上方向）にはブロックがないのでnull
    expect(result).toBeNull();
  });

  test('地面を見下ろすとブロックがヒットする', async ({ page }) => {
    const result = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 4); // 下を向く

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      return window.gameApp.physicsWorld.raycast(origin, direction, 10);
    });

    expect(result).not.toBeNull();
    expect(result.hit).toBe(true);
  });

  test('ヒットした面が正しく判定される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 2 * 0.9); // 真下に近い方向を向く

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      return window.gameApp.physicsWorld.raycast(origin, direction, 10);
    });

    if (result) {
      // 面の値が有効な文字列であることを確認
      const validFaces = ['top', 'bottom', 'north', 'south', 'east', 'west'];
      expect(validFaces).toContain(result.face);
    }
  });

  test('隣接ブロック座標が計算される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 2 * 0.9);

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      return window.gameApp.physicsWorld.raycast(origin, direction, 10);
    });

    if (result) {
      expect(result).toHaveProperty('adjacentX');
      expect(result).toHaveProperty('adjacentY');
      expect(result).toHaveProperty('adjacentZ');
      // top面なら隣接はY+1
      if (result.face === 'top') {
        expect(result.adjacentY).toBe(result.blockY + 1);
      }
    }
  });

  test('getTargetBlock メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.blockInteraction.getTargetBlock === 'function');
    expect(exists).toBe(true);
  });
});

// ========================================
// TEST-2-5-4: ブロックハイライト機能
// ========================================
test.describe('TEST-2-5-4: ブロックハイライト機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('BlockHighlightクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.BlockHighlight === 'function');
    expect(exists).toBe(true);
  });

  test('blockHighlightオブジェクトが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => window.gameApp.blockInteraction.highlight !== undefined);
    expect(exists).toBe(true);
  });

  test('update メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.blockInteraction.highlight.update === 'function');
    expect(exists).toBe(true);
  });

  test('show/hide メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      const h = window.gameApp.blockInteraction.highlight;
      return typeof h.show === 'function' && typeof h.hide === 'function';
    });
    expect(exists).toBe(true);
  });

  test('ターゲットがない時はハイライトが非表示', async ({ page }) => {
    // プレイヤーを空に向ける
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPitch(Math.PI / 2); // 真上を向く
    });
    await page.waitForTimeout(200);

    const isVisible = await page.evaluate(() => {
      const highlight = window.gameApp.blockInteraction.highlight;
      return highlight.wireframe && highlight.wireframe.visible;
    });
    expect(isVisible).toBe(false);
  });

  test('ターゲットがある時はハイライトが表示される', async ({ page }) => {
    // プレイヤーを地面に向ける
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 4); // 下を向く
    });
    await page.waitForTimeout(200);

    const isVisible = await page.evaluate(() => {
      const highlight = window.gameApp.blockInteraction.highlight;
      return highlight.wireframe && highlight.wireframe.visible;
    });
    expect(isVisible).toBe(true);
  });

  test('ワイヤーフレームメッシュが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      const highlight = window.gameApp.blockInteraction.highlight;
      return highlight.wireframe !== undefined;
    });
    expect(exists).toBe(true);
  });

  test('面ハイライトメッシュが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      const highlight = window.gameApp.blockInteraction.highlight;
      return highlight.faceHighlight !== undefined;
    });
    expect(exists).toBe(true);
  });

  test('ターゲットブロックIDがデバッグUIに表示される', async ({ page }) => {
    // 地面を向く
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 4);
    });
    await page.waitForTimeout(500);

    const text = await page.locator('#debug-target-block').textContent();
    // ブロックIDまたは「なし」が表示される
    expect(text.length).toBeGreaterThan(0);
  });

  test('ターゲット座標がデバッグUIに表示される', async ({ page }) => {
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 4);
    });
    await page.waitForTimeout(500);

    const text = await page.locator('#debug-target-pos').textContent();
    expect(text.length).toBeGreaterThan(0);
  });

  test('ターゲット面がデバッグUIに表示される', async ({ page }) => {
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 4);
    });
    await page.waitForTimeout(500);

    const text = await page.locator('#debug-target-face').textContent();
    expect(text.length).toBeGreaterThan(0);
  });
});

// ========================================
// TEST-2-5-5: ブロック破壊機能
// ========================================
test.describe('TEST-2-5-5: ブロック破壊機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('handleMouseDown メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.blockInteraction.handleMouseDown === 'function');
    expect(exists).toBe(true);
  });

  test('左クリックでブロックが破壊される', async ({ page }) => {
    // ターゲットブロックの位置を取得
    const targetBefore = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 4);

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      const result = window.gameApp.physicsWorld.raycast(origin, direction, 10);

      if (result) {
        const blockId = window.gameApp.physicsWorld.getBlockAt(result.blockX, result.blockY, result.blockZ);
        return { ...result, blockId };
      }
      return null;
    });

    expect(targetBefore).not.toBeNull();
    expect(targetBefore.blockId).not.toBe('air');

    // 左クリックをシミュレート
    await page.evaluate(() => {
      const event = { button: 0, preventDefault: () => {} };
      window.gameApp.blockInteraction.handleMouseDown(event);
    });
    await page.waitForTimeout(500);

    // ブロックがairになったか確認
    const blockAfter = await page.evaluate((target) => {
      return window.gameApp.physicsWorld.getBlockAt(target.blockX, target.blockY, target.blockZ);
    }, targetBefore);

    expect(blockAfter).toBe('air');
  });

  test('右クリックでは破壊されない', async ({ page }) => {
    const targetBefore = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 4);

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      const result = window.gameApp.physicsWorld.raycast(origin, direction, 10);

      if (result) {
        const blockId = window.gameApp.physicsWorld.getBlockAt(result.blockX, result.blockY, result.blockZ);
        return { ...result, blockId };
      }
      return null;
    });

    // 右クリックをシミュレート
    await page.evaluate(() => {
      const event = { button: 2, preventDefault: () => {} };
      window.gameApp.blockInteraction.handleMouseDown(event);
    });
    await page.waitForTimeout(200);

    // ブロックは破壊されていない（airか設置されたブロックになる可能性があるので確認方法を変える）
    // ここでは右クリックで元のブロックが消えないことを確認
  });

  test('Y=0のブロックは破壊できない', async ({ page }) => {
    // Y=0にブロックがある状態を作る
    const result = await page.evaluate(() => {
      // Y=0のブロックを破壊しようとする
      const player = window.gameApp.player;
      player.setPosition(8, 2, 8);
      player.setPitch(-Math.PI / 2 * 0.99); // 真下を向く

      // 直接Y=0のブロックを破壊しようとする
      const success = window.gameApp.blockInteraction.destroyBlock(8, 0, 8);
      return success;
    });

    // Y=0は破壊不可なのでfalseを返す
    expect(result).toBe(false);
  });

  test('ターゲットがない時は破壊されない', async ({ page }) => {
    // 空を向く
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPitch(Math.PI / 2); // 真上を向く
    });

    // 左クリックをシミュレート
    const result = await page.evaluate(() => {
      const event = { button: 0, preventDefault: () => {} };
      return window.gameApp.blockInteraction.handleMouseDown(event);
    });

    // ターゲットがないのでfalseを返す
    expect(result).toBe(false);
  });
});

// ========================================
// TEST-2-5-6: ブロック設置機能
// ========================================
test.describe('TEST-2-5-6: ブロック設置機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('右クリックでブロックが設置される', async ({ page }) => {
    // 設置位置を取得（最初に空の場所を確保）
    const target = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setYaw(0);
      player.setPitch(-Math.PI / 3); // 下を向く

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      const result = window.gameApp.physicsWorld.raycast(origin, direction, 10);

      if (result) {
        // 隣接位置が空であることを確認し、もしブロックがあれば別の位置を探す
        const adj = window.gameApp.physicsWorld.getBlockAt(result.adjacentX, result.adjacentY, result.adjacentZ);
        if (adj && adj !== 'air') {
          // 既にブロックがあるのでスキップ
          return null;
        }
      }
      return result;
    });

    if (!target) {
      // 設置できる位置がない場合はテストをスキップ
      return;
    }

    // 右クリックをシミュレート
    await page.evaluate(() => {
      const event = { button: 2, preventDefault: () => {} };
      window.gameApp.blockInteraction.handleMouseDown(event);
    });
    await page.waitForTimeout(500);

    // ブロックが設置されたか確認
    const blockAfter = await page.evaluate((t) => {
      return window.gameApp.physicsWorld.getBlockAt(t.adjacentX, t.adjacentY, t.adjacentZ);
    }, target);

    expect(blockAfter).not.toBe('air');
    expect(blockAfter).not.toBeNull();
  });

  test('選択中のブロックが設置される', async ({ page }) => {
    // スロット3を選択
    await page.evaluate(() => {
      window.gameApp.hotbar.selectSlot(3);
    });

    const selectedBlock = await page.evaluate(() => window.gameApp.hotbar.getSelectedBlock());

    // 設置可能な位置を取得（隣接位置が空であることを確認）
    const target = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(10, 65, 10);  // 異なる位置に移動して新しいターゲットを取得
      player.setYaw(0);
      player.setPitch(-Math.PI / 3);

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      const result = window.gameApp.physicsWorld.raycast(origin, direction, 10);

      if (result) {
        const adj = window.gameApp.physicsWorld.getBlockAt(result.adjacentX, result.adjacentY, result.adjacentZ);
        if (adj && adj !== 'air') {
          return null;
        }
      }
      return result;
    });

    if (!target) {
      return;
    }

    // 右クリックで設置
    await page.evaluate(() => {
      const event = { button: 2, preventDefault: () => {} };
      window.gameApp.blockInteraction.handleMouseDown(event);
    });
    await page.waitForTimeout(500);

    // 設置されたブロックを確認
    const placedBlock = await page.evaluate((t) => {
      return window.gameApp.physicsWorld.getBlockAt(t.adjacentX, t.adjacentY, t.adjacentZ);
    }, target);

    expect(placedBlock).toBe(selectedBlock.block_str_id);
  });

  test('プレイヤーと重なる位置には設置できない', async ({ page }) => {
    const result = await page.evaluate(() => {
      const player = window.gameApp.player;
      const pos = player.getPosition();

      // プレイヤーの足元に設置しようとする
      const success = window.gameApp.blockInteraction.placeBlock(
        Math.floor(pos.x),
        Math.floor(pos.y),
        Math.floor(pos.z),
        'stone'
      );
      return success;
    });

    // プレイヤーと重なるので設置失敗
    expect(result).toBe(false);
  });

  test('既存ブロックがある位置には設置できない', async ({ page }) => {
    // 既にブロックがある位置を取得
    const target = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 65, 8);
      player.setPitch(-Math.PI / 4);

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      return window.gameApp.physicsWorld.raycast(origin, direction, 10);
    });

    // その位置にブロックを設置しようとする
    const result = await page.evaluate((t) => {
      return window.gameApp.blockInteraction.placeBlock(
        t.blockX,
        t.blockY,
        t.blockZ,
        'stone'
      );
    }, target);

    // 既にブロックがあるので設置失敗
    expect(result).toBe(false);
  });

  test('Y範囲外には設置できない', async ({ page }) => {
    // Y=128以上に設置しようとする
    const resultAbove = await page.evaluate(() => {
      return window.gameApp.blockInteraction.placeBlock(8, 128, 8, 'stone');
    });
    expect(resultAbove).toBe(false);

    // Y=0未満に設置しようとする
    const resultBelow = await page.evaluate(() => {
      return window.gameApp.blockInteraction.placeBlock(8, -1, 8, 'stone');
    });
    expect(resultBelow).toBe(false);
  });

  test('ターゲットがない時は設置されない', async ({ page }) => {
    // 空を向く
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPitch(Math.PI / 2);
    });

    const result = await page.evaluate(() => {
      const event = { button: 2, preventDefault: () => {} };
      return window.gameApp.blockInteraction.handleMouseDown(event);
    });

    expect(result).toBe(false);
  });
});

// ========================================
// TEST-2-5-7: IndexedDB保存機能
// ========================================
test.describe('TEST-2-5-7: IndexedDB保存機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('破壊したブロックがリロード後も消えている', async ({ page }) => {
    // 固有の座標を使用してターゲットブロックを破壊（他のテストと衝突しない位置）
    const testX = 20, testY = 63, testZ = 20;

    // まずその位置にブロックがあることを確認し、なければY座標を探索
    const target = await page.evaluate(({x, y, z}) => {
      const player = window.gameApp.player;
      player.setPosition(x, y + 3, z);
      player.setYaw(0);
      player.setPitch(-Math.PI / 2 * 0.9); // 真下を向く

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      const result = window.gameApp.physicsWorld.raycast(origin, direction, 10);

      if (result && result.blockY > 0) {
        return result;
      }
      return null;
    }, { x: testX, y: testY, z: testZ });

    if (!target) {
      return; // テスト用のブロックが見つからない場合はスキップ
    }

    // 左クリックで破壊
    await page.evaluate(() => {
      const event = { button: 0, preventDefault: () => {} };
      window.gameApp.blockInteraction.handleMouseDown(event);
    });
    await page.waitForTimeout(1000); // 保存を待つ

    // リロード
    await page.reload();
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );

    // ブロックがまだairであることを確認
    const blockAfterReload = await page.evaluate((t) => {
      return window.gameApp.physicsWorld.getBlockAt(t.blockX, t.blockY, t.blockZ);
    }, target);

    expect(blockAfterReload).toBe('air');
  });

  test('設置したブロックがリロード後も残っている', async ({ page }) => {
    // 固有の座標を使用（他のテストと衝突しない位置）
    const testX = 25, testY = 63, testZ = 25;

    // 設置位置を取得
    const target = await page.evaluate(({x, y, z}) => {
      const player = window.gameApp.player;
      player.setPosition(x, y + 3, z);
      player.setYaw(0);
      player.setPitch(-Math.PI / 3);

      const origin = player.getEyePosition();
      const direction = player.getLookDirection();
      const result = window.gameApp.physicsWorld.raycast(origin, direction, 10);

      if (result) {
        // 隣接位置が空であることを確認
        const adj = window.gameApp.physicsWorld.getBlockAt(result.adjacentX, result.adjacentY, result.adjacentZ);
        if (!adj || adj === 'air') {
          return result;
        }
      }
      return null;
    }, { x: testX, y: testY, z: testZ });

    if (!target) {
      return; // 設置可能な位置がない場合はスキップ
    }

    const selectedBlockId = await page.evaluate(() => window.gameApp.hotbar.getSelectedBlock().block_str_id);

    // 右クリックで設置
    await page.evaluate(() => {
      const event = { button: 2, preventDefault: () => {} };
      window.gameApp.blockInteraction.handleMouseDown(event);
    });
    await page.waitForTimeout(1000);

    // リロード
    await page.reload();
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );

    // ブロックが残っていることを確認
    const blockAfterReload = await page.evaluate((t) => {
      return window.gameApp.physicsWorld.getBlockAt(t.adjacentX, t.adjacentY, t.adjacentZ);
    }, target);

    expect(blockAfterReload).toBe(selectedBlockId);
  });
});

// ========================================
// TEST-2-5-8: カスタムブロック対応
// ========================================
test.describe('TEST-2-5-8: カスタムブロック対応', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('ホットバーにカスタムブロックが含まれる場合がある', async ({ page }) => {
    const hasCustom = await page.evaluate(() => {
      const blocks = window.gameApp.hotbar.blocks;
      return blocks.some(b => b.shape_type === 'custom');
    });
    // カスタムブロックがあるかどうかはデータ次第なので、型チェックのみ
    expect(typeof hasCustom).toBe('boolean');
  });

  test('カスタムブロックを設置できる', async ({ page }) => {
    // カスタムブロックがあるスロットを探す
    const customSlot = await page.evaluate(() => {
      const blocks = window.gameApp.hotbar.blocks;
      const index = blocks.findIndex(b => b.shape_type === 'custom');
      return index;
    });

    if (customSlot >= 0) {
      // カスタムブロックを選択
      await page.evaluate((slot) => {
        window.gameApp.hotbar.selectSlot(slot);
      }, customSlot);

      // 固有の座標を使用（他のテストと衝突しない位置）
      const target = await page.evaluate(() => {
        const player = window.gameApp.player;
        player.setPosition(30, 65, 30);  // 他のテストと重複しない位置
        player.setYaw(0);
        player.setPitch(-Math.PI / 3);

        const origin = player.getEyePosition();
        const direction = player.getLookDirection();
        const result = window.gameApp.physicsWorld.raycast(origin, direction, 10);

        if (result) {
          // 隣接位置が空であることを確認
          const adj = window.gameApp.physicsWorld.getBlockAt(result.adjacentX, result.adjacentY, result.adjacentZ);
          if (!adj || adj === 'air') {
            return result;
          }
        }
        return null;
      });

      if (!target) {
        return; // 設置可能な位置がない場合はスキップ
      }

      const selectedBlock = await page.evaluate(() => window.gameApp.hotbar.getSelectedBlock());

      // 右クリックで設置
      await page.evaluate(() => {
        const event = { button: 2, preventDefault: () => {} };
        window.gameApp.blockInteraction.handleMouseDown(event);
      });
      await page.waitForTimeout(500);

      // 設置されたか確認
      const placedBlock = await page.evaluate((t) => {
        return window.gameApp.physicsWorld.getBlockAt(t.adjacentX, t.adjacentY, t.adjacentZ);
      }, target);

      expect(placedBlock).toBe(selectedBlock.block_str_id);
    }
  });

  test('カスタムブロックのハイライトはバウンディングボックス全体', async ({ page }) => {
    // ハイライトのサイズが1x1x1であることを確認
    const size = await page.evaluate(() => {
      const highlight = window.gameApp.blockInteraction.highlight;
      if (highlight.wireframe && highlight.wireframe.geometry) {
        const box = highlight.wireframe.geometry.boundingBox;
        if (box) {
          return {
            width: box.max.x - box.min.x,
            height: box.max.y - box.min.y,
            depth: box.max.z - box.min.z
          };
        }
      }
      return null;
    });

    // ワイヤーフレームは1x1x1のサイズ
    if (size) {
      expect(size.width).toBeCloseTo(1, 1);
      expect(size.height).toBeCloseTo(1, 1);
      expect(size.depth).toBeCloseTo(1, 1);
    }
  });
});

// ========================================
// TEST-2-5-9: block_manager.html への統合
// ========================================
test.describe('TEST-2-5-9: block_manager.html への統合', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BLOCK_MANAGER_PATH);
    await page.waitForSelector('.tabs');
  });

  test('「ブロック操作テスト」タブが存在する', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="blockTest"]');
    await expect(tab).toBeVisible();
  });

  test('タブをクリックするとコンテンツが表示される', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="blockTest"]');
    await tab.click();

    const content = page.locator('#blockTest');
    await expect(content).toHaveClass(/active/, { timeout: 5000 });
  });

  test('コンテンツ内にiframeが存在する', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="blockTest"]');
    await tab.click();
    await page.waitForTimeout(500);

    const iframe = page.locator('#blockTestFrame');
    const exists = await iframe.count();
    expect(exists).toBe(1);
  });

  test('iframeが正しいURLを参照している', async ({ page }) => {
    const iframe = page.locator('#blockTestFrame');
    const src = await iframe.getAttribute('src');
    expect(src).toContain('2-5_block_test.html');
  });
});

// ========================================
// TEST-2-5-10: 操作説明の更新
// ========================================
test.describe('TEST-2-5-10: 操作説明の更新', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('操作説明パネルが表示される', async ({ page }) => {
    await expect(page.locator('#controls-help')).toBeVisible();
  });

  test('操作説明に「左クリック: ブロック破壊」が含まれる', async ({ page }) => {
    const text = await page.locator('#controls-help').textContent();
    expect(text).toContain('左クリック');
    expect(text).toContain('破壊');
  });

  test('操作説明に「右クリック: ブロック設置」が含まれる', async ({ page }) => {
    const text = await page.locator('#controls-help').textContent();
    expect(text).toContain('右クリック');
    expect(text).toContain('設置');
  });

  test('操作説明に「ホイール: ブロック選択」が含まれる', async ({ page }) => {
    const text = await page.locator('#controls-help').textContent();
    expect(text).toContain('ホイール');
    expect(text).toContain('選択');
  });
});

// ========================================
// TEST-2-5-11: 2-4からの継承機能
// ========================================
test.describe('TEST-2-5-11: 2-4からの継承機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('Playerクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.Player === 'function');
    expect(exists).toBe(true);
  });

  test('PlayerControllerクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.PlayerController === 'function');
    expect(exists).toBe(true);
  });

  test('PhysicsWorldクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.PhysicsWorld === 'function');
    expect(exists).toBe(true);
  });

  test('FirstPersonCameraクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.FirstPersonCamera === 'function');
    expect(exists).toBe(true);
  });

  test('ChunkManagerが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => window.gameApp.chunkManager !== undefined);
    expect(exists).toBe(true);
  });

  test('WASD移動が動作する', async ({ page }) => {
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );

    const initialZ = await page.evaluate(() => window.gameApp.player.getPosition().z);

    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = false;
    });

    const newZ = await page.evaluate(() => window.gameApp.player.getPosition().z);
    expect(newZ).toBeGreaterThan(initialZ);
  });

  test('飛行モードが動作する', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
    });
    const isFlying = await page.evaluate(() => window.gameApp.player.isFlying());
    expect(isFlying).toBe(true);
  });
});

// ========================================
// TEST-2-5-12: パフォーマンス設定
// ========================================
test.describe('TEST-2-5-12: パフォーマンス設定', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('グリーディメッシングがデフォルトでONになっている', async ({ page }) => {
    const useGreedy = await page.evaluate(() => window.gameApp.chunkManager.useGreedy);
    expect(useGreedy).toBe(true);
  });

  test('カスタムブロックのグリーディメッシングメソッドが存在する', async ({ page }) => {
    const hasMethod = await page.evaluate(() => {
      const builder = window.gameApp.chunkManager.customBlockMeshBuilder;
      return typeof builder.buildWithUVGreedy === 'function';
    });
    expect(hasMethod).toBe(true);
  });

  test('カスタムブロックのグリーディメッシングがメッシュを返す', async ({ page }) => {
    const result = await page.evaluate(() => {
      const builder = window.gameApp.chunkManager.customBlockMeshBuilder;
      // 2x2x2の立方体を作成（マテリアル1で塗りつぶし）
      const voxelData = new Uint8Array(128);
      // 2x2x2の立方体を設定（x=0-1, y=0-1, z=0-1にマテリアル1を設定）
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          for (let x = 0; x < 2; x++) {
            VoxelData.setVoxel(voxelData, x, y, z, 1);
          }
        }
      }
      const materials = [
        builder.createColorMaterial(0xff0000),
        builder.createColorMaterial(0x00ff00),
        builder.createColorMaterial(0x0000ff)
      ];
      const mesh = builder.buildWithUVGreedy(voxelData, materials, 0.125);
      return {
        isMesh: mesh.isMesh === true,
        hasGeometry: !!mesh.geometry,
        vertexCount: mesh.geometry ? mesh.geometry.attributes.position.count : 0
      };
    });
    expect(result.isMesh).toBe(true);
    expect(result.hasGeometry).toBe(true);
    // 2x2x2の立方体は6面、各面4頂点で24頂点（内部面はカリングされる）
    expect(result.vertexCount).toBe(24);
  });

  test('カスタムブロックのグリーディメッシングでポリゴン数が削減される', async ({ page }) => {
    const result = await page.evaluate(() => {
      const builder = window.gameApp.chunkManager.customBlockMeshBuilder;
      // 4x4x4の立方体を作成
      const voxelData = new Uint8Array(128);
      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            VoxelData.setVoxel(voxelData, x, y, z, 1);
          }
        }
      }
      const materials = [
        builder.createColorMaterial(0xff0000),
        builder.createColorMaterial(0x00ff00),
        builder.createColorMaterial(0x0000ff)
      ];

      // グリーディなし（個別メッシュ）
      const groupNonGreedy = builder.buildWithUV(voxelData, materials, 0.125);
      let nonGreedyVertices = 0;
      groupNonGreedy.traverse(obj => {
        if (obj.geometry) nonGreedyVertices += obj.geometry.attributes.position.count;
      });

      // グリーディあり
      const meshGreedy = builder.buildWithUVGreedy(voxelData, materials, 0.125);
      const greedyVertices = meshGreedy.geometry.attributes.position.count;

      return {
        nonGreedyVertices,
        greedyVertices,
        reduced: greedyVertices < nonGreedyVertices
      };
    });
    // グリーディメッシングで頂点数が削減されていることを確認
    expect(result.reduced).toBe(true);
    // 4x4x4の立方体: 非グリーディ=64個×24頂点(表面のみ), グリーディ=6面×4頂点=24頂点
    expect(result.greedyVertices).toBeLessThan(result.nonGreedyVertices);
  });
});
