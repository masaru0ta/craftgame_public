/**
 * VoxelData
 * 8x8x8ボクセルデータのエンコード/デコードを行うユーティリティクラス
 * 各ボクセルは2ビット（0-3）で表現
 *   0: 空気（透明）
 *   1: material_1
 *   2: material_2
 *   3: material_3
 * データはY→Z→X順で格納
 */
class VoxelData {
  /**
   * 空の8x8x8ボクセルデータを作成
   * @returns {Uint8Array} 512個のボクセル（各2bit、計128バイト）
   */
  static createEmpty() {
    // 8x8x8 = 512 ボクセル、各2bit = 1024bit = 128バイト
    return new Uint8Array(128);
  }

  /**
   * Base64文字列からボクセルデータをデコード
   * @param {string} base64 - Base64エンコードされたデータ
   * @returns {Uint8Array} ボクセルデータ（128バイト）
   */
  static decode(base64) {
    if (!base64 || base64.length === 0) {
      return VoxelData.createEmpty();
    }

    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // データが128バイトでない場合は空のデータを返す
      if (bytes.length !== 128) {
        return VoxelData.createEmpty();
      }

      return bytes;
    } catch (e) {
      console.error('VoxelData decode error:', e);
      return VoxelData.createEmpty();
    }
  }

  /**
   * ボクセルデータをBase64文字列にエンコード
   * @param {Uint8Array} data - ボクセルデータ（128バイト）
   * @returns {string} Base64エンコードされた文字列
   */
  static encode(data) {
    if (!data || data.length !== 128) {
      return '';
    }

    let binaryString = '';
    for (let i = 0; i < data.length; i++) {
      binaryString += String.fromCharCode(data[i]);
    }
    return btoa(binaryString);
  }

  /**
   * 指定座標のボクセル値を取得
   * @param {Uint8Array} data - ボクセルデータ
   * @param {number} x - X座標 (0-7)
   * @param {number} y - Y座標 (0-7)
   * @param {number} z - Z座標 (0-7)
   * @returns {number} ボクセル値 (0-3)
   */
  static getVoxel(data, x, y, z) {
    if (!VoxelData._isValidCoord(x, y, z)) {
      return 0;
    }

    // インデックス計算: Y→Z→X順
    // index = y * 64 + z * 8 + x (0-511)
    const voxelIndex = y * 64 + z * 8 + x;

    // 4つのボクセルが1バイトに格納されている
    const byteIndex = Math.floor(voxelIndex / 4);
    const bitOffset = (voxelIndex % 4) * 2;

    return (data[byteIndex] >> bitOffset) & 0x03;
  }

  /**
   * 指定座標にボクセル値を設定
   * @param {Uint8Array} data - ボクセルデータ
   * @param {number} x - X座標 (0-7)
   * @param {number} y - Y座標 (0-7)
   * @param {number} z - Z座標 (0-7)
   * @param {number} value - ボクセル値 (0-3)
   */
  static setVoxel(data, x, y, z, value) {
    if (!VoxelData._isValidCoord(x, y, z)) {
      return;
    }

    const voxelIndex = y * 64 + z * 8 + x;
    const byteIndex = Math.floor(voxelIndex / 4);
    const bitOffset = (voxelIndex % 4) * 2;

    // 対象の2ビットをクリア
    const mask = ~(0x03 << bitOffset);
    data[byteIndex] = (data[byteIndex] & mask) | ((value & 0x03) << bitOffset);
  }

  /**
   * ボクセルの総数をカウント（空気以外）
   * @param {Uint8Array} data - ボクセルデータ
   * @returns {number} ボクセル数
   */
  static countVoxels(data) {
    let count = 0;
    for (let y = 0; y < 8; y++) {
      for (let z = 0; z < 8; z++) {
        for (let x = 0; x < 8; x++) {
          if (VoxelData.getVoxel(data, x, y, z) !== 0) {
            count++;
          }
        }
      }
    }
    return count;
  }

  /**
   * ボクセルデータを反復処理
   * @param {Uint8Array} data - ボクセルデータ
   * @param {Function} callback - コールバック関数 (x, y, z, value)
   */
  static forEach(data, callback) {
    for (let y = 0; y < 8; y++) {
      for (let z = 0; z < 8; z++) {
        for (let x = 0; x < 8; x++) {
          const value = VoxelData.getVoxel(data, x, y, z);
          callback(x, y, z, value);
        }
      }
    }
  }

  /**
   * ボクセルデータをコピー
   * @param {Uint8Array} data - ボクセルデータ
   * @returns {Uint8Array} コピーされたデータ
   */
  static copy(data) {
    return new Uint8Array(data);
  }

  /**
   * 座標が有効範囲内かチェック
   * @private
   */
  static _isValidCoord(x, y, z) {
    return x >= 0 && x < 8 && y >= 0 && y < 8 && z >= 0 && z < 8;
  }
}
