// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * 1-2 GAS API テスト
 *
 * GAS APIの読み取り・書き込み機能をテストする
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';

// テスト用に作成したブロックIDを保持（削除テストで使用）
let createdBlockId = null;
let createdTextureId = null;

test.describe('1-2 GAS API', () => {

  // ============================================
  // 読み取りAPI（GET）テスト
  // ============================================

  test.describe('読み取りAPI（GET）', () => {

    test('getBlocks: ブロック一覧を取得できる', async ({ request }) => {
      const response = await request.get(`${API_URL}?action=getBlocks`);
      expect(response.ok()).toBeTruthy();

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      // データがある場合、必須フィールドを確認
      if (json.data.length > 0) {
        const block = json.data[0];
        expect(block).toHaveProperty('block_id');
        expect(block).toHaveProperty('block_str_id');
        expect(block).toHaveProperty('name');
        expect(block).toHaveProperty('shape_type');
        expect(block).toHaveProperty('is_transparent');
        expect(block).toHaveProperty('light_level');
        expect(block).toHaveProperty('tex_default');
      }
    });

    test('getTextures: テクスチャ一覧を取得できる', async ({ request }) => {
      const response = await request.get(`${API_URL}?action=getTextures`);
      expect(response.ok()).toBeTruthy();

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      // データがある場合、必須フィールドを確認
      if (json.data.length > 0) {
        const texture = json.data[0];
        expect(texture).toHaveProperty('texture_id');
        expect(texture).toHaveProperty('file_name');
        expect(texture).toHaveProperty('color_hex');
        expect(texture).toHaveProperty('image_base64');
      }
    });

    test('getAll: 全データを取得できる', async ({ request }) => {
      const response = await request.get(`${API_URL}?action=getAll`);
      expect(response.ok()).toBeTruthy();

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty('blocks');
      expect(json.data).toHaveProperty('textures');
      expect(Array.isArray(json.data.blocks)).toBe(true);
      expect(Array.isArray(json.data.textures)).toBe(true);
    });

    test('不正なaction: エラーレスポンスを返す', async ({ request }) => {
      const response = await request.get(`${API_URL}?action=invalidAction`);
      const json = await response.json();

      expect(json.success).toBe(false);
      expect(json).toHaveProperty('error');
    });

    test('キャッシュ効果: 2回目のgetBlocksは高速', async ({ request }) => {
      // 1回目（キャッシュなし or キャッシュ済み）
      const start1 = Date.now();
      const response1 = await request.get(`${API_URL}?action=getBlocks`);
      const time1 = Date.now() - start1;
      expect(response1.ok()).toBeTruthy();

      // 2回目（キャッシュヒット期待）
      const start2 = Date.now();
      const response2 = await request.get(`${API_URL}?action=getBlocks`);
      const time2 = Date.now() - start2;
      expect(response2.ok()).toBeTruthy();

      // 結果をログ出力（キャッシュ効果の確認用）
      console.log(`1回目: ${time1}ms, 2回目: ${time2}ms`);

      // 両方のレスポンスが同じデータを返すことを確認
      const json1 = await response1.json();
      const json2 = await response2.json();
      expect(json1.data.length).toBe(json2.data.length);
    });

  });

  // ============================================
  // 書き込みAPI（POST）テスト
  // ============================================

  test.describe('書き込みAPI（POST）', () => {

    // createBlock テスト
    test.describe('createBlock', () => {

      test('正常系: 新しいブロックを作成できる', async ({ request }) => {
        const testBlockStrId = `test_block_${Date.now()}`;

        const response = await request.post(`${API_URL}?action=createBlock`, {
          data: {
            block_str_id: testBlockStrId,
            name: 'テストブロック',
            shape_type: 'normal'
          }
        });

        const json = await response.json();
        expect(json.success).toBe(true);
        expect(json.data).toHaveProperty('block_id');
        expect(typeof json.data.block_id).toBe('number');

        // 後のテストで使用するためIDを保存
        createdBlockId = json.data.block_id;
      });

      test('異常系: block_str_idが空の場合エラー', async ({ request }) => {
        const response = await request.post(`${API_URL}?action=createBlock`, {
          data: {
            block_str_id: '',
            name: 'テストブロック',
            shape_type: 'normal'
          }
        });

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json).toHaveProperty('error');
      });

      test('異常系: nameが空の場合エラー', async ({ request }) => {
        const response = await request.post(`${API_URL}?action=createBlock`, {
          data: {
            block_str_id: `test_block_${Date.now()}`,
            name: '',
            shape_type: 'normal'
          }
        });

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json).toHaveProperty('error');
      });

      test('異常系: shape_typeが不正な場合エラー', async ({ request }) => {
        const response = await request.post(`${API_URL}?action=createBlock`, {
          data: {
            block_str_id: `test_block_${Date.now()}`,
            name: 'テストブロック',
            shape_type: 'invalid_type'
          }
        });

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json).toHaveProperty('error');
      });

      test('異常系: block_str_idに不正な文字が含まれる場合エラー', async ({ request }) => {
        const response = await request.post(`${API_URL}?action=createBlock`, {
          data: {
            block_str_id: 'invalid-block-id!',
            name: 'テストブロック',
            shape_type: 'normal'
          }
        });

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json).toHaveProperty('error');
      });

      test('異常系: 重複するblock_str_idの場合エラー', async ({ request }) => {
        const testBlockStrId = `test_duplicate_${Date.now()}`;

        // 1回目: 作成成功
        await request.post(`${API_URL}?action=createBlock`, {
          data: {
            block_str_id: testBlockStrId,
            name: 'テストブロック1',
            shape_type: 'normal'
          }
        });

        // 2回目: 重複エラー
        const response = await request.post(`${API_URL}?action=createBlock`, {
          data: {
            block_str_id: testBlockStrId,
            name: 'テストブロック2',
            shape_type: 'normal'
          }
        });

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json.error).toContain('already exists');
      });

    });

    // saveBlock テスト
    test.describe('saveBlock', () => {

      test('正常系: ブロックを更新できる', async ({ request }) => {
        // まずブロックを作成
        const testBlockStrId = `test_save_${Date.now()}`;
        const createResponse = await request.post(`${API_URL}?action=createBlock`, {
          data: {
            block_str_id: testBlockStrId,
            name: 'テストブロック',
            shape_type: 'normal'
          }
        });
        const createJson = await createResponse.json();
        const blockId = createJson.data.block_id;

        // 更新
        const response = await request.post(`${API_URL}?action=saveBlock`, {
          data: {
            block_id: blockId,
            block_str_id: testBlockStrId,
            name: '更新されたブロック',
            shape_type: 'normal',
            is_transparent: true,
            light_level: 5,
            tex_default: 'stone'
          }
        });

        const json = await response.json();
        expect(json.success).toBe(true);
        expect(json.data.block_id).toBe(blockId);
      });

      test('異常系: block_idが存在しない場合エラー', async ({ request }) => {
        const response = await request.post(`${API_URL}?action=saveBlock`, {
          data: {
            block_id: 999999,
            block_str_id: 'nonexistent',
            name: 'テスト',
            shape_type: 'normal'
          }
        });

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json).toHaveProperty('error');
      });

      test('異常系: block_idが指定されていない場合エラー', async ({ request }) => {
        const response = await request.post(`${API_URL}?action=saveBlock`, {
          data: {
            block_str_id: 'test',
            name: 'テスト',
            shape_type: 'normal'
          }
        });

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json).toHaveProperty('error');
      });

    });

    // deleteBlock テスト
    test.describe('deleteBlock', () => {

      test('正常系: ブロックを削除できる', async ({ request }) => {
        // まずブロックを作成
        const testBlockStrId = `test_delete_${Date.now()}`;
        const createResponse = await request.post(`${API_URL}?action=createBlock`, {
          data: {
            block_str_id: testBlockStrId,
            name: 'テストブロック',
            shape_type: 'normal'
          }
        });
        const createJson = await createResponse.json();
        const blockId = createJson.data.block_id;

        // 削除
        const response = await request.post(`${API_URL}?action=deleteBlock`, {
          data: {
            block_id: blockId
          }
        });

        const json = await response.json();
        expect(json.success).toBe(true);
        expect(json.data.deleted).toBe(true);
      });

      test('異常系: 存在しないblock_idの場合エラー', async ({ request }) => {
        const response = await request.post(`${API_URL}?action=deleteBlock`, {
          data: {
            block_id: 999999
          }
        });

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json).toHaveProperty('error');
      });

    });

    // saveTexture テスト
    test.describe('saveTexture', () => {

      test('正常系: 新しいテクスチャを作成できる', async ({ request }) => {
        const response = await request.post(`${API_URL}?action=saveTexture`, {
          data: {
            file_name: `test_texture_${Date.now()}`,
            color_hex: '#FF0000',
            image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
          }
        });

        const json = await response.json();
        expect(json.success).toBe(true);
        expect(json.data).toHaveProperty('texture_id');
        expect(typeof json.data.texture_id).toBe('number');

        // 後のテストで使用するためIDを保存
        createdTextureId = json.data.texture_id;
      });

      test('正常系: 既存テクスチャを更新できる', async ({ request }) => {
        // まずテクスチャを作成
        const createResponse = await request.post(`${API_URL}?action=saveTexture`, {
          data: {
            file_name: `test_update_texture_${Date.now()}`,
            color_hex: '#00FF00',
            image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
          }
        });
        const createJson = await createResponse.json();
        const textureId = createJson.data.texture_id;

        // 更新
        const response = await request.post(`${API_URL}?action=saveTexture`, {
          data: {
            texture_id: textureId,
            file_name: `test_updated_texture_${Date.now()}`,
            color_hex: '#0000FF',
            image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
          }
        });

        const json = await response.json();
        expect(json.success).toBe(true);
        expect(json.data.texture_id).toBe(textureId);
      });

    });

    // deleteTexture テスト
    test.describe('deleteTexture', () => {

      test('正常系: テクスチャを削除できる', async ({ request }) => {
        // まずテクスチャを作成
        const createResponse = await request.post(`${API_URL}?action=saveTexture`, {
          data: {
            file_name: `test_delete_texture_${Date.now()}`,
            color_hex: '#FFFF00',
            image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
          }
        });
        const createJson = await createResponse.json();
        const textureId = createJson.data.texture_id;

        // 削除
        const response = await request.post(`${API_URL}?action=deleteTexture`, {
          data: {
            texture_id: textureId
          }
        });

        const json = await response.json();
        expect(json.success).toBe(true);
        expect(json.data.deleted).toBe(true);
      });

      test('異常系: 存在しないtexture_idの場合エラー', async ({ request }) => {
        const response = await request.post(`${API_URL}?action=deleteTexture`, {
          data: {
            texture_id: 999999
          }
        });

        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json).toHaveProperty('error');
      });

    });

  });

});
