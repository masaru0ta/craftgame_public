/**
 * voxel_data.js
 * 8x8x8ボクセルデータのエンコード/デコード処理
 *
 * データ形式:
 * - 各ボクセルは2ビット（0-3）で表現
 *   - 0: 空気（透明）
 *   - 1: material_1
 *   - 2: material_2
 *   - 3: material_3
 * - データはY→Z→X順で格納
 * - Base64エンコードして保存
 *
 * 総データサイズ: 8x8x8 = 512ボクセル * 2bit = 1024bit = 128bytes
 */

const VoxelData = {
  GRID_SIZE: 8,
  BITS_PER_VOXEL: 2,
  TOTAL_VOXELS: 8 * 8 * 8, // 512
  BYTES_NEEDED: (8 * 8 * 8 * 2) / 8, // 128 bytes

  /**
   * 空のボクセルデータ（3次元配列）を作成
   * @returns {number[][][]} 8x8x8の3次元配列（全て0）
   */
  createEmpty() {
    const data = [];
    for (let y = 0; y < this.GRID_SIZE; y++) {
      data[y] = [];
      for (let z = 0; z < this.GRID_SIZE; z++) {
        data[y][z] = [];
        for (let x = 0; x < this.GRID_SIZE; x++) {
          data[y][z][x] = 0;
        }
      }
    }
    return data;
  },

  /**
   * ボクセル値を取得
   * @param {number[][][]} data ボクセルデータ
   * @param {number} x X座標（0-7）
   * @param {number} y Y座標（0-7）
   * @param {number} z Z座標（0-7）
   * @returns {number} ボクセル値（0-3）、範囲外の場合は0
   */
  get(data, x, y, z) {
    if (x < 0 || x >= this.GRID_SIZE ||
        y < 0 || y >= this.GRID_SIZE ||
        z < 0 || z >= this.GRID_SIZE) {
      return 0;
    }
    return data[y][z][x];
  },

  /**
   * ボクセル値を設定
   * @param {number[][][]} data ボクセルデータ
   * @param {number} x X座標（0-7）
   * @param {number} y Y座標（0-7）
   * @param {number} z Z座標（0-7）
   * @param {number} value ボクセル値（0-3）
   * @returns {boolean} 設定成功した場合true
   */
  set(data, x, y, z, value) {
    if (x < 0 || x >= this.GRID_SIZE ||
        y < 0 || y >= this.GRID_SIZE ||
        z < 0 || z >= this.GRID_SIZE) {
      return false;
    }
    data[y][z][x] = value & 0x03; // 0-3に制限
    return true;
  },

  /**
   * 座標が有効範囲内かチェック
   * @param {number} x X座標
   * @param {number} y Y座標
   * @param {number} z Z座標
   * @returns {boolean} 有効範囲内ならtrue
   */
  isValidPosition(x, y, z) {
    return x >= 0 && x < this.GRID_SIZE &&
           y >= 0 && y < this.GRID_SIZE &&
           z >= 0 && z < this.GRID_SIZE;
  },

  /**
   * 3次元配列をBase64文字列にエンコード
   * Y→Z→X順で格納、4ボクセル = 1バイト
   * @param {number[][][]} data 8x8x8の3次元配列
   * @returns {string} Base64エンコードされた文字列
   */
  encode(data) {
    const bytes = new Uint8Array(this.BYTES_NEEDED);
    let byteIndex = 0;
    let bitOffset = 0;
    let currentByte = 0;

    // Y→Z→X順で処理
    for (let y = 0; y < this.GRID_SIZE; y++) {
      for (let z = 0; z < this.GRID_SIZE; z++) {
        for (let x = 0; x < this.GRID_SIZE; x++) {
          const value = data[y][z][x] & 0x03; // 0-3に制限

          // 現在のバイトに2ビット追加
          currentByte |= (value << bitOffset);
          bitOffset += this.BITS_PER_VOXEL;

          // 8ビット溜まったら書き込み
          if (bitOffset >= 8) {
            bytes[byteIndex] = currentByte;
            byteIndex++;
            currentByte = 0;
            bitOffset = 0;
          }
        }
      }
    }

    // Base64エンコード
    return this.bytesToBase64(bytes);
  },

  /**
   * Base64文字列を3次元配列にデコード
   * @param {string} base64 Base64エンコードされた文字列
   * @returns {number[][][]} 8x8x8の3次元配列
   */
  decode(base64) {
    const data = this.createEmpty();

    if (!base64 || base64.length === 0) {
      return data;
    }

    try {
      const bytes = this.base64ToBytes(base64);
      let byteIndex = 0;
      let bitOffset = 0;

      // Y→Z→X順で処理
      for (let y = 0; y < this.GRID_SIZE; y++) {
        for (let z = 0; z < this.GRID_SIZE; z++) {
          for (let x = 0; x < this.GRID_SIZE; x++) {
            if (byteIndex >= bytes.length) {
              return data;
            }

            // 2ビット取り出し
            const value = (bytes[byteIndex] >> bitOffset) & 0x03;
            data[y][z][x] = value;

            bitOffset += this.BITS_PER_VOXEL;
            if (bitOffset >= 8) {
              byteIndex++;
              bitOffset = 0;
            }
          }
        }
      }
    } catch (e) {
      console.error('ボクセルデータのデコードに失敗:', e);
    }

    return data;
  },

  /**
   * Uint8ArrayをBase64文字列に変換
   * @param {Uint8Array} bytes バイト配列
   * @returns {string} Base64文字列
   */
  bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  /**
   * Base64文字列をUint8Arrayに変換
   * @param {string} base64 Base64文字列
   * @returns {Uint8Array} バイト配列
   */
  base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  /**
   * ボクセルデータをディープコピー
   * @param {number[][][]} data 元のボクセルデータ
   * @returns {number[][][]} コピーされたボクセルデータ
   */
  clone(data) {
    const copy = this.createEmpty();
    for (let y = 0; y < this.GRID_SIZE; y++) {
      for (let z = 0; z < this.GRID_SIZE; z++) {
        for (let x = 0; x < this.GRID_SIZE; x++) {
          copy[y][z][x] = data[y][z][x];
        }
      }
    }
    return copy;
  },

  /**
   * ボクセル数をカウント（空気以外）
   * @param {number[][][]} data ボクセルデータ
   * @returns {number} ボクセル数
   */
  count(data) {
    let count = 0;
    for (let y = 0; y < this.GRID_SIZE; y++) {
      for (let z = 0; z < this.GRID_SIZE; z++) {
        for (let x = 0; x < this.GRID_SIZE; x++) {
          if (data[y][z][x] !== 0) {
            count++;
          }
        }
      }
    }
    return count;
  },

  /**
   * ボクセルデータが空かどうか
   * @param {number[][][]} data ボクセルデータ
   * @returns {boolean} 全て空なら true
   */
  isEmpty(data) {
    return this.count(data) === 0;
  }
};

// グローバルに公開
if (typeof window !== 'undefined') {
  window.VoxelData = VoxelData;
}
