/**
 * custom_collision.js
 * 4x4x4当たり判定データのエンコード/デコード処理
 *
 * データ形式:
 * - 各ボクセルは1ビット（0-1）で表現
 *   - 0: 通過可（空気）
 *   - 1: 衝突あり（ソリッド）
 * - データはY→Z→X順で格納
 * - Base64エンコードして保存
 *
 * 総データサイズ: 4x4x4 = 64ボクセル * 1bit = 64bit = 8bytes
 */

const VoxelCollision = {
  GRID_SIZE: 4,
  BITS_PER_VOXEL: 1,
  TOTAL_VOXELS: 4 * 4 * 4, // 64
  BYTES_NEEDED: (4 * 4 * 4 * 1) / 8, // 8 bytes

  /**
   * 空の当たり判定データ（3次元配列）を作成
   * @returns {number[][][]} 4x4x4の3次元配列（全て0）
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
   * 当たり判定値を取得
   * @param {number[][][]} data 当たり判定データ
   * @param {number} x X座標（0-3）
   * @param {number} y Y座標（0-3）
   * @param {number} z Z座標（0-3）
   * @returns {number} 当たり判定値（0 or 1）、範囲外の場合は0
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
   * 当たり判定値を設定
   * @param {number[][][]} data 当たり判定データ
   * @param {number} x X座標（0-3）
   * @param {number} y Y座標（0-3）
   * @param {number} z Z座標（0-3）
   * @param {number} value 当たり判定値（0 or 1）
   * @returns {boolean} 設定成功した場合true
   */
  set(data, x, y, z, value) {
    if (x < 0 || x >= this.GRID_SIZE ||
        y < 0 || y >= this.GRID_SIZE ||
        z < 0 || z >= this.GRID_SIZE) {
      return false;
    }
    data[y][z][x] = value & 0x01; // 0 or 1に制限
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
   * Y→Z→X順で格納、8ボクセル = 1バイト
   * @param {number[][][]} data 4x4x4の3次元配列
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
          const value = data[y][z][x] & 0x01; // 0 or 1に制限

          // 現在のバイトに1ビット追加
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
   * @returns {number[][][]} 4x4x4の3次元配列
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

            // 1ビット取り出し
            const value = (bytes[byteIndex] >> bitOffset) & 0x01;
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
      console.error('当たり判定データのデコードに失敗:', e);
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
   * 当たり判定データをディープコピー
   * @param {number[][][]} data 元の当たり判定データ
   * @returns {number[][][]} コピーされた当たり判定データ
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
   * ソリッドボクセル数をカウント
   * @param {number[][][]} data 当たり判定データ
   * @returns {number} ソリッドボクセル数
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
   * 当たり判定データが空かどうか（全て通過可）
   * @param {number[][][]} data 当たり判定データ
   * @returns {boolean} 全て空なら true
   */
  isEmpty(data) {
    return this.count(data) === 0;
  },

  /**
   * 見た目座標から当たり判定座標に変換
   * 見た目の2x2x2ボクセル = 当たり判定の1ボクセル
   * @param {number} lookX 見た目のX座標（0-7）
   * @param {number} lookY 見た目のY座標（0-7）
   * @param {number} lookZ 見た目のZ座標（0-7）
   * @returns {{x: number, y: number, z: number}} 当たり判定座標
   */
  lookToCollision(lookX, lookY, lookZ) {
    return {
      x: Math.floor(lookX / 2),
      y: Math.floor(lookY / 2),
      z: Math.floor(lookZ / 2)
    };
  },

  /**
   * 当たり判定座標から見た目座標の範囲に変換
   * @param {number} collX 当たり判定のX座標（0-3）
   * @param {number} collY 当たり判定のY座標（0-3）
   * @param {number} collZ 当たり判定のZ座標（0-3）
   * @returns {{minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number}} 見た目座標の範囲
   */
  collisionToLookRange(collX, collY, collZ) {
    return {
      minX: collX * 2,
      maxX: collX * 2 + 1,
      minY: collY * 2,
      maxY: collY * 2 + 1,
      minZ: collZ * 2,
      maxZ: collZ * 2 + 1
    };
  },

  /**
   * ワールド座標が当たり判定ボクセルと衝突するかチェック
   * ワールド座標はブロック中心が原点、ブロックサイズが1の座標系
   * @param {number[][][]} data 当たり判定データ
   * @param {number} worldX ワールドX座標（-0.5〜0.5）
   * @param {number} worldY ワールドY座標（-0.5〜0.5）
   * @param {number} worldZ ワールドZ座標（-0.5〜0.5）
   * @returns {boolean} 衝突していればtrue
   */
  checkCollision(data, worldX, worldY, worldZ) {
    // ワールド座標を当たり判定グリッド座標に変換
    const gridX = Math.floor((worldX + 0.5) * this.GRID_SIZE);
    const gridY = Math.floor((worldY + 0.5) * this.GRID_SIZE);
    const gridZ = Math.floor((worldZ + 0.5) * this.GRID_SIZE);

    return this.get(data, gridX, gridY, gridZ) === 1;
  }
};

// グローバルに公開
if (typeof window !== 'undefined') {
  window.VoxelCollision = VoxelCollision;
}
