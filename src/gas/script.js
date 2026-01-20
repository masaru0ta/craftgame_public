/**
 * craftgame5 GAS API
 * スプレッドシートのデータを読み書きするAPI
 */

// スプレッドシートID
const SPREADSHEET_ID = '1opkXxb8BRxQKGD7WKwbEvElWfd9UvIvx8wIDdm36GiM';

// シート名
const SHEET_BLOCKS = 'ブロック状態';
const SHEET_TEXTURES = 'テクスチャ';

/**
 * GETリクエストのハンドラ
 * @param {Object} e - リクエストイベント
 * @returns {TextOutput} JSONレスポンス
 */
function doGet(e) {
  try {
    const action = e.parameter.action;

    let result;
    switch (action) {
      case 'getBlocks':
        result = getBlocks();
        break;
      case 'getTextures':
        result = getTextures();
        break;
      case 'getAll':
        result = getAll();
        break;
      default:
        return createErrorResponse('不正なアクション: ' + action);
    }

    return createSuccessResponse(result);
  } catch (error) {
    return createErrorResponse(error.message);
  }
}

/**
 * POSTリクエストのハンドラ
 * @param {Object} e - リクエストイベント
 * @returns {TextOutput} JSONレスポンス
 */
function doPost(e) {
  try {
    const action = e.parameter.action;
    const body = JSON.parse(e.postData.contents);

    let result;
    switch (action) {
      case 'saveBlock':
        result = saveBlock(body);
        break;
      case 'deleteBlock':
        result = deleteBlock(body);
        break;
      case 'saveTexture':
        result = saveTexture(body);
        break;
      case 'deleteTexture':
        result = deleteTexture(body);
        break;
      default:
        return createErrorResponse('不正なアクション: ' + action);
    }

    return createSuccessResponse(result);
  } catch (error) {
    return createErrorResponse(error.message);
  }
}

/**
 * ブロック状態リストを取得
 * @returns {Array} ブロック状態の配列
 */
function getBlocks() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_BLOCKS);
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return [];
  }

  const headers = data[0];
  const blocks = [];

  // 省略可能な項目（空の場合は省略）
  const optionalFields = [
    'drop_item', 'tex_top', 'tex_bottom', 'tex_front', 'tex_back', 'tex_left', 'tex_right',
    'voxel_look', 'voxel_collision', 'material_1', 'material_2', 'material_3'
  ];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // 空行をスキップ
    if (!row[0] && row[0] !== 0) continue;

    const block = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = row[j];

      // 省略可能な項目で空の場合はスキップ
      if (optionalFields.includes(header) && (value === '' || value === null || value === undefined)) {
        continue;
      }

      // 型変換
      if (header === 'block_id' || header === 'light_level') {
        block[header] = Number(value);
      } else if (header === 'is_transparent') {
        block[header] = Boolean(value);
      } else {
        block[header] = value;
      }
    }

    blocks.push(block);
  }

  return blocks;
}

/**
 * テクスチャリストを取得
 * @returns {Array} テクスチャの配列
 */
function getTextures() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_TEXTURES);
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return [];
  }

  const headers = data[0];
  const textures = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // 空行をスキップ
    if (!row[0] && row[0] !== 0) continue;

    const texture = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = row[j];

      // 型変換
      if (header === 'texture_id') {
        texture[header] = Number(value);
      } else {
        texture[header] = value;
      }
    }

    textures.push(texture);
  }

  return textures;
}

/**
 * 全データを取得
 * @returns {Object} ブロックとテクスチャのデータ
 */
function getAll() {
  return {
    blocks: getBlocks(),
    textures: getTextures()
  };
}

/**
 * 成功レスポンスを作成
 * @param {*} data - レスポンスデータ
 * @returns {TextOutput} JSONレスポンス
 */
function createSuccessResponse(data) {
  const response = {
    success: true,
    data: data
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * エラーレスポンスを作成
 * @param {string} message - エラーメッセージ
 * @returns {TextOutput} JSONレスポンス
 */
function createErrorResponse(message) {
  const response = {
    success: false,
    error: message
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ブロックを追加または更新
 * @param {Object} blockData - ブロックデータ
 * @returns {Object} 結果
 */
function saveBlock(blockData) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_BLOCKS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // block_idで既存行を検索
  const blockIdIndex = headers.indexOf('block_id');
  let rowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][blockIdIndex] === blockData.block_id) {
      rowIndex = i + 1; // シートの行番号（1始まり）
      break;
    }
  }

  // 行データを作成
  const rowData = headers.map(header => {
    if (blockData.hasOwnProperty(header)) {
      return blockData[header];
    }
    return '';
  });

  if (rowIndex > 0) {
    // 既存行を更新
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);
  } else {
    // 新規行を追加
    sheet.appendRow(rowData);
  }

  return { block_id: blockData.block_id };
}

/**
 * ブロックを削除
 * @param {Object} params - 削除パラメータ
 * @returns {Object} 結果
 */
function deleteBlock(params) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_BLOCKS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const blockIdIndex = headers.indexOf('block_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][blockIdIndex] === params.block_id) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }

  return { deleted: false };
}

/**
 * テクスチャを追加または更新
 * @param {Object} textureData - テクスチャデータ
 * @returns {Object} 結果
 */
function saveTexture(textureData) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_TEXTURES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // texture_idで既存行を検索
  const textureIdIndex = headers.indexOf('texture_id');
  let rowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][textureIdIndex] === textureData.texture_id) {
      rowIndex = i + 1;
      break;
    }
  }

  // 行データを作成
  const rowData = headers.map(header => {
    if (textureData.hasOwnProperty(header)) {
      return textureData[header];
    }
    return '';
  });

  if (rowIndex > 0) {
    // 既存行を更新
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);
  } else {
    // 新規行を追加
    sheet.appendRow(rowData);
  }

  return { texture_id: textureData.texture_id };
}

/**
 * テクスチャを削除
 * @param {Object} params - 削除パラメータ
 * @returns {Object} 結果
 */
function deleteTexture(params) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_TEXTURES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const textureIdIndex = headers.indexOf('texture_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][textureIdIndex] === params.texture_id) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }

  return { deleted: false };
}
