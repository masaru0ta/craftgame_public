/**
 * StructureData
 * 構造物ボクセルデータのエンコード/デコードを行うクラス
 * パレット方式（0=air、1〜=ブロック）、可変サイズ（最大32x32x32）
 * 各ボクセルにブロック種別＋向き（orientation: 0〜23）を格納
 * データはY→Z→X順で格納
 */
class StructureData {
  /**
   * @param {number} canvasSize - 編集キャンバスサイズ（デフォルト32）
   */
  constructor(canvasSize = 32) {
    this.canvasSize = Math.min(Math.max(canvasSize, 1), 32);
    const total = this.canvasSize * this.canvasSize * this.canvasSize;

    // パレット（インデックス0は常にair）
    this.palette = ['air'];

    // ボクセルデータ（パレットインデックス）
    this.voxels = new Uint8Array(total);

    // 向きデータ（0〜23）
    this.orientations = new Uint8Array(total);
  }

  // ========================================
  // パレット操作
  // ========================================

  /**
   * パレット配列を取得
   * @returns {string[]} パレット配列のコピー
   */
  getPalette() {
    return [...this.palette];
  }

  /**
   * パレットにブロックを追加
   * @param {string} blockStrId - ブロック文字列ID
   * @returns {number} パレットインデックス
   */
  addToPalette(blockStrId) {
    const existing = this.palette.indexOf(blockStrId);
    if (existing >= 0) return existing;
    this.palette.push(blockStrId);
    return this.palette.length - 1;
  }

  // ========================================
  // ボクセル操作
  // ========================================

  /**
   * インデックスを計算（Y→Z→X順）
   * @private
   */
  _getIndex(x, y, z) {
    return y * (this.canvasSize * this.canvasSize) + z * this.canvasSize + x;
  }

  /**
   * 座標が有効範囲内かチェック
   * @private
   */
  _isValidCoord(x, y, z) {
    return x >= 0 && x < this.canvasSize &&
           y >= 0 && y < this.canvasSize &&
           z >= 0 && z < this.canvasSize;
  }

  /**
   * ブロックを設定
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {string} blockStrId - ブロック文字列ID（"air"で削除）
   * @param {number} orientation - 向き（0〜23）
   */
  setBlock(x, y, z, blockStrId, orientation = 0) {
    if (!this._isValidCoord(x, y, z)) return;
    const idx = this._getIndex(x, y, z);

    if (blockStrId === 'air') {
      this.voxels[idx] = 0;
      this.orientations[idx] = 0;
    } else {
      const paletteIdx = this.addToPalette(blockStrId);
      this.voxels[idx] = paletteIdx;
      this.orientations[idx] = Math.min(Math.max(orientation, 0), 23);
    }
  }

  /**
   * ブロックを取得
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {{ blockStrId: string, orientation: number }}
   */
  getBlock(x, y, z) {
    if (!this._isValidCoord(x, y, z)) {
      return { blockStrId: 'air', orientation: 0 };
    }
    const idx = this._getIndex(x, y, z);
    const paletteIdx = this.voxels[idx];
    return {
      blockStrId: this.palette[paletteIdx] || 'air',
      orientation: this.orientations[idx]
    };
  }

  /**
   * バウンディングボックスのサイズを返す
   * @returns {{ x: number, y: number, z: number }}
   */
  getSize() {
    const bb = this.getBoundingBox();
    if (!bb) return { x: 0, y: 0, z: 0 };
    return {
      x: bb.maxX - bb.minX + 1,
      y: bb.maxY - bb.minY + 1,
      z: bb.maxZ - bb.minZ + 1
    };
  }

  /**
   * air以外のボクセル数をカウント
   * @returns {number}
   */
  countBlocks() {
    let count = 0;
    for (let i = 0; i < this.voxels.length; i++) {
      if (this.voxels[i] !== 0) count++;
    }
    return count;
  }

  /**
   * air以外のボクセルをイテレート
   * @param {Function} callback - (x, y, z, blockStrId, orientation)
   */
  forEachBlock(callback) {
    const cs = this.canvasSize;
    for (let y = 0; y < cs; y++) {
      for (let z = 0; z < cs; z++) {
        for (let x = 0; x < cs; x++) {
          const idx = this._getIndex(x, y, z);
          if (this.voxels[idx] !== 0) {
            callback(x, y, z, this.palette[this.voxels[idx]], this.orientations[idx]);
          }
        }
      }
    }
  }

  // ========================================
  // バウンディングボックス
  // ========================================

  /**
   * 非airブロックのバウンディングボックスを返す
   * @returns {{ minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number } | null}
   */
  getBoundingBox() {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let found = false;

    const cs = this.canvasSize;
    for (let y = 0; y < cs; y++) {
      for (let z = 0; z < cs; z++) {
        for (let x = 0; x < cs; x++) {
          if (this.voxels[this._getIndex(x, y, z)] !== 0) {
            found = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (z < minZ) minZ = z;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (z > maxZ) maxZ = z;
          }
        }
      }
    }

    if (!found) return null;
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  // ========================================
  // シリアライズ
  // ========================================

  /**
   * バウンディングボックス範囲のデータをエンコード
   * @returns {{ voxel_data: string, orientation_data: string, palette: string[], size_x: number, size_y: number, size_z: number }}
   */
  encode() {
    const bb = this.getBoundingBox();
    if (!bb) {
      return {
        voxel_data: '',
        orientation_data: '',
        palette: ['air'],
        size_x: 0,
        size_y: 0,
        size_z: 0
      };
    }

    const sizeX = bb.maxX - bb.minX + 1;
    const sizeY = bb.maxY - bb.minY + 1;
    const sizeZ = bb.maxZ - bb.minZ + 1;
    const totalVoxels = sizeX * sizeY * sizeZ;

    // バウンディングボックス範囲のボクセルと向きを抽出
    const voxelValues = new Uint8Array(totalVoxels);
    const orientValues = new Uint8Array(totalVoxels);
    let hasOrientation = false;

    let i = 0;
    for (let y = bb.minY; y <= bb.maxY; y++) {
      for (let z = bb.minZ; z <= bb.maxZ; z++) {
        for (let x = bb.minX; x <= bb.maxX; x++) {
          const srcIdx = this._getIndex(x, y, z);
          voxelValues[i] = this.voxels[srcIdx];
          orientValues[i] = this.orientations[srcIdx];
          if (orientValues[i] !== 0) hasOrientation = true;
          i++;
        }
      }
    }

    // ビットパック（voxel_data）
    const bitWidth = StructureData._bitWidthFromPaletteSize(this.palette.length);
    const bitsTotal = totalVoxels * bitWidth;
    const bytesNeeded = Math.ceil(bitsTotal / 8);
    const packed = new Uint8Array(bytesNeeded);

    for (let j = 0; j < totalVoxels; j++) {
      const bitPos = j * bitWidth;
      const byteIdx = Math.floor(bitPos / 8);
      const bitOffset = bitPos % 8;
      packed[byteIdx] |= (voxelValues[j] & ((1 << bitWidth) - 1)) << bitOffset;

      // ビットが次のバイトにまたがる場合
      if (bitOffset + bitWidth > 8) {
        packed[byteIdx + 1] |= (voxelValues[j] >> (8 - bitOffset));
      }
    }

    // zlib圧縮 + Base64
    const compressedVoxel = pako.deflate(packed);
    const voxelBase64 = this._uint8ArrayToBase64(compressedVoxel);

    // orientation_data（全て0ならスキップ）
    let orientBase64 = '';
    if (hasOrientation) {
      const compressedOrient = pako.deflate(orientValues);
      orientBase64 = this._uint8ArrayToBase64(compressedOrient);
    }

    return {
      voxel_data: voxelBase64,
      orientation_data: orientBase64,
      palette: this.getPalette(),
      size_x: sizeX,
      size_y: sizeY,
      size_z: sizeZ,
      bb_min_x: bb.minX,
      bb_min_y: bb.minY,
      bb_min_z: bb.minZ
    };
  }

  /**
   * エンコードされたデータからStructureDataを復元
   * @param {string} voxelBase64 - voxel_data
   * @param {string} orientBase64 - orientation_data
   * @param {string[]} palette - パレット配列
   * @param {number} sizeX
   * @param {number} sizeY
   * @param {number} sizeZ
   * @returns {StructureData}
   */
  static decode(voxelBase64, orientBase64, palette, sizeX, sizeY, sizeZ, canvasSize = null, startX = 0, startY = 0, startZ = 0) {
    if (!canvasSize) canvasSize = Math.max(sizeX, sizeY, sizeZ, 1);
    const sd = new StructureData(canvasSize);
    sd.palette = [...palette];

    if (!voxelBase64 || sizeX === 0 || sizeY === 0 || sizeZ === 0) {
      return sd;
    }

    const totalVoxels = sizeX * sizeY * sizeZ;

    // voxel_data デコード
    const compressedVoxel = sd._base64ToUint8Array(voxelBase64);
    const packed = pako.inflate(compressedVoxel);

    // ビット幅を逆算
    const bitWidth = StructureData._bitWidthFromPaletteSize(palette.length);

    // ビットアンパック
    const voxelValues = new Uint8Array(totalVoxels);
    const mask = (1 << bitWidth) - 1;
    for (let j = 0; j < totalVoxels; j++) {
      const bitPos = j * bitWidth;
      const byteIdx = Math.floor(bitPos / 8);
      const bitOffset = bitPos % 8;
      let value = (packed[byteIdx] >> bitOffset) & mask;
      if (bitOffset + bitWidth > 8 && byteIdx + 1 < packed.length) {
        value |= (packed[byteIdx + 1] << (8 - bitOffset)) & mask;
      }
      voxelValues[j] = value;
    }

    // orientation_data デコード
    let orientValues = new Uint8Array(totalVoxels);
    if (orientBase64) {
      const compressedOrient = sd._base64ToUint8Array(orientBase64);
      orientValues = pako.inflate(compressedOrient);
    }

    // キャンバスに配置（startX/Y/Zから配置）
    let i = 0;
    for (let y = 0; y < sizeY; y++) {
      for (let z = 0; z < sizeZ; z++) {
        for (let x = 0; x < sizeX; x++) {
          const px = startX + x;
          const py = startY + y;
          const pz = startZ + z;
          if (sd._isValidCoord(px, py, pz)) {
            const idx = sd._getIndex(px, py, pz);
            sd.voxels[idx] = voxelValues[i];
            sd.orientations[idx] = orientValues[i];
          }
          i++;
        }
      }
    }

    return sd;
  }

  /**
   * パレットサイズからビット幅を計算
   * @private
   */
  static _bitWidthFromPaletteSize(size) {
    if (size <= 2) return 1;
    if (size <= 4) return 2;
    if (size <= 16) return 4;
    return 8;
  }

  /**
   * Uint8ArrayをBase64に変換
   * @private
   */
  _uint8ArrayToBase64(uint8Array) {
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64をUint8Arrayに変換
   * @private
   */
  _base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
