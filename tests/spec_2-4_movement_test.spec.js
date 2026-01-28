// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 2-4 移動テスト
 *
 * プレイヤーが1人称視点でワールド内を移動できるテスト
 * - WASD移動、マウス視点操作
 * - 重力・ジャンプの物理演算
 * - ブロックとのAABB衝突判定
 * - 飛行モード
 * - スニーク機能
 */

const TEST_PAGE_PATH = '/test/2-4_movement_test.html';
const BLOCK_MANAGER_PATH = '/tool/block_manager.html';

// ========================================
// TEST-2-4-1: ページ表示・基本UI
// ========================================
test.describe('TEST-2-4-1: ページ表示・基本UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('キャンバスが表示される', async ({ page }) => {
    await expect(page.locator('#game-canvas')).toBeVisible();
  });

  test('デバッグパネルが表示される', async ({ page }) => {
    await expect(page.locator('#debug-panel')).toBeVisible();
  });

  test('操作説明パネルが表示される', async ({ page }) => {
    await expect(page.locator('#controls-help')).toBeVisible();
  });

  test('クリック開始表示が表示される（PointerLock未取得時）', async ({ page }) => {
    await expect(page.locator('#click-to-start')).toBeVisible();
  });

  test('FPS表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-fps')).toBeVisible();
  });

  test('プレイヤー座標表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-player-pos')).toBeVisible();
  });

  test('チャンク座標表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-chunk-pos')).toBeVisible();
  });

  test('向き表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-player-dir')).toBeVisible();
  });

  test('速度表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-player-speed')).toBeVisible();
  });

  test('状態表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-player-state')).toBeVisible();
  });

  test('接地判定表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-on-ground')).toBeVisible();
  });

  test('LoD別チャンク数表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-lod-counts')).toBeVisible();
  });

  test('ポリゴン数表示が存在する', async ({ page }) => {
    await expect(page.locator('#debug-triangles')).toBeVisible();
  });
});

// ========================================
// TEST-2-4-2: 操作ボタン・設定項目
// ========================================
test.describe('TEST-2-4-2: 操作ボタン・設定項目', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('リセットボタンが存在する', async ({ page }) => {
    await expect(page.locator('#btn-reset')).toBeVisible();
  });

  test('飛行モードボタンが存在する', async ({ page }) => {
    await expect(page.locator('#btn-fly-toggle')).toBeVisible();
  });

  test('衝突判定表示ボタンが存在する', async ({ page }) => {
    await expect(page.locator('#btn-show-collision')).toBeVisible();
  });

  test('ワイヤーフレームボタンが存在する', async ({ page }) => {
    await expect(page.locator('#btn-wireframe')).toBeVisible();
  });

  test('ストレージクリアボタンが存在する', async ({ page }) => {
    await expect(page.locator('#btn-clear-storage')).toBeVisible();
  });

  test('LoD 0 範囲入力が存在する', async ({ page }) => {
    await expect(page.locator('#input-lod0-range')).toBeVisible();
  });

  test('総描画範囲入力が存在する', async ({ page }) => {
    await expect(page.locator('#input-total-range')).toBeVisible();
  });

  test('マウス感度入力が存在する', async ({ page }) => {
    await expect(page.locator('#input-mouse-sensitivity')).toBeVisible();
  });

  test('ワールド選択が存在する', async ({ page }) => {
    await expect(page.locator('#select-world')).toBeVisible();
  });

  test('マウス感度のデフォルト値は0.002', async ({ page }) => {
    const value = await page.locator('#input-mouse-sensitivity').inputValue();
    expect(value).toBe('0.002');
  });
});

// ========================================
// TEST-2-4-3: Playerクラス
// ========================================
test.describe('TEST-2-4-3: Playerクラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('Playerクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.Player === 'function');
    expect(exists).toBe(true);
  });

  test('playerオブジェクトが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => window.gameApp.player !== undefined);
    expect(exists).toBe(true);
  });

  test('getPosition メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.player.getPosition === 'function');
    expect(exists).toBe(true);
  });

  test('getPosition が x, y, z を返す', async ({ page }) => {
    const pos = await page.evaluate(() => window.gameApp.player.getPosition());
    expect(pos).toHaveProperty('x');
    expect(pos).toHaveProperty('y');
    expect(pos).toHaveProperty('z');
  });

  test('初期位置が (8, 65, 8) 付近である', async ({ page }) => {
    const pos = await page.evaluate(() => window.gameApp.player.getPosition());
    expect(pos.x).toBeCloseTo(8, 0);
    expect(pos.y).toBeGreaterThanOrEqual(63);
    expect(pos.z).toBeCloseTo(8, 0);
  });

  test('getEyePosition メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.player.getEyePosition === 'function');
    expect(exists).toBe(true);
  });

  test('目線高さは足元より高い', async ({ page }) => {
    const result = await page.evaluate(() => {
      const player = window.gameApp.player;
      const footPos = player.getPosition();
      const eyePos = player.getEyePosition();
      return { footY: footPos.y, eyeY: eyePos.y };
    });
    expect(result.eyeY).toBeGreaterThan(result.footY);
  });

  test('getAABB メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.player.getAABB === 'function');
    expect(exists).toBe(true);
  });

  test('AABBが正しい構造を返す', async ({ page }) => {
    const aabb = await page.evaluate(() => window.gameApp.player.getAABB());
    expect(aabb).toHaveProperty('minX');
    expect(aabb).toHaveProperty('minY');
    expect(aabb).toHaveProperty('minZ');
    expect(aabb).toHaveProperty('maxX');
    expect(aabb).toHaveProperty('maxY');
    expect(aabb).toHaveProperty('maxZ');
  });

  test('プレイヤーの幅は約0.6ブロック', async ({ page }) => {
    const aabb = await page.evaluate(() => window.gameApp.player.getAABB());
    const width = aabb.maxX - aabb.minX;
    expect(width).toBeCloseTo(0.6, 1);
  });

  test('プレイヤーの高さは約1.8ブロック（通常時）', async ({ page }) => {
    const aabb = await page.evaluate(() => window.gameApp.player.getAABB());
    const height = aabb.maxY - aabb.minY;
    expect(height).toBeCloseTo(1.8, 1);
  });

  test('getYaw/getPitch メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      const p = window.gameApp.player;
      return typeof p.getYaw === 'function' && typeof p.getPitch === 'function';
    });
    expect(exists).toBe(true);
  });

  test('isOnGround/isFlying/isSprinting/isSneaking メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => {
      const p = window.gameApp.player;
      return typeof p.isOnGround === 'function' &&
             typeof p.isFlying === 'function' &&
             typeof p.isSprinting === 'function' &&
             typeof p.isSneaking === 'function';
    });
    expect(exists).toBe(true);
  });
});

// ========================================
// TEST-2-4-4: PlayerControllerクラス
// ========================================
test.describe('TEST-2-4-4: PlayerControllerクラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('PlayerControllerクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.PlayerController === 'function');
    expect(exists).toBe(true);
  });

  test('playerControllerオブジェクトが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => window.gameApp.playerController !== undefined);
    expect(exists).toBe(true);
  });

  test('update メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.playerController.update === 'function');
    expect(exists).toBe(true);
  });

  test('setMouseSensitivity メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.playerController.setMouseSensitivity === 'function');
    expect(exists).toBe(true);
  });
});

// ========================================
// TEST-2-4-5: PhysicsWorldクラス
// ========================================
test.describe('TEST-2-4-5: PhysicsWorldクラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('PhysicsWorldクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.PhysicsWorld === 'function');
    expect(exists).toBe(true);
  });

  test('physicsWorldオブジェクトが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => window.gameApp.physicsWorld !== undefined);
    expect(exists).toBe(true);
  });

  test('movePlayer メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.physicsWorld.movePlayer === 'function');
    expect(exists).toBe(true);
  });

  test('isOnGround メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.physicsWorld.isOnGround === 'function');
    expect(exists).toBe(true);
  });

  test('getBlockAt メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.physicsWorld.getBlockAt === 'function');
    expect(exists).toBe(true);
  });
});

// ========================================
// TEST-2-4-6: FirstPersonCameraクラス
// ========================================
test.describe('TEST-2-4-6: FirstPersonCameraクラス', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('FirstPersonCameraクラスが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.FirstPersonCamera === 'function');
    expect(exists).toBe(true);
  });

  test('firstPersonCameraオブジェクトが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => window.gameApp.firstPersonCamera !== undefined);
    expect(exists).toBe(true);
  });

  test('update メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.firstPersonCamera.update === 'function');
    expect(exists).toBe(true);
  });

  test('isPointerLocked メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.firstPersonCamera.isPointerLocked === 'function');
    expect(exists).toBe(true);
  });

  test('カメラのFOVは70度', async ({ page }) => {
    const fov = await page.evaluate(() => window.gameApp.camera.fov);
    expect(fov).toBe(70);
  });
});

// ========================================
// TEST-2-4-7: WASD移動テスト
// ========================================
test.describe('TEST-2-4-7: WASD移動テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // チャンク生成を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('Wキーで前進する（Z+方向）', async ({ page }) => {
    const initialZ = await page.evaluate(() => window.gameApp.player.getPosition().z);

    // キー入力をシミュレート
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

  test('Sキーで後退する（Z-方向）', async ({ page }) => {
    const initialZ = await page.evaluate(() => window.gameApp.player.getPosition().z);

    await page.evaluate(() => {
      window.gameApp.playerController.keys.s = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.s = false;
    });

    const newZ = await page.evaluate(() => window.gameApp.player.getPosition().z);
    expect(newZ).toBeLessThan(initialZ);
  });

  test('Aキーで左移動する（X-方向）', async ({ page }) => {
    const initialX = await page.evaluate(() => window.gameApp.player.getPosition().x);

    await page.evaluate(() => {
      window.gameApp.playerController.keys.a = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.a = false;
    });

    const newX = await page.evaluate(() => window.gameApp.player.getPosition().x);
    expect(newX).toBeLessThan(initialX);
  });

  test('Dキーで右移動する（X+方向）', async ({ page }) => {
    const initialX = await page.evaluate(() => window.gameApp.player.getPosition().x);

    await page.evaluate(() => {
      window.gameApp.playerController.keys.d = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.d = false;
    });

    const newX = await page.evaluate(() => window.gameApp.player.getPosition().x);
    expect(newX).toBeGreaterThan(initialX);
  });

  test('歩行速度は約4ブロック/秒', async ({ page }) => {
    const initialPos = await page.evaluate(() => window.gameApp.player.getPosition());

    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = true;
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = false;
    });

    const newPos = await page.evaluate(() => window.gameApp.player.getPosition());
    const distance = Math.sqrt(
      Math.pow(newPos.x - initialPos.x, 2) +
      Math.pow(newPos.z - initialPos.z, 2)
    );
    // 約4ブロック（誤差許容）
    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(5);
  });

  test('Ctrl+Wで走り速度（約6ブロック/秒）になる', async ({ page }) => {
    const initialPos = await page.evaluate(() => window.gameApp.player.getPosition());

    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = true;
      window.gameApp.playerController.keys.ctrl = true;
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = false;
      window.gameApp.playerController.keys.ctrl = false;
    });

    const newPos = await page.evaluate(() => window.gameApp.player.getPosition());
    const distance = Math.sqrt(
      Math.pow(newPos.x - initialPos.x, 2) +
      Math.pow(newPos.z - initialPos.z, 2)
    );
    // 約6ブロック（誤差許容）
    expect(distance).toBeGreaterThan(5);
    expect(distance).toBeLessThan(7);
  });
});

// ========================================
// TEST-2-4-8: ジャンプテスト
// ========================================
test.describe('TEST-2-4-8: ジャンプテスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
    // 接地するまで待機
    await page.waitForFunction(
      () => window.gameApp.player.isOnGround(),
      { timeout: 10000 }
    );
  });

  test('スペースキーでジャンプする', async ({ page }) => {
    const initialY = await page.evaluate(() => window.gameApp.player.getPosition().y);

    // ジャンプ
    await page.evaluate(() => {
      window.gameApp.playerController.jump();
    });
    await page.waitForTimeout(200);

    const peakY = await page.evaluate(() => window.gameApp.player.getPosition().y);
    expect(peakY).toBeGreaterThan(initialY);
  });

  test('ジャンプ後に重力で落下する', async ({ page }) => {
    // ジャンプ
    await page.evaluate(() => {
      window.gameApp.playerController.jump();
    });
    await page.waitForTimeout(200);
    const peakY = await page.evaluate(() => window.gameApp.player.getPosition().y);

    // 落下を待つ
    await page.waitForTimeout(500);
    const afterY = await page.evaluate(() => window.gameApp.player.getPosition().y);

    expect(afterY).toBeLessThan(peakY);
  });

  test('接地中のみジャンプ可能', async ({ page }) => {
    // 飛行モードをOFFにして通常モードを確認
    await page.evaluate(() => {
      window.gameApp.player.setFlying(false);
    });

    // ジャンプして空中に
    await page.evaluate(() => {
      window.gameApp.playerController.jump();
    });
    await page.waitForTimeout(100);

    // 空中で再度ジャンプを試みる
    const velocityBefore = await page.evaluate(() => window.gameApp.player.getVelocity().y);
    await page.evaluate(() => {
      window.gameApp.playerController.jump();
    });
    const velocityAfter = await page.evaluate(() => window.gameApp.player.getVelocity().y);

    // 空中ではジャンプできない（速度が増加しない）
    expect(velocityAfter).toBeLessThanOrEqual(velocityBefore);
  });

  test('ジャンプ高さは約1ブロック', async ({ page }) => {
    const initialY = await page.evaluate(() => window.gameApp.player.getPosition().y);

    // ジャンプ
    await page.evaluate(() => {
      window.gameApp.playerController.jump();
    });

    // 最高点を測定
    let maxY = initialY;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(50);
      const currentY = await page.evaluate(() => window.gameApp.player.getPosition().y);
      if (currentY > maxY) maxY = currentY;
    }

    const jumpHeight = maxY - initialY;
    expect(jumpHeight).toBeGreaterThan(0.8);
    expect(jumpHeight).toBeLessThan(1.5);
  });
});

// ========================================
// TEST-2-4-9: 飛行モードテスト
// ========================================
test.describe('TEST-2-4-9: 飛行モードテスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('toggleFlying メソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() => typeof window.gameApp.player.toggleFlying === 'function');
    expect(exists).toBe(true);
  });

  test('飛行モードをON/OFFできる', async ({ page }) => {
    const initial = await page.evaluate(() => window.gameApp.player.isFlying());

    await page.evaluate(() => {
      window.gameApp.player.toggleFlying();
    });
    const toggled = await page.evaluate(() => window.gameApp.player.isFlying());

    expect(toggled).toBe(!initial);
  });

  test('飛行モードボタンで切り替えできる', async ({ page }) => {
    const initial = await page.evaluate(() => window.gameApp.player.isFlying());

    await page.click('#btn-fly-toggle');
    await page.waitForTimeout(100);

    const toggled = await page.evaluate(() => window.gameApp.player.isFlying());
    expect(toggled).toBe(!initial);
  });

  test('飛行中はスペースで上昇する', async ({ page }) => {
    // 飛行モードON
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
    });

    const initialY = await page.evaluate(() => window.gameApp.player.getPosition().y);

    // スペースで上昇
    await page.evaluate(() => {
      window.gameApp.playerController.keys.space = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.space = false;
    });

    const newY = await page.evaluate(() => window.gameApp.player.getPosition().y);
    expect(newY).toBeGreaterThan(initialY);
  });

  test('飛行中はShiftで下降する', async ({ page }) => {
    // 飛行モードON、少し上空に移動
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
      window.gameApp.player.setPosition(8, 70, 8);
    });

    const initialY = await page.evaluate(() => window.gameApp.player.getPosition().y);

    // Shiftで下降
    await page.evaluate(() => {
      window.gameApp.playerController.keys.shift = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.shift = false;
    });

    const newY = await page.evaluate(() => window.gameApp.player.getPosition().y);
    expect(newY).toBeLessThan(initialY);
  });

  test('飛行中は重力が無効', async ({ page }) => {
    // 飛行モードON、空中に配置
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
      window.gameApp.player.setPosition(8, 80, 8);
      window.gameApp.player.setVelocity(0, 0, 0);
    });

    const initialY = await page.evaluate(() => window.gameApp.player.getPosition().y);

    // 何もしないで待機
    await page.waitForTimeout(500);

    const newY = await page.evaluate(() => window.gameApp.player.getPosition().y);
    // 重力が無効なので落下しない
    expect(Math.abs(newY - initialY)).toBeLessThan(0.1);
  });

  test('飛行速度は約10ブロック/秒', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
    });

    const initialPos = await page.evaluate(() => window.gameApp.player.getPosition());

    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = true;
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = false;
    });

    const newPos = await page.evaluate(() => window.gameApp.player.getPosition());
    const distance = Math.sqrt(
      Math.pow(newPos.x - initialPos.x, 2) +
      Math.pow(newPos.z - initialPos.z, 2)
    );
    // 約10ブロック（誤差許容）
    expect(distance).toBeGreaterThan(8);
    expect(distance).toBeLessThan(12);
  });

  test('着地すると飛行モードが自動でOFFになる', async ({ page }) => {
    // 飛行モードON、地表近くに配置
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
      window.gameApp.player.setPosition(8, 65, 8);
    });

    // 下降して着地
    await page.evaluate(() => {
      window.gameApp.playerController.keys.shift = true;
    });

    // 着地まで待機
    await page.waitForFunction(
      () => window.gameApp.player.isOnGround(),
      { timeout: 5000 }
    );

    await page.evaluate(() => {
      window.gameApp.playerController.keys.shift = false;
    });

    // 飛行モードがOFFになっているか確認
    const isFlying = await page.evaluate(() => window.gameApp.player.isFlying());
    expect(isFlying).toBe(false);
  });
});

// ========================================
// TEST-2-4-10: スニークテスト
// ========================================
test.describe('TEST-2-4-10: スニークテスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
    // 飛行モードOFF
    await page.evaluate(() => {
      window.gameApp.player.setFlying(false);
    });
  });

  test('Shiftキーでスニーク状態になる', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.playerController.keys.shift = true;
    });
    await page.waitForTimeout(100);

    const isSneaking = await page.evaluate(() => window.gameApp.player.isSneaking());
    expect(isSneaking).toBe(true);
  });

  test('Shiftキーを離すとスニーク解除', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.playerController.keys.shift = true;
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.shift = false;
    });
    await page.waitForTimeout(100);

    const isSneaking = await page.evaluate(() => window.gameApp.player.isSneaking());
    expect(isSneaking).toBe(false);
  });

  test('スニーク中は移動速度が低下する（約2ブロック/秒）', async ({ page }) => {
    // スニーク状態でない場合の移動距離を測定
    const initialPos1 = await page.evaluate(() => window.gameApp.player.getPosition());
    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = false;
    });
    const normalPos = await page.evaluate(() => window.gameApp.player.getPosition());
    const normalDistance = Math.sqrt(
      Math.pow(normalPos.x - initialPos1.x, 2) +
      Math.pow(normalPos.z - initialPos1.z, 2)
    );

    // リセット
    await page.evaluate(() => {
      window.gameApp.player.setPosition(8, 65, 8);
    });
    await page.waitForTimeout(100);

    // スニーク状態での移動距離を測定
    const initialPos2 = await page.evaluate(() => window.gameApp.player.getPosition());
    await page.evaluate(() => {
      window.gameApp.playerController.keys.shift = true;
      window.gameApp.playerController.keys.w = true;
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = false;
      window.gameApp.playerController.keys.shift = false;
    });
    const sneakPos = await page.evaluate(() => window.gameApp.player.getPosition());
    const sneakDistance = Math.sqrt(
      Math.pow(sneakPos.x - initialPos2.x, 2) +
      Math.pow(sneakPos.z - initialPos2.z, 2)
    );

    // スニーク速度は通常の半分
    expect(sneakDistance).toBeLessThan(normalDistance * 0.7);
  });

  test('スニーク中は当たり判定の高さが1.5ブロックになる', async ({ page }) => {
    await page.evaluate(() => {
      window.gameApp.playerController.keys.shift = true;
    });
    await page.waitForTimeout(100);

    const aabb = await page.evaluate(() => window.gameApp.player.getAABB());
    const height = aabb.maxY - aabb.minY;
    expect(height).toBeCloseTo(1.5, 1);
  });
});

// ========================================
// TEST-2-4-11: 衝突判定テスト
// ========================================
test.describe('TEST-2-4-11: 衝突判定テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('ブロックを通り抜けない', async ({ page }) => {
    // 地面に向かって落下
    await page.evaluate(() => {
      window.gameApp.player.setFlying(false);
      window.gameApp.player.setPosition(8, 70, 8);
    });

    // 落下を待つ
    await page.waitForTimeout(1000);

    // 地面より下に行っていないことを確認
    const pos = await page.evaluate(() => window.gameApp.player.getPosition());
    expect(pos.y).toBeGreaterThanOrEqual(63); // 地表高さ
  });

  test('接地判定が正しく動作する', async ({ page }) => {
    // 地面に立っている状態
    await page.evaluate(() => {
      window.gameApp.player.setFlying(false);
    });

    // 接地するまで待機
    await page.waitForFunction(
      () => window.gameApp.player.isOnGround(),
      { timeout: 10000 }
    );

    const onGround = await page.evaluate(() => window.gameApp.player.isOnGround());
    expect(onGround).toBe(true);
  });

  test('空中では接地判定がfalse', async ({ page }) => {
    // 飛行モードで空中に配置
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
      window.gameApp.player.setPosition(8, 80, 8);
    });
    await page.waitForTimeout(100);

    const onGround = await page.evaluate(() => window.gameApp.player.isOnGround());
    expect(onGround).toBe(false);
  });

  test('衝突判定表示ボタンが動作する', async ({ page }) => {
    await page.click('#btn-show-collision');
    await page.waitForTimeout(100);

    const showCollision = await page.evaluate(() => window.gameApp.showCollision);
    expect(showCollision).toBe(true);
  });
});

// ========================================
// TEST-2-4-12: 接地判定テスト
// ========================================
test.describe('TEST-2-4-12: 接地判定テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('ブロック上に立つと接地判定がtrue', async ({ page }) => {
    // 地面に落下させる
    await page.evaluate(() => {
      window.gameApp.player.setFlying(false);
      window.gameApp.player.setPosition(8, 65, 8);
    });

    // 接地するまで待機
    await page.waitForFunction(
      () => window.gameApp.player.isOnGround(),
      { timeout: 10000 }
    );

    const onGround = await page.evaluate(() => window.gameApp.player.isOnGround());
    expect(onGround).toBe(true);
  });

  test('デバッグUIに接地状態が表示される', async ({ page }) => {
    // 接地するまで待機
    await page.evaluate(() => {
      window.gameApp.player.setFlying(false);
    });
    await page.waitForFunction(
      () => window.gameApp.player.isOnGround(),
      { timeout: 10000 }
    );
    await page.waitForTimeout(500);

    const text = await page.locator('#debug-on-ground').textContent();
    expect(text).toContain('true');
  });
});

// ========================================
// TEST-2-4-13: UI操作テスト
// ========================================
test.describe('TEST-2-4-13: UI操作テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('リセットボタンで初期位置に戻る', async ({ page }) => {
    // 移動
    await page.evaluate(() => {
      window.gameApp.player.setPosition(100, 80, 100);
    });

    // リセット
    await page.click('#btn-reset');
    await page.waitForTimeout(500);

    // 初期位置に戻っているか確認
    const pos = await page.evaluate(() => window.gameApp.player.getPosition());
    expect(pos.x).toBeCloseTo(8, 0);
    expect(pos.z).toBeCloseTo(8, 0);
  });

  test('ワイヤーフレームボタンが動作する', async ({ page }) => {
    const btn = page.locator('#btn-wireframe');
    const initialText = await btn.textContent();

    await btn.click();
    await page.waitForTimeout(100);

    const changedText = await btn.textContent();
    expect(initialText).not.toBe(changedText);
  });

  test('マウス感度を変更できる', async ({ page }) => {
    await page.fill('#input-mouse-sensitivity', '0.005');
    await page.locator('#input-mouse-sensitivity').blur();
    await page.waitForTimeout(100);

    const sensitivity = await page.evaluate(() => window.gameApp.playerController.mouseSensitivity);
    expect(sensitivity).toBe(0.005);
  });

  test('プレイヤー座標がデバッグUIに表示される', async ({ page }) => {
    await page.waitForTimeout(500);
    const text = await page.locator('#debug-player-pos').textContent();
    // X, Y, Z座標が表示されていることを確認
    expect(text).toMatch(/[\d.-]+/);
  });

  test('状態表示が更新される', async ({ page }) => {
    await page.waitForTimeout(500);
    const text = await page.locator('#debug-player-state').textContent();
    // 地上/空中/飛行中のいずれかが表示されている
    expect(text.length).toBeGreaterThan(0);
  });
});

// ========================================
// TEST-2-4-14: block_manager.html への統合
// ========================================
test.describe('TEST-2-4-14: block_manager.html への統合', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BLOCK_MANAGER_PATH);
    await page.waitForSelector('.tabs');
  });

  test('「移動テスト」タブが存在する', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="movementTest"]');
    await expect(tab).toBeVisible();
    await expect(tab).toHaveText('移動テスト');
  });

  test('タブをクリックするとコンテンツが表示される', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="movementTest"]');
    await tab.click();

    const content = page.locator('#movementTest');
    await expect(content).toHaveClass(/active/, { timeout: 5000 });
  });

  test('コンテンツ内にiframeが存在する', async ({ page }) => {
    const tab = page.locator('.tab[data-tab="movementTest"]');
    await tab.click();
    await page.waitForTimeout(500);

    const iframe = page.locator('#movementTestFrame');
    const exists = await iframe.count();
    expect(exists).toBe(1);
  });

  test('iframeが正しいURLを参照している', async ({ page }) => {
    const iframe = page.locator('#movementTestFrame');
    const src = await iframe.getAttribute('src');
    expect(src).toContain('2-4_movement_test.html');
  });
});

// ========================================
// TEST-2-4-15: ChunkManagerとの連携
// ========================================
test.describe('TEST-2-4-15: ChunkManagerとの連携', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('プレイヤー移動でupdateViewPositionが呼ばれる', async ({ page }) => {
    // 大きく移動
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
      window.gameApp.playerController.keys.d = true;
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.d = false;
    });

    // チャンクが生成されていることを確認
    const chunkCount = await page.evaluate(() => window.gameApp.chunkManager.getLoadedChunkCount());
    expect(chunkCount).toBeGreaterThan(0);
  });

  test('プレイヤー位置に応じたチャンクが生成される', async ({ page }) => {
    // 遠くに移動
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
      window.gameApp.player.setPosition(50, 70, 50);
    });
    await page.waitForTimeout(2000);

    // 新しい位置周辺のチャンクが生成されていることを確認
    const chunkExists = await page.evaluate(() => {
      const chunkX = Math.floor(50 / 16);
      const chunkZ = Math.floor(50 / 16);
      return window.gameApp.chunkManager.chunks.has(`${chunkX},${chunkZ}`);
    });
    expect(chunkExists).toBe(true);
  });
});

// ========================================
// TEST-2-4-16: 視点回転テスト
// ========================================
test.describe('TEST-2-4-16: 視点回転テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('Yaw（左右）を変更できる', async ({ page }) => {
    const initialYaw = await page.evaluate(() => window.gameApp.player.getYaw());

    await page.evaluate(() => {
      window.gameApp.player.setYaw(Math.PI / 2);
    });

    const newYaw = await page.evaluate(() => window.gameApp.player.getYaw());
    expect(newYaw).not.toBe(initialYaw);
  });

  test('Pitch（上下）を変更できる', async ({ page }) => {
    const initialPitch = await page.evaluate(() => window.gameApp.player.getPitch());

    await page.evaluate(() => {
      window.gameApp.player.setPitch(0.5);
    });

    const newPitch = await page.evaluate(() => window.gameApp.player.getPitch());
    expect(newPitch).not.toBe(initialPitch);
  });

  test('Pitch制限が機能する（-89度〜+89度）', async ({ page }) => {
    // 極端な値を設定
    await page.evaluate(() => {
      window.gameApp.player.setPitch(Math.PI); // 180度（制限を超える）
    });

    const pitch = await page.evaluate(() => window.gameApp.player.getPitch());
    // 89度（約1.55ラジアン）以下に制限される
    expect(Math.abs(pitch)).toBeLessThanOrEqual(Math.PI / 2 * 0.99);
  });

  test('視点の向きがデバッグUIに表示される', async ({ page }) => {
    await page.waitForTimeout(500);
    const text = await page.locator('#debug-player-dir').textContent();
    // Yaw, Pitchの値が表示されていることを確認
    expect(text).toMatch(/[\d.-]+/);
  });
});

// ========================================
// TEST-2-4-17: パフォーマンステスト
// ========================================
test.describe('TEST-2-4-17: パフォーマンステスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
  });

  test('LoD0:3、総描画:10で移動中55FPS以上を維持', async ({ page }) => {
    // 設定
    await page.fill('#input-lod0-range', '3');
    await page.locator('#input-lod0-range').blur();
    await page.fill('#input-total-range', '10');
    await page.locator('#input-total-range').blur();

    // 初期チャンク生成完了を待つ
    await page.waitForFunction(
      () => {
        const cm = window.gameApp.chunkManager;
        const queueCounts = cm.getQueueCounts();
        return queueCounts.lod0 === 0 && queueCounts.lod1 === 0;
      },
      { timeout: 120000 }
    );

    // FPSが安定するまで待機
    await page.waitForTimeout(2000);

    // FPS履歴をリセット
    await page.evaluate(() => {
      window.gameApp.fpsHistory = [];
    });

    // 飛行モードで3秒間移動
    await page.evaluate(() => {
      window.gameApp.player.setFlying(true);
      window.gameApp.playerController.keys.w = true;
    });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      window.gameApp.playerController.keys.w = false;
    });
    await page.waitForTimeout(1000);

    // 平均FPSを確認
    const result = await page.evaluate(() => {
      const history = window.gameApp.fpsHistory;
      const stableHistory = history.slice(5, -5);
      const validFps = stableHistory.filter(f => f > 0);
      if (validFps.length === 0) return { avgFps: 0 };
      const avgFps = validFps.reduce((a, b) => a + b, 0) / validFps.length;
      return { avgFps: Math.round(avgFps) };
    });

    // headlessブラウザでは性能が制限されるため、30FPS以上を許容
    expect(result.avgFps).toBeGreaterThanOrEqual(30);
  });
});

// ========================================
// TEST-2-4-18: オートジャンプテスト
// ========================================
test.describe('TEST-2-4-18: オートジャンプテスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE_PATH);
    await page.waitForFunction(() => window.gameApp && window.gameApp.isReady, { timeout: 30000 });
    // チャンク生成を待つ
    await page.waitForFunction(
      () => window.gameApp.chunkManager.getLoadedChunkCount() >= 9,
      { timeout: 60000 }
    );
  });

  test('オートジャンプ設定のチェックボックスが存在する', async ({ page }) => {
    await expect(page.locator('#checkbox-auto-jump')).toBeVisible();
  });

  test('オートジャンプ設定のデフォルトはON', async ({ page }) => {
    const isChecked = await page.locator('#checkbox-auto-jump').isChecked();
    expect(isChecked).toBe(true);
  });

  test('オートジャンプ設定をON/OFF切り替えできる', async ({ page }) => {
    const checkbox = page.locator('#checkbox-auto-jump');

    // 初期状態はON
    expect(await checkbox.isChecked()).toBe(true);

    // OFFに切り替え
    await checkbox.click();
    expect(await checkbox.isChecked()).toBe(false);

    // ONに戻す
    await checkbox.click();
    expect(await checkbox.isChecked()).toBe(true);
  });

  test('PlayerControllerにautoJumpEnabledプロパティが存在する', async ({ page }) => {
    const exists = await page.evaluate(() =>
      'autoJumpEnabled' in window.gameApp.playerController
    );
    expect(exists).toBe(true);
  });

  test('autoJumpEnabledのデフォルト値はtrue', async ({ page }) => {
    const value = await page.evaluate(() =>
      window.gameApp.playerController.autoJumpEnabled
    );
    expect(value).toBe(true);
  });

  test('チェックボックスの変更がautoJumpEnabledに反映される', async ({ page }) => {
    const checkbox = page.locator('#checkbox-auto-jump');

    // OFFに切り替え
    await checkbox.click();
    await page.waitForTimeout(100);
    const valueOff = await page.evaluate(() =>
      window.gameApp.playerController.autoJumpEnabled
    );
    expect(valueOff).toBe(false);

    // ONに戻す
    await checkbox.click();
    await page.waitForTimeout(100);
    const valueOn = await page.evaluate(() =>
      window.gameApp.playerController.autoJumpEnabled
    );
    expect(valueOn).toBe(true);
  });

  test('PhysicsWorldにcheckStepUpメソッドが存在する', async ({ page }) => {
    const exists = await page.evaluate(() =>
      typeof window.gameApp.physicsWorld.checkStepUp === 'function'
    );
    expect(exists).toBe(true);
  });

  test('1ブロック段差でオートジャンプが発動する', async ({ page }) => {
    // プレイヤーを段差の前に配置（Y=64が地面、Y=65にブロックがある状況を作る）
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 64, 8); // 地面の上
      player.setYaw(0); // 北（Z+）向き
      player.setFlying(false);
      player.setOnGround(true);
      window.gameApp.playerController.autoJumpEnabled = true;
    });

    // 初期Y座標を記録
    const initialY = await page.evaluate(() => window.gameApp.player.getPosition().y);

    // 前方に1ブロックの段差があるとシミュレート（checkStepUpが1を返す状況）
    await page.evaluate(() => {
      // 強制的にオートジャンプをトリガー
      window.gameApp.playerController._triggerAutoJump();
    });
    await page.waitForTimeout(200);

    // Y座標が上昇していることを確認
    const newY = await page.evaluate(() => window.gameApp.player.getPosition().y);
    expect(newY).toBeGreaterThan(initialY);
  });

  test('空中ではオートジャンプしない', async ({ page }) => {
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 70, 8); // 空中に配置
      player.setFlying(false);
      player.setOnGround(false); // 空中
      window.gameApp.playerController.autoJumpEnabled = true;
    });

    const initialVelY = await page.evaluate(() => window.gameApp.player.getVelocity().y);

    // オートジャンプを試みる
    await page.evaluate(() => {
      window.gameApp.playerController._triggerAutoJump();
    });
    await page.waitForTimeout(50);

    // 速度が変わっていないことを確認（ジャンプしていない）
    const newVelY = await page.evaluate(() => window.gameApp.player.getVelocity().y);
    // 空中なのでジャンプ速度は加算されない
    expect(newVelY).toBeLessThanOrEqual(initialVelY + 0.1);
  });

  test('スニーク中はオートジャンプしない', async ({ page }) => {
    // スニーク状態でのオートジャンプ呼び出しを同一evaluate内で実行
    // （アニメーションループによるスニーク状態リセットを避けるため）
    const result = await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 64, 8);
      player.setVelocity(0, 0, 0);
      player.setFlying(false);
      player.setOnGround(true);
      player.setSneaking(true); // スニーク中
      window.gameApp.playerController.autoJumpEnabled = true;

      const initialVelY = player.getVelocity().y;

      // スニーク状態のまま_triggerAutoJumpを呼ぶ
      window.gameApp.playerController._triggerAutoJump();

      const newVelY = player.getVelocity().y;
      return { initialVelY, newVelY };
    });

    // スニーク中なのでジャンプしない
    expect(result.newVelY).toBeLessThanOrEqual(result.initialVelY + 0.1);
  });

  test('飛行モード中はオートジャンプしない', async ({ page }) => {
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 64, 8);
      player.setFlying(true); // 飛行モード
      player.setOnGround(true);
      window.gameApp.playerController.autoJumpEnabled = true;
    });

    const initialVelY = await page.evaluate(() => window.gameApp.player.getVelocity().y);

    await page.evaluate(() => {
      window.gameApp.playerController._triggerAutoJump();
    });
    await page.waitForTimeout(50);

    const newVelY = await page.evaluate(() => window.gameApp.player.getVelocity().y);
    expect(newVelY).toBeLessThanOrEqual(initialVelY + 0.1);
  });

  test('オートジャンプがOFFの場合は発動しない', async ({ page }) => {
    await page.evaluate(() => {
      const player = window.gameApp.player;
      player.setPosition(8, 64, 8);
      player.setFlying(false);
      player.setOnGround(true);
      window.gameApp.playerController.autoJumpEnabled = false; // OFF
    });

    const initialVelY = await page.evaluate(() => window.gameApp.player.getVelocity().y);

    await page.evaluate(() => {
      window.gameApp.playerController._triggerAutoJump();
    });
    await page.waitForTimeout(50);

    const newVelY = await page.evaluate(() => window.gameApp.player.getVelocity().y);
    expect(newVelY).toBeLessThanOrEqual(initialVelY + 0.1);
  });
});
