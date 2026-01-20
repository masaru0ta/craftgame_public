/**
 * ボクセルデータのエンコード/デコードライブラリ
 * 8x8x8のボクセルデータをBase64形式で保存・読込する
 */

class VoxelData {
  /**
   * コンストラクタ
   * @param {number} sizeX - X方向のサイズ（デフォルト: 8）
   * @param {number} sizeY - Y方向のサイズ（デフォルト: 8）
   * @param {number} sizeZ - Z方向のサイズ（デフォルト: 8）
   */
  constructor(sizeX = 8, sizeY = 8, sizeZ = 8) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;
    this.data = new Uint8Array(sizeX * sizeY * sizeZ);
  }

  /**
   * ボクセルの値を取得
   * @param {number} x - X座標（0-7）
   * @param {number} y - Y座標（0-7）
   * @param {number} z - Z座標（0-7）
   * @returns {number} ボクセルの値（0-3）
   */
  get(x, y, z) {
    if (x < 0 || x >= this.sizeX || y < 0 || y >= this.sizeY || z < 0 || z >= this.sizeZ) {
      return 0;
    }
    // Y→Z→X順でインデックスを計算
    const index = y * this.sizeZ * this.sizeX + z * this.sizeX + x;
    return this.data[index];
  }

  /**
   * ボクセルの値を設定
   * @param {number} x - X座標（0-7）
   * @param {number} y - Y座標（0-7）
   * @param {number} z - Z座標（0-7）
   * @param {number} value - 値（0-3）
   */
  set(x, y, z, value) {
    if (x < 0 || x >= this.sizeX || y < 0 || y >= this.sizeY || z < 0 || z >= this.sizeZ) {
      return;
    }
    // Y→Z→X順でインデックスを計算
    const index = y * this.sizeZ * this.sizeX + z * this.sizeX + x;
    this.data[index] = value & 0x03; // 0-3の範囲に制限
  }

  /**
   * 全データをクリア
   */
  clear() {
    this.data.fill(0);
  }

  /**
   * データを2ビットパックしてBase64エンコード
   * @returns {string} Base64エンコードされた文字列
   */
  encode() {
    const totalVoxels = this.sizeX * this.sizeY * this.sizeZ;
    const byteCount = Math.ceil(totalVoxels / 4); // 2ビット x 4 = 8ビット = 1バイト
    const packed = new Uint8Array(byteCount);

    for (let i = 0; i < totalVoxels; i++) {
      const byteIndex = Math.floor(i / 4);
      const bitOffset = (i % 4) * 2;
      packed[byteIndex] |= (this.data[i] & 0x03) << bitOffset;
    }

    return this.uint8ArrayToBase64(packed);
  }

  /**
   * Base64文字列からデータをデコード
   * @param {string} base64 - Base64エンコードされた文字列
   */
  decode(base64) {
    if (!base64) {
      this.clear();
      return;
    }

    const packed = this.base64ToUint8Array(base64);
    const totalVoxels = this.sizeX * this.sizeY * this.sizeZ;

    this.clear();

    for (let i = 0; i < totalVoxels && Math.floor(i / 4) < packed.length; i++) {
      const byteIndex = Math.floor(i / 4);
      const bitOffset = (i % 4) * 2;
      this.data[i] = (packed[byteIndex] >> bitOffset) & 0x03;
    }
  }

  /**
   * Uint8ArrayをBase64文字列に変換
   * @param {Uint8Array} bytes - バイト配列
   * @returns {string} Base64文字列
   */
  uint8ArrayToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64文字列をUint8Arrayに変換
   * @param {string} base64 - Base64文字列
   * @returns {Uint8Array} バイト配列
   */
  base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * 全ボクセルを反復処理
   * @param {Function} callback - コールバック関数(x, y, z, value)
   */
  forEach(callback) {
    for (let y = 0; y < this.sizeY; y++) {
      for (let z = 0; z < this.sizeZ; z++) {
        for (let x = 0; x < this.sizeX; x++) {
          callback(x, y, z, this.get(x, y, z));
        }
      }
    }
  }

  /**
   * 非空ボクセルのみを反復処理
   * @param {Function} callback - コールバック関数(x, y, z, value)
   */
  forEachNonEmpty(callback) {
    this.forEach((x, y, z, value) => {
      if (value !== 0) {
        callback(x, y, z, value);
      }
    });
  }

  /**
   * データをコピー
   * @returns {VoxelData} コピーされたVoxelDataインスタンス
   */
  clone() {
    const cloned = new VoxelData(this.sizeX, this.sizeY, this.sizeZ);
    cloned.data.set(this.data);
    return cloned;
  }

  /**
   * ボクセル数をカウント
   * @returns {Object} 各マテリアルのボクセル数
   */
  count() {
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    this.forEach((x, y, z, value) => {
      counts[value]++;
    });
    return counts;
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.VoxelData = VoxelData;
}
