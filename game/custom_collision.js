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
  // 定数
  static GRID_SIZE = 4;
  static DATA_BYTES = 8;

  /**
   * 空の4x4x4当たり判定データを作成
   * @returns {number[][][]} 4x4x4の3次元配列（各要素は0）
   */
  static createEmpty() {
    const size = CustomCollision.GRID_SIZE;
    const data = new Array(size);
    for (let y = 0; y < size; y++) {
      data[y] = new Array(size);
      for (let z = 0; z < size; z++) {
        data[y][z] = new Array(size).fill(0);
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
    const size = CustomCollision.GRID_SIZE;
    const bytes = new Uint8Array(CustomCollision.DATA_BYTES);
    let bitIndex = 0;

    // Y→Z→X順で格納
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          if (data[y][z][x]) {
            bytes[bitIndex >> 3] |= (1 << (bitIndex & 7));
          }
          bitIndex++;
        }
      }
    }

    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Base64から4x4x4の当たり判定配列にデコード
   * @param {string} base64 - Base64エンコードされたデータ
   * @returns {number[][][]} 4x4x4の当たり判定配列 [y][z][x]
   */
  static decode(base64) {
    if (!base64) return CustomCollision.createEmpty();

    try {
      const binaryString = atob(base64);
      if (binaryString.length !== CustomCollision.DATA_BYTES) {
        return CustomCollision.createEmpty();
      }

      const size = CustomCollision.GRID_SIZE;
      const data = CustomCollision.createEmpty();
      let bitIndex = 0;

      // Y→Z→X順で展開
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          for (let x = 0; x < size; x++) {
            const byteVal = binaryString.charCodeAt(bitIndex >> 3);
            data[y][z][x] = (byteVal >> (bitIndex & 7)) & 1;
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
    const size = CustomCollision.GRID_SIZE;
    return x >= 0 && x < size && y >= 0 && y < size && z >= 0 && z < size;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.CustomCollision = CustomCollision;
}
