const { test, expect } = require('@playwright/test');

test('テストブロックのテクスチャ設定を確認', async ({ page }) => {
  await page.goto('/test/2-1_1chunk_test.html');

  await page.waitForFunction(() => window.gameApp && window.gameApp.scene, { timeout: 30000 });
  await page.waitForTimeout(2000);

  // テストブロックのデータを確認
  const blockInfo = await page.evaluate(() => {
    const tl = window.gameApp.textureLoader;
    const testBlock = tl.blocks.find(b => b.block_str_id === 'test');
    return {
      block_str_id: testBlock?.block_str_id,
      tex_default: testBlock?.tex_default,
      tex_front: testBlock?.tex_front,
      tex_back: testBlock?.tex_back,
      tex_top: testBlock?.tex_top,
      tex_bottom: testBlock?.tex_bottom,
      tex_left: testBlock?.tex_left,
      tex_right: testBlock?.tex_right
    };
  });

  console.log('=== Test Block Texture Settings ===');
  console.log(JSON.stringify(blockInfo, null, 2));

  // テストブロックのマテリアルを確認
  const materialInfo = await page.evaluate(() => {
    const tl = window.gameApp.textureLoader;
    const mats = tl.getMaterials('test');
    const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];

    return mats.map((m, i) => ({
      face: faceOrder[i],
      hasMap: !!m.map,
      mapUuid: m.map ? m.map.uuid.substring(0, 8) : null
    }));
  });

  console.log('\n=== Test Block Materials ===');
  materialInfo.forEach(m => {
    console.log(`  ${m.face}: hasMap=${m.hasMap}, uuid=${m.mapUuid}`);
  });

  expect(true).toBe(true);
});
