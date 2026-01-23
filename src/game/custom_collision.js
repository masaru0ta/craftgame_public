/**
 * CustomCollision
 * 4x4x4当たり判定データのエンコード/デコードを行うユーティリティクラス
 * 各ボクセルは1ビット（0または1）で表現
 *   0: 通過可（空気）
 *   1: 衝突あり（ソリッド）
 * データはY→Z→X順で格納
 * 総データサイズ: 4x4x4 = 64ボクセル * 1bit = 64bit = 8bytes
 */
class CustomCollision {
  /**
   * 空の4x4x4当たり判定データを作成
   * @returns {number[][][]} 4x4x4の3次元配列（各要素は0）
   */
  static createEmpty() {
    const data = [];
    for (let y = 0; y < 4; y++) {
      data[y] = [];
      for (let z = 0; z < 4; z++) {
        data[y][z] = [0, 0, 0, 0];
      }
    }
    return data;
  }

  /**
   * 4x4x4の当たり判定配列をBase64にエンコード
   * @param {number[][][]} data - 4x4x4の当たり判定配列 [y][z][x]（各要素は0または1）
   * @returns {string} Base64エンコードされた文字列（12文字）
   */
  static encode(data) {
    // 64ビットを8バイトにパック
    const bytes = new Uint8Array(8);
    let bitIndex = 0;

    // Y→Z→X順で格納
    for (let y = 0; y < 4; y++) {
      for (let z = 0; z < 4; z++) {
        for (let x = 0; x < 4; x++) {
          const value = data[y][z][x] ? 1 : 0;
          const byteIndex = Math.floor(bitIndex / 8);
          const bitOffset = bitIndex % 8;
          bytes[byteIndex] |= (value << bitOffset);
          bitIndex++;
        }
      }
    }

    // Base64エンコード
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    return btoa(binaryString);
  }

  /**
   * Base64から4x4x4の当たり判定配列にデコード
   * @param {string} base64 - Base64エンコードされたデータ
   * @returns {number[][][]} 4x4x4の当たり判定配列 [y][z][x]
   */
  static decode(base64) {
    if (!base64 || base64.length === 0) {
      return CustomCollision.createEmpty();
    }

    try {
      // Base64デコード
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // データが8バイトでない場合は空のデータを返す
      if (bytes.length !== 8) {
        return CustomCollision.createEmpty();
      }

      // 8バイトから64ビットを展開
      const data = CustomCollision.createEmpty();
      let bitIndex = 0;

      // Y→Z→X順で展開
      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 4; z++) {
          for (let x = 0; x < 4; x++) {
            const byteIndex = Math.floor(bitIndex / 8);
            const bitOffset = bitIndex % 8;
            data[y][z][x] = (bytes[byteIndex] >> bitOffset) & 1;
            bitIndex++;
          }
        }
      }

      return data;
    } catch (e) {
      console.error('CustomCollision decode error:', e);
      return CustomCollision.createEmpty();
    }
  }

  /**
   * 指定座標のボクセル値を取得
   * @param {number[][][]} data - 当たり判定データ
   * @param {number} x - X座標 (0-3)
   * @param {number} y - Y座標 (0-3)
   * @param {number} z - Z座標 (0-3)
   * @returns {number} ボクセル値 (0または1)
   */
  static getVoxel(data, x, y, z) {
    if (!CustomCollision._isValidCoord(x, y, z)) {
      return 0;
    }
    return data[y][z][x];
  }

  /**
   * 指定座標にボクセル値を設定
   * @param {number[][][]} data - 当たり判定データ
   * @param {number} x - X座標 (0-3)
   * @param {number} y - Y座標 (0-3)
   * @param {number} z - Z座標 (0-3)
   * @param {number} value - ボクセル値 (0または1)
   */
  static setVoxel(data, x, y, z, value) {
    if (!CustomCollision._isValidCoord(x, y, z)) {
      return;
    }
    data[y][z][x] = value ? 1 : 0;
  }

  /**
   * 座標が有効範囲内かチェック
   * @private
   */
  static _isValidCoord(x, y, z) {
    return x >= 0 && x < 4 && y >= 0 && y < 4 && z >= 0 && z < 4;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.CustomCollision = CustomCollision;
}
