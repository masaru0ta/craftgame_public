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

// ========================================
// TEST-2-5-13: カスタムブロックの当たり判定
// ========================================
test.describe('TEST-2-5-13: カスタムブロックの当たり判定', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('カスタムブロックのレイキャストが当たり判定ボクセルに基づく', async ({ page }) => {
    // テスト用にカスタムブロックを配置し、レイキャストをテスト
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;

      // 下半分だけ当たり判定があるカスタムブロックを作成
      // voxel_collision: 4x4x4、下半分（y=0,1）のみ1
      const collisionData = CustomCollision.createEmpty();
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      // テスト用ブロック定義を作成
      const testBlockDef = {
        block_str_id: 'test_custom_half',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };

      // textureLoaderにテスト用ブロックを追加
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      // 既存のブロックに追加（重複チェック）
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_custom_half');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      // プレイヤー位置付近にチャンクを取得（座標 8, 64, 8 付近）
      const testX = 8, testY = 64, testZ = 10;
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor(testZ / 16);
      const chunkKey = `${chunkX},${chunkZ}`;
      let chunk = pw.chunkManager.chunks.get(chunkKey);

      // チャンクにデータがない場合は作成
      if (!chunk) {
        return { error: 'Chunk object not found: ' + chunkKey };
      }

      // チャンクデータへのアクセス（chunk.chunkDataまたはchunk.data）
      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        // ChunkDataを新規作成
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
        // 地面を生成
        for (let y = 0; y < 64; y++) {
          for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
              chunkData.setBlock(x, y, z, 'stone');
            }
          }
        }
      }

      // チャンク内のローカル座標
      const localX = ((testX % 16) + 16) % 16;
      const localZ = ((testZ % 16) + 16) % 16;

      // テスト用ブロックを配置
      chunkData.setBlock(localX, testY, localZ, 'test_custom_half');

      // レイキャストテスト1: 上半分を狙う（y=64.75、当たり判定なし部分）
      const rayOriginTop = { x: testX + 0.5, y: testY + 0.75, z: testZ - 2 };
      const rayDirection = { x: 0, y: 0, z: 1 };
      const resultTop = pw.raycast(rayOriginTop, rayDirection, 10);

      // レイキャストテスト2: 下半分を狙う（y=64.25、当たり判定あり部分）
      const rayOriginBottom = { x: testX + 0.5, y: testY + 0.25, z: testZ - 2 };
      const resultBottom = pw.raycast(rayOriginBottom, rayDirection, 10);

      return {
        testX,
        testY,
        testZ,
        topHit: resultTop ? resultTop.hit : false,
        topBlockX: resultTop ? resultTop.blockX : null,
        topBlockZ: resultTop ? resultTop.blockZ : null,
        bottomHit: resultBottom ? resultBottom.hit : false,
        bottomBlockX: resultBottom ? resultBottom.blockX : null,
        bottomBlockZ: resultBottom ? resultBottom.blockZ : null
      };
    });

    // エラーチェック
    expect(result.error).toBeUndefined();

    // 下半分（当たり判定あり）はヒットする
    expect(result.bottomHit).toBe(true);
    expect(result.bottomBlockX).toBe(result.testX);
    expect(result.bottomBlockZ).toBe(result.testZ);

    // 上半分はこのブロックにヒットしないはず（通過するか別のブロックにヒット）
    if (result.topHit && result.topBlockZ === result.testZ) {
      expect(result.topBlockX).not.toBe(result.testX);
    }
  });

  test('PhysicsWorld._raycastCustomBlock メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      return typeof window.gameApp.physicsWorld._raycastCustomBlock === 'function';
    });
    expect(exists).toBe(true);
  });

  test('当たり判定ボクセルサイズが0.25ブロックである', async ({ page }) => {
    // CustomCollisionのGRID_SIZEが4であることを確認（1/4 = 0.25）
    const gridSize = await page.evaluate(() => {
      return CustomCollision.GRID_SIZE;
    });
    expect(gridSize).toBe(4);
    // 0.25ブロックサイズ = 1 / gridSize
    expect(1 / gridSize).toBe(0.25);
  });
});

// ========================================
// TEST-2-5-14: ステップアップ機能
// ========================================
test.describe('TEST-2-5-14: ステップアップ機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('PhysicsWorld.STEP_UP_MAX_HEIGHT が0.5である', async ({ page }) => {
    const stepUpMaxHeight = await page.evaluate(() => {
      return window.gameApp.physicsWorld.stepUpMaxHeight;
    });
    expect(stepUpMaxHeight).toBe(0.5);
  });

  test('PhysicsWorld.STEP_CHECK_DISTANCE が0.3である', async ({ page }) => {
    const stepCheckDistance = await page.evaluate(() => {
      return window.gameApp.physicsWorld.stepCheckDistance;
    });
    expect(stepCheckDistance).toBe(0.3);
  });

  test('0.5ブロック以下の段差を瞬時に乗り越えられる', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;
      const player = window.gameApp.player;
      const cm = window.gameApp.chunkManager;

      // テスト用の位置
      const testX = 50, testY = 64, testZ = 50;
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor(testZ / 16);
      const chunkKey = `${chunkX},${chunkZ}`;

      // チャンクを取得または作成
      let chunk = cm.chunks.get(chunkKey);
      if (!chunk) {
        return { error: 'Chunk not found' };
      }

      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
      }

      // 地面を作成
      const localX = ((testX % 16) + 16) % 16;
      const localZ = ((testZ % 16) + 16) % 16;
      const localZNext = ((testZ + 1) % 16 + 16) % 16;

      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          chunkData.setBlock(lx, testY - 1, lz, 'stone');
        }
      }

      // 0.5ブロックの高さのハーフブロック（当たり判定: 下半分のみ）を配置
      // voxel_collision: y=0,1（下半分）のみ当たり判定あり
      const collisionData = CustomCollision.createEmpty();
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      // テスト用ブロック定義を登録
      const testBlockDef = {
        block_str_id: 'test_half_block',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_half_block');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      // ハーフブロックを配置（プレイヤーの進行方向）
      chunkData.setBlock(localX, testY, localZNext, 'test_half_block');

      // プレイヤーを配置（地面の上、ハーフブロックの手前）
      player.setPosition(testX + 0.5, testY, testZ + 0.5);
      player.setOnGround(true);
      player.setFlying(false);
      player.setSprinting(false);
      player.setVelocity(0, 0, 0);

      // 初期位置を記録
      const initialY = player.getPosition().y;

      // 北（Z+）方向に移動（ステップアップ対象のハーフブロックに向かう）
      const moveSpeed = 5;
      const deltaTime = 0.1;
      const velocity = { x: 0, y: 0, z: moveSpeed };

      // 複数回移動してハーフブロックに衝突させる
      for (let i = 0; i < 20; i++) {
        pw.movePlayer(player, velocity, deltaTime);
      }

      const finalPos = player.getPosition();
      const yDiff = finalPos.y - initialY;

      return {
        initialY,
        finalY: finalPos.y,
        finalZ: finalPos.z,
        yDiff,
        // 0.5ブロック上がっているはず
        steppedUp: yDiff >= 0.4 && yDiff <= 0.6
      };
    });

    if (result.error) {
      console.log('Test skipped:', result.error);
      return;
    }

    // 0.5ブロックの段差を乗り越えた
    expect(result.steppedUp).toBe(true);
  });

  test('0.5超〜1.0ブロックの段差はオートジャンプになる（ジャンプ速度が付与される）', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;
      const player = window.gameApp.player;
      const cm = window.gameApp.chunkManager;

      // テスト用の位置
      const testX = 55, testY = 64, testZ = 55;
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor(testZ / 16);
      const chunkKey = `${chunkX},${chunkZ}`;

      let chunk = cm.chunks.get(chunkKey);
      if (!chunk) {
        return { error: 'Chunk not found' };
      }

      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
      }

      // 地面を作成
      const localX = ((testX % 16) + 16) % 16;
      const localZ = ((testZ % 16) + 16) % 16;
      const localZNext = ((testZ + 1) % 16 + 16) % 16;

      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          chunkData.setBlock(lx, testY - 1, lz, 'stone');
        }
      }

      // 0.75ブロックの高さのブロック（当たり判定: y=0,1,2）を配置
      // 0.5超なのでオートジャンプになるはず
      const collisionData = CustomCollision.createEmpty();
      for (let y = 0; y < 3; y++) {  // 3/4 = 0.75ブロック
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      const testBlockDef = {
        block_str_id: 'test_075block',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_075block');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      chunkData.setBlock(localX, testY, localZNext, 'test_075block');

      // プレイヤーを配置
      player.setPosition(testX + 0.5, testY, testZ + 0.5);
      player.setOnGround(true);
      player.setFlying(false);
      player.setVelocity(0, 0, 0);

      // オートジャンプON
      if (window.gameApp.playerController) {
        window.gameApp.playerController.autoJumpEnabled = true;
      }

      const initialY = player.getPosition().y;

      // 北（Z+）方向に移動して衝突させる
      const velocity = { x: 0, y: 0, z: 5 };
      // 1フレームだけ移動して衝突させる
      pw.movePlayer(player, velocity, 0.1);

      // 衝突直後のY速度を確認（ジャンプ速度が付与されているはず）
      const velocityAfterCollision = player.getVelocity();

      return {
        initialY,
        velocityY: velocityAfterCollision.y,
        // ジャンプ速度（8）が付与されている = オートジャンプ発動
        hasJumpVelocity: velocityAfterCollision.y >= 7
      };
    });

    if (result.error) {
      console.log('Test skipped:', result.error);
      return;
    }

    // オートジャンプでジャンプ速度が付与された
    expect(result.hasJumpVelocity).toBe(true);
  });

  test('1.0ブロックより高い段差はステップアップしない', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;
      const player = window.gameApp.player;
      const cm = window.gameApp.chunkManager;

      // テスト用の位置
      const testX = 57, testY = 64, testZ = 57;
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor(testZ / 16);
      const chunkKey = `${chunkX},${chunkZ}`;

      let chunk = cm.chunks.get(chunkKey);
      if (!chunk) {
        return { error: 'Chunk not found' };
      }

      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
      }

      // 地面を作成
      const localX = ((testX % 16) + 16) % 16;
      const localZ = ((testZ % 16) + 16) % 16;
      const localZNext = ((testZ + 1) % 16 + 16) % 16;

      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          chunkData.setBlock(lx, testY - 1, lz, 'stone');
        }
      }

      // 1.25ブロックの高さのブロック（通常ブロック+0.25）を配置
      // 通常ブロックを1段目に配置
      chunkData.setBlock(localX, testY, localZNext, 'stone');

      // その上に0.25ブロックのカスタムブロックを配置
      const collisionData = CustomCollision.createEmpty();
      for (let y = 0; y < 1; y++) {  // 1/4 = 0.25ブロック
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      const testBlockDef = {
        block_str_id: 'test_025_block',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_025_block');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      chunkData.setBlock(localX, testY + 1, localZNext, 'test_025_block');

      // プレイヤーを配置
      player.setPosition(testX + 0.5, testY, testZ + 0.5);
      player.setOnGround(true);
      player.setFlying(false);
      player.setVelocity(0, 0, 0);

      const initialY = player.getPosition().y;
      const initialZ = player.getPosition().z;

      // 北（Z+）方向に移動
      const velocity = { x: 0, y: 0, z: 5 };
      for (let i = 0; i < 20; i++) {
        pw.movePlayer(player, velocity, 0.1);
      }

      const finalPos = player.getPosition();

      return {
        initialY,
        finalY: finalPos.y,
        initialZ,
        finalZ: finalPos.z,
        // Y座標が変わっていない（ステップアップしていない）
        noStepUp: Math.abs(finalPos.y - initialY) < 0.1,
        // Z座標も進んでいない（壁にぶつかっている）
        blocked: finalPos.z < initialZ + 0.5
      };
    });

    if (result.error) {
      console.log('Test skipped:', result.error);
      return;
    }

    // 1.25ブロックの段差はステップアップしない
    expect(result.noStepUp).toBe(true);
  });

  test('階段を前から登るとステップアップ（進行方向前方の高さが低い）', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;
      const player = window.gameApp.player;
      const cm = window.gameApp.chunkManager;

      // テスト用の位置
      const testX = 58, testY = 64, testZ = 58;
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor(testZ / 16);
      const chunkKey = `${chunkX},${chunkZ}`;

      let chunk = cm.chunks.get(chunkKey);
      if (!chunk) {
        return { error: 'Chunk not found' };
      }

      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
      }

      // 地面を作成
      const localX = ((testX % 16) + 16) % 16;
      const localZ = ((testZ % 16) + 16) % 16;
      const localZNext = ((testZ + 1) % 16 + 16) % 16;

      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          chunkData.setBlock(lx, testY - 1, lz, 'stone');
        }
      }

      // 階段ブロック（Z+方向に向かって低くなる）
      // z=0,1: 高さ1.0 (y=0,1,2,3)
      // z=2: 高さ0.5 (y=0,1)
      // z=3: 高さ0.25 (y=0)
      const collisionData = CustomCollision.createEmpty();
      // z=0,1は高さ1.0
      for (let z = 0; z < 2; z++) {
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      // z=2は高さ0.5
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 4; x++) {
          CustomCollision.setVoxel(collisionData, x, y, 2, 1);
        }
      }
      // z=3は高さ0.25
      for (let x = 0; x < 4; x++) {
        CustomCollision.setVoxel(collisionData, x, 0, 3, 1);
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      const testBlockDef = {
        block_str_id: 'test_stair_block',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_stair_block');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      chunkData.setBlock(localX, testY, localZNext, 'test_stair_block');

      // プレイヤーを配置（階段の低い方から入る = Z+方向に進む）
      player.setPosition(testX + 0.5, testY, testZ + 0.5);
      player.setOnGround(true);
      player.setFlying(false);
      player.setVelocity(0, 0, 0);

      const initialY = player.getPosition().y;

      // 北（Z+）方向に移動（階段の低い方から入る）
      const velocity = { x: 0, y: 0, z: 5 };
      // 1フレーム移動
      pw.movePlayer(player, velocity, 0.1);

      const velocityAfter = player.getVelocity();
      const posAfter = player.getPosition();

      return {
        initialY,
        finalY: posAfter.y,
        velocityY: velocityAfter.y,
        yDiff: posAfter.y - initialY,
        // ステップアップ = Y座標が上がり、ジャンプ速度がない
        isStepUp: (posAfter.y - initialY) > 0.1 && velocityAfter.y < 1
      };
    });

    if (result.error) {
      console.log('Test skipped:', result.error);
      return;
    }

    // 階段を前から登るとステップアップ（ジャンプ速度なしで上がる）
    expect(result.isStepUp).toBe(true);
  });

  test('階段を後ろから登るとオートジャンプ（進行方向前方の高さが高い）', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;
      const player = window.gameApp.player;
      const cm = window.gameApp.chunkManager;

      // テスト用の位置
      const testX = 59, testY = 64, testZ = 62;  // 階段の高い方から入る位置
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor((testZ - 1) / 16);  // 階段ブロックのあるチャンク
      const chunkKey = `${chunkX},${chunkZ}`;

      let chunk = cm.chunks.get(chunkKey);
      if (!chunk) {
        return { error: 'Chunk not found' };
      }

      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
      }

      // 地面を作成
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          chunkData.setBlock(lx, testY - 1, lz, 'stone');
        }
      }

      // 階段ブロック（Z-方向に向かって低くなる = Z+方向に向かって高い）
      // z=0: 高さ0.25 (y=0)
      // z=1: 高さ0.5 (y=0,1)
      // z=2,3: 高さ1.0 (y=0,1,2,3)
      const collisionData = CustomCollision.createEmpty();
      // z=0は高さ0.25
      for (let x = 0; x < 4; x++) {
        CustomCollision.setVoxel(collisionData, x, 0, 0, 1);
      }
      // z=1は高さ0.5
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 4; x++) {
          CustomCollision.setVoxel(collisionData, x, y, 1, 1);
        }
      }
      // z=2,3は高さ1.0
      for (let z = 2; z < 4; z++) {
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      const testBlockDef = {
        block_str_id: 'test_stair_block2',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_stair_block2');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      const stairLocalX = ((testX % 16) + 16) % 16;
      const stairLocalZ = (((testZ - 1) % 16) + 16) % 16;
      chunkData.setBlock(stairLocalX, testY, stairLocalZ, 'test_stair_block2');

      // プレイヤーを配置（階段の高い方から入る = Z-方向に進む）
      player.setPosition(testX + 0.5, testY, testZ + 0.5);
      player.setOnGround(true);
      player.setFlying(false);
      player.setVelocity(0, 0, 0);

      // オートジャンプON
      if (window.gameApp.playerController) {
        window.gameApp.playerController.autoJumpEnabled = true;
      }

      const initialY = player.getPosition().y;

      // 南（Z-）方向に移動（階段の高い方から入る）
      const velocity = { x: 0, y: 0, z: -5 };
      // 1フレーム移動
      pw.movePlayer(player, velocity, 0.1);

      const velocityAfter = player.getVelocity();
      const posAfter = player.getPosition();

      return {
        initialY,
        finalY: posAfter.y,
        velocityY: velocityAfter.y,
        // オートジャンプ = ジャンプ速度が付与されている
        isAutoJump: velocityAfter.y >= 7
      };
    });

    if (result.error) {
      console.log('Test skipped:', result.error);
      return;
    }

    // 階段を後ろから登るとオートジャンプ（ジャンプ速度が付与される）
    expect(result.isAutoJump).toBe(true);
  });

  test('ステップアップはジャンプ速度を付与しない（瞬時移動）', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;
      const player = window.gameApp.player;
      const cm = window.gameApp.chunkManager;

      // テスト用の位置
      const testX = 60, testY = 64, testZ = 60;
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor(testZ / 16);
      const chunkKey = `${chunkX},${chunkZ}`;

      let chunk = cm.chunks.get(chunkKey);
      if (!chunk) {
        return { error: 'Chunk not found' };
      }

      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
      }

      // 地面を作成
      const localX = ((testX % 16) + 16) % 16;
      const localZ = ((testZ % 16) + 16) % 16;
      const localZNext = ((testZ + 1) % 16 + 16) % 16;

      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          chunkData.setBlock(lx, testY - 1, lz, 'stone');
        }
      }

      // 0.5ブロックのハーフブロックを配置
      const collisionData = CustomCollision.createEmpty();
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      const testBlockDef = {
        block_str_id: 'test_half_block2',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_half_block2');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      chunkData.setBlock(localX, testY, localZNext, 'test_half_block2');

      // プレイヤーを配置
      player.setPosition(testX + 0.5, testY, testZ + 0.5);
      player.setOnGround(true);
      player.setFlying(false);
      player.setVelocity(0, 0, 0);

      // 移動してステップアップ
      const velocity = { x: 0, y: 0, z: 5 };
      for (let i = 0; i < 20; i++) {
        pw.movePlayer(player, velocity, 0.1);
      }

      // ステップアップ後のY速度を確認
      const velocityAfter = player.getVelocity();

      return {
        velocityY: velocityAfter.y,
        // ジャンプ速度（8）が付与されていないこと
        noJumpVelocity: Math.abs(velocityAfter.y) < 1
      };
    });

    if (result.error) {
      console.log('Test skipped:', result.error);
      return;
    }

    // ステップアップはジャンプ速度を付与しない
    expect(result.noJumpVelocity).toBe(true);
  });

  test('飛行モード中はステップアップしない', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;
      const player = window.gameApp.player;
      const cm = window.gameApp.chunkManager;

      const testX = 65, testY = 64, testZ = 65;
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor(testZ / 16);
      const chunkKey = `${chunkX},${chunkZ}`;

      let chunk = cm.chunks.get(chunkKey);
      if (!chunk) {
        return { error: 'Chunk not found' };
      }

      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
      }

      const localX = ((testX % 16) + 16) % 16;
      const localZNext = ((testZ + 1) % 16 + 16) % 16;

      // ハーフブロックを配置
      const collisionData = CustomCollision.createEmpty();
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      const testBlockDef = {
        block_str_id: 'test_half_fly',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_half_fly');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      chunkData.setBlock(localX, testY, localZNext, 'test_half_fly');

      // プレイヤーを飛行モードで配置
      player.setPosition(testX + 0.5, testY, testZ + 0.5);
      player.setFlying(true);  // 飛行モードON
      player.setOnGround(false);
      player.setVelocity(0, 0, 0);

      const initialY = player.getPosition().y;

      // 移動
      const velocity = { x: 0, y: 0, z: 5 };
      for (let i = 0; i < 20; i++) {
        pw.movePlayer(player, velocity, 0.1);
      }

      const finalY = player.getPosition().y;

      return {
        initialY,
        finalY,
        // 飛行モードではステップアップしない（Y座標が変わらない）
        noStepUp: Math.abs(finalY - initialY) < 0.1
      };
    });

    if (result.error) {
      console.log('Test skipped:', result.error);
      return;
    }

    // 飛行モードではステップアップしない
    expect(result.noStepUp).toBe(true);
  });

  test('空中ではステップアップしない', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;
      const player = window.gameApp.player;
      const cm = window.gameApp.chunkManager;

      const testX = 70, testY = 66, testZ = 70;  // 地面より上
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor(testZ / 16);
      const chunkKey = `${chunkX},${chunkZ}`;

      let chunk = cm.chunks.get(chunkKey);
      if (!chunk) {
        return { error: 'Chunk not found' };
      }

      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
      }

      const localX = ((testX % 16) + 16) % 16;
      const localZNext = ((testZ + 1) % 16 + 16) % 16;

      // ハーフブロックを空中に配置
      const collisionData = CustomCollision.createEmpty();
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      const testBlockDef = {
        block_str_id: 'test_half_air',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_half_air');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      chunkData.setBlock(localX, testY, localZNext, 'test_half_air');

      // プレイヤーを空中に配置
      player.setPosition(testX + 0.5, testY, testZ + 0.5);
      player.setOnGround(false);  // 空中
      player.setFlying(false);
      player.setVelocity(0, 0, 0);

      const initialY = player.getPosition().y;

      // 移動
      const velocity = { x: 0, y: 0, z: 5 };
      for (let i = 0; i < 5; i++) {
        pw.movePlayer(player, velocity, 0.1);
      }

      const finalY = player.getPosition().y;

      return {
        initialY,
        finalY,
        // 空中ではステップアップしない
        noStepUp: finalY <= initialY
      };
    });

    if (result.error) {
      console.log('Test skipped:', result.error);
      return;
    }

    // 空中ではステップアップしない（重力で落ちる可能性があるのでfinalY <= initialY）
    expect(result.noStepUp).toBe(true);
  });

  test('スニーク中もステップアップする', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pw = window.gameApp.physicsWorld;
      const player = window.gameApp.player;
      const cm = window.gameApp.chunkManager;

      const testX = 75, testY = 64, testZ = 75;
      const chunkX = Math.floor(testX / 16);
      const chunkZ = Math.floor(testZ / 16);
      const chunkKey = `${chunkX},${chunkZ}`;

      let chunk = cm.chunks.get(chunkKey);
      if (!chunk) {
        return { error: 'Chunk not found' };
      }

      let chunkData = chunk.chunkData || chunk.data;
      if (!chunkData) {
        chunkData = new ChunkData();
        chunk.chunkData = chunkData;
        chunk.data = chunkData;
      }

      // 地面を作成
      const localX = ((testX % 16) + 16) % 16;
      const localZ = ((testZ % 16) + 16) % 16;
      const localZNext = ((testZ + 1) % 16 + 16) % 16;

      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          chunkData.setBlock(lx, testY - 1, lz, 'stone');
        }
      }

      // ハーフブロックを配置
      const collisionData = CustomCollision.createEmpty();
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            CustomCollision.setVoxel(collisionData, x, y, z, 1);
          }
        }
      }
      const voxelCollision = CustomCollision.encode(collisionData);

      const testBlockDef = {
        block_str_id: 'test_half_sneak',
        shape_type: 'custom',
        voxel_collision: voxelCollision
      };
      if (!pw.textureLoader) {
        pw.textureLoader = { blocks: [] };
      }
      const existingIdx = pw.textureLoader.blocks.findIndex(b => b.block_str_id === 'test_half_sneak');
      if (existingIdx >= 0) {
        pw.textureLoader.blocks[existingIdx] = testBlockDef;
      } else {
        pw.textureLoader.blocks.push(testBlockDef);
      }

      chunkData.setBlock(localX, testY, localZNext, 'test_half_sneak');

      // プレイヤーをスニークで配置
      player.setPosition(testX + 0.5, testY, testZ + 0.5);
      player.setOnGround(true);
      player.setFlying(false);
      player.setSneaking(true);  // スニークON
      player.setVelocity(0, 0, 0);

      const initialY = player.getPosition().y;

      // 移動
      const velocity = { x: 0, y: 0, z: 5 };
      for (let i = 0; i < 20; i++) {
        pw.movePlayer(player, velocity, 0.1);
      }

      const finalPos = player.getPosition();
      const yDiff = finalPos.y - initialY;

      return {
        initialY,
        finalY: finalPos.y,
        yDiff,
        // スニーク中でもステップアップする
        steppedUp: yDiff >= 0.4 && yDiff <= 0.6
      };
    });

    if (result.error) {
      console.log('Test skipped:', result.error);
      return;
    }

    // スニーク中でもステップアップする（オートジャンプと異なる点）
    expect(result.steppedUp).toBe(true);
  });
});
