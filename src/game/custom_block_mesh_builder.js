/**
 * CustomBlockMeshBuilder
 * カスタムブロック用メッシュ生成ライブラリ
 * 8x8x8ボクセルデータからThree.jsメッシュを生成
 */
class CustomBlockMeshBuilder {
  /**
   * @param {Object} THREE - Three.jsライブラリ
   */
  constructor(THREE) {
    this.THREE = THREE;
  }

  /**
   * ボクセルデータからメッシュを生成
   * @param {Uint8Array} voxelData - ボクセルデータ（128バイト）
   * @param {Array} materials - マテリアル配列（THREE.Material x 3）
   * @param {number} voxelSize - 各ボクセルのサイズ（デフォルト: 1/8 = 0.125）
   * @returns {THREE.Group} ボクセルメッシュグループ
   */
  build(voxelData, materials, voxelSize = 0.125) {
    const group = new this.THREE.Group();

    // ボクセルを走査してメッシュを作成
    for (let y = 0; y < 8; y++) {
      for (let z = 0; z < 8; z++) {
        for (let x = 0; x < 8; x++) {
          const value = VoxelData.getVoxel(voxelData, x, y, z);
          if (value === 0) continue; // 空気はスキップ

          const materialIndex = value - 1; // 1-3 → 0-2
          const material = materials[materialIndex] || materials[0];

          const voxelMesh = this._createVoxelMesh(x, y, z, voxelSize, material);
          group.add(voxelMesh);
        }
      }
    }

    return group;
  }

  /**
   * ボクセルデータからUVマッピング付きメッシュを生成
   * 1枚のテクスチャを8x8分割して各ボクセルに適用
   * @param {Uint8Array} voxelData - ボクセルデータ
   * @param {Array} materials - マテリアル配列（THREE.Material x 3）
   * @param {number} voxelSize - 各ボクセルのサイズ
   * @returns {THREE.Group} ボクセルメッシュグループ
   */
  buildWithUV(voxelData, materials, voxelSize = 0.125) {
    const group = new this.THREE.Group();

    for (let y = 0; y < 8; y++) {
      for (let z = 0; z < 8; z++) {
        for (let x = 0; x < 8; x++) {
          const value = VoxelData.getVoxel(voxelData, x, y, z);
          if (value === 0) continue;

          const materialIndex = value - 1;
          const material = materials[materialIndex] || materials[0];

          const voxelMesh = this._createVoxelMeshWithUV(x, y, z, voxelSize, material);
          group.add(voxelMesh);
        }
      }
    }

    return group;
  }

  /**
   * 単一ボクセルメッシュを作成
   * @private
   */
  _createVoxelMesh(x, y, z, size, material) {
    const geometry = new this.THREE.BoxGeometry(size, size, size);
    const mesh = new this.THREE.Mesh(geometry, material);

    // ボクセル位置を計算（中心を原点にする）
    // 8x8x8の中心が(0,0,0)になるように配置
    const offset = (8 * size) / 2 - size / 2;
    mesh.position.set(
      x * size - offset,
      y * size - offset,
      z * size - offset
    );

    return mesh;
  }

  /**
   * UVマッピング付き単一ボクセルメッシュを作成
   * @private
   */
  _createVoxelMeshWithUV(x, y, z, size, material) {
    const geometry = new this.THREE.BoxGeometry(size, size, size);

    // UV座標を設定
    this._setVoxelUV(geometry, x, y, z);

    const mesh = new this.THREE.Mesh(geometry, material);

    const offset = (8 * size) / 2 - size / 2;
    mesh.position.set(
      x * size - offset,
      y * size - offset,
      z * size - offset
    );

    return mesh;
  }

  /**
   * ボクセルのUV座標を設定
   * 仕様書 9.3 に基づくUV座標計算
   * @private
   */
  _setVoxelUV(geometry, x, y, z) {
    const uvAttribute = geometry.attributes.uv;
    const uvArray = uvAttribute.array;

    // テクスチャの1セル分のサイズ（8x8分割）
    const cellSize = 1 / 8;

    // 各面のUV計算（仕様書 9.3 に基づく）
    // BoxGeometryの面順序:
    // 0-3: +X (right), 4-7: -X (left), 8-11: +Y (top), 12-15: -Y (bottom), 16-19: +Z (front), 20-23: -Z (back)
    const faces = [
      { start: 0, u: 7 - z, v: y },   // +X (right)
      { start: 4, u: z, v: y },       // -X (left)
      { start: 8, u: x, v: 7 - z },   // +Y (top)
      { start: 12, u: x, v: z },      // -Y (bottom)
      { start: 16, u: x, v: y },      // +Z (front)
      { start: 20, u: 7 - x, v: y }   // -Z (back)
    ];

    faces.forEach(face => {
      const baseU = face.u * cellSize;
      const baseV = face.v * cellSize;

      // 4頂点のUV座標（BoxGeometryの頂点順序に合わせる）
      // Three.js BoxGeometryの頂点順序: [左上, 右上, 左下, 右下]
      const uvCoords = [
        [baseU, baseV + cellSize],            // 左上
        [baseU + cellSize, baseV + cellSize], // 右上
        [baseU, baseV],                       // 左下
        [baseU + cellSize, baseV]             // 右下
      ];

      for (let i = 0; i < 4; i++) {
        const idx = (face.start + i) * 2;
        uvArray[idx] = uvCoords[i][0];
        uvArray[idx + 1] = uvCoords[i][1];
      }
    });

    uvAttribute.needsUpdate = true;
  }

  /**
   * 見た目用のデフォルトマテリアルを作成
   * @param {string} textureBase64 - テクスチャのBase64データ（省略時はグレー単色）
   * @returns {THREE.MeshLambertMaterial}
   */
  createDefaultMaterial(textureBase64 = null) {
    if (textureBase64) {
      const loader = new this.THREE.TextureLoader();
      const texture = loader.load(textureBase64);
      texture.magFilter = this.THREE.NearestFilter;
      texture.minFilter = this.THREE.NearestFilter;

      return new this.THREE.MeshLambertMaterial({
        map: texture,
        transparent: false
      });
    }

    return new this.THREE.MeshLambertMaterial({
      color: 0x808080
    });
  }

  /**
   * テクスチャからマテリアルを作成
   * @param {string} textureBase64 - テクスチャのBase64データ
   * @returns {THREE.MeshLambertMaterial}
   */
  createMaterialFromTexture(textureBase64) {
    const loader = new this.THREE.TextureLoader();
    const texture = loader.load(textureBase64);
    texture.magFilter = this.THREE.NearestFilter;
    texture.minFilter = this.THREE.NearestFilter;

    return new this.THREE.MeshLambertMaterial({
      map: texture,
      transparent: false
    });
  }

  /**
   * 単色マテリアルを作成
   * @param {number} color - 色（16進数）
   * @returns {THREE.MeshLambertMaterial}
   */
  createColorMaterial(color) {
    return new this.THREE.MeshLambertMaterial({ color });
  }
}
