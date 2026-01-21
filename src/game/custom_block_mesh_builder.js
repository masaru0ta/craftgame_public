/**
 * カスタムブロック用メッシュ生成ライブラリ
 * VoxelDataからThree.jsのメッシュを生成する
 */

class CustomBlockMeshBuilder {
  /**
   * コンストラクタ
   * @param {THREE} three - Three.jsライブラリへの参照
   */
  constructor(three) {
    this.THREE = three;
    this.textureLoader = new three.TextureLoader();
    this.textureCache = new Map();
  }

  /**
   * Base64画像データからテクスチャを作成
   * @param {string} base64Data - Base64エンコードされた画像データ
   * @returns {THREE.Texture} テクスチャ
   */
  createTextureFromBase64(base64Data) {
    if (this.textureCache.has(base64Data)) {
      return this.textureCache.get(base64Data);
    }

    const texture = this.textureLoader.load(base64Data);
    texture.magFilter = this.THREE.NearestFilter;
    texture.minFilter = this.THREE.NearestFilter;
    texture.colorSpace = this.THREE.SRGBColorSpace;

    this.textureCache.set(base64Data, texture);
    return texture;
  }

  /**
   * マテリアルを作成
   * @param {string|null} base64Data - テクスチャのBase64データ
   * @param {number} color - テクスチャがない場合の色
   * @returns {THREE.MeshBasicMaterial} マテリアル
   */
  createMaterial(base64Data, color = 0x808080) {
    if (base64Data) {
      const texture = this.createTextureFromBase64(base64Data);
      return new this.THREE.MeshBasicMaterial({
        map: texture,
        side: this.THREE.FrontSide
      });
    }
    return new this.THREE.MeshBasicMaterial({
      color: color,
      side: this.THREE.FrontSide
    });
  }

  /**
   * VoxelDataからメッシュを生成（最適化版：面の結合なし）
   * @param {VoxelData} voxelData - ボクセルデータ
   * @param {Array} materials - マテリアル配列 [material_1, material_2, material_3]
   * @param {number} voxelSize - ボクセル1つのサイズ（デフォルト: 1/8）
   * @returns {THREE.Group} メッシュグループ
   */
  createMesh(voxelData, materials, voxelSize = 1 / 8) {
    const group = new this.THREE.Group();

    // マテリアルを準備
    const threeMaterials = materials.map((mat, index) => {
      const colors = [0xff0000, 0x00ff00, 0x0000ff]; // デフォルト色
      return this.createMaterial(mat?.image_base64, colors[index]);
    });

    // 各ボクセルをチェック
    voxelData.forEachNonEmpty((x, y, z, value) => {
      const materialIndex = value - 1; // 1-3 → 0-2
      if (materialIndex < 0 || materialIndex >= 3) return;

      // 隣接ボクセルを確認して、見える面だけを生成
      const faces = this.getVisibleFaces(voxelData, x, y, z);

      if (faces.length === 0) return;

      // ボクセルの中心位置を計算（8x8x8グリッドの中心が原点）
      const posX = (x - 3.5) * voxelSize;
      const posY = (y - 3.5) * voxelSize;
      const posZ = (z - 3.5) * voxelSize;

      // 面ごとにジオメトリを作成
      faces.forEach(face => {
        const geometry = this.createFaceGeometry(face, voxelSize, x, y, z);
        const mesh = new this.THREE.Mesh(geometry, threeMaterials[materialIndex]);
        mesh.position.set(posX, posY, posZ);
        mesh.userData = { x, y, z, face, materialIndex: value };
        group.add(mesh);
      });
    });

    return group;
  }

  /**
   * 見える面を取得
   * @param {VoxelData} voxelData - ボクセルデータ
   * @param {number} x - X座標
   * @param {number} y - Y座標
   * @param {number} z - Z座標
   * @returns {Array} 見える面の配列
   */
  getVisibleFaces(voxelData, x, y, z) {
    const faces = [];

    // +X (right)
    if (voxelData.get(x + 1, y, z) === 0) faces.push('right');
    // -X (left)
    if (voxelData.get(x - 1, y, z) === 0) faces.push('left');
    // +Y (top)
    if (voxelData.get(x, y + 1, z) === 0) faces.push('top');
    // -Y (bottom)
    if (voxelData.get(x, y - 1, z) === 0) faces.push('bottom');
    // +Z (front)
    if (voxelData.get(x, y, z + 1) === 0) faces.push('front');
    // -Z (back)
    if (voxelData.get(x, y, z - 1) === 0) faces.push('back');

    return faces;
  }

  /**
   * 面のジオメトリを作成
   * 8x8全体で1枚のテクスチャを貼るUV座標を設定
   * @param {string} face - 面の名前
   * @param {number} size - サイズ
   * @param {number} x - X座標（0-7）
   * @param {number} y - Y座標（0-7）
   * @param {number} z - Z座標（0-7）
   * @returns {THREE.PlaneGeometry} ジオメトリ
   */
  createFaceGeometry(face, size, x = 0, y = 0, z = 0) {
    const geometry = new this.THREE.PlaneGeometry(size, size);
    const halfSize = size / 2;
    const gridSize = 8;

    // UV座標を設定
    const uvAttribute = geometry.attributes.uv;
    let uCoord, vCoord;
    let flipU = false, flipV = false;

    switch (face) {
      case 'right': // +X: Z と Y を使用
        geometry.rotateY(Math.PI / 2);
        geometry.translate(halfSize, 0, 0);
        uCoord = 7 - z;
        vCoord = y;
        flipU = true;
        break;
      case 'left': // -X: Z と Y を使用
        geometry.rotateY(-Math.PI / 2);
        geometry.translate(-halfSize, 0, 0);
        uCoord = z;
        vCoord = y;
        flipU = false;
        break;
      case 'top': // +Y: X と Z を使用
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, halfSize, 0);
        uCoord = x;
        vCoord = 7 - z;
        flipU = true;
        flipV = false;
        break;
      case 'bottom': // -Y: X と Z を使用
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, -halfSize, 0);
        uCoord = x;
        vCoord = z;
        flipU = true;
        break;
      case 'front': // +Z: X と Y を使用
        geometry.translate(0, 0, halfSize);
        uCoord = x;
        vCoord = y;
        flipU = true;
        break;
      case 'back': // -Z: X と Y を使用
        geometry.rotateY(Math.PI);
        geometry.translate(0, 0, -halfSize);
        uCoord = 7 - x;
        vCoord = y;
        flipU = true;
        break;
    }

    // UV座標を設定
    const uMin = uCoord / gridSize;
    const uMax = (uCoord + 1) / gridSize;
    const vMin = vCoord / gridSize;
    const vMax = (vCoord + 1) / gridSize;

    // デフォルトは左から右（uMin→uMax）
    const u0 = flipU ? uMax : uMin;
    const u1 = flipU ? uMin : uMax;
    const v0 = flipV ? vMin : vMax;
    const v1 = flipV ? vMax : vMin;

    // PlaneGeometry の頂点順序
    uvAttribute.setXY(0, u0, v0);
    uvAttribute.setXY(1, u1, v0);
    uvAttribute.setXY(2, u0, v1);
    uvAttribute.setXY(3, u1, v1);
    uvAttribute.needsUpdate = true;

    return geometry;
  }

  /**
   * 編集用の個別ボクセルメッシュを作成
   * 8x8全体で1枚のテクスチャを貼るUV座標を設定
   * @param {number} x - X座標
   * @param {number} y - Y座標
   * @param {number} z - Z座標
   * @param {number} materialIndex - マテリアルインデックス（1-3）
   * @param {THREE.Material} material - マテリアル
   * @param {number} voxelSize - ボクセルサイズ
   * @returns {THREE.Mesh} メッシュ
   */
  createVoxelMesh(x, y, z, materialIndex, material, voxelSize = 1 / 8) {
    const geometry = new this.THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

    // UV座標を8x8グリッド用に設定
    this.setVoxelUV(geometry, x, y, z);

    const mesh = new this.THREE.Mesh(geometry, material);

    // 位置を設定（8x8x8グリッドの中心が原点）
    mesh.position.set(
      (x - 3.5) * voxelSize,
      (y - 3.5) * voxelSize,
      (z - 3.5) * voxelSize
    );

    mesh.userData = { x, y, z, materialIndex };

    return mesh;
  }

  /**
   * ボクセルのUV座標を設定（8x8全体で1枚のテクスチャ）
   * @param {THREE.BoxGeometry} geometry - ボックスジオメトリ
   * @param {number} x - X座標（0-7）
   * @param {number} y - Y座標（0-7）
   * @param {number} z - Z座標（0-7）
   */
  setVoxelUV(geometry, x, y, z) {
    const uvAttribute = geometry.attributes.uv;
    const gridSize = 8;

    // BoxGeometryの面順序: +X, -X, +Y, -Y, +Z, -Z
    // 各面は4頂点（2三角形）

    // UV座標計算用のヘルパー
    const getUV = (u, v) => {
      return {
        uMin: u / gridSize,
        uMax: (u + 1) / gridSize,
        vMin: v / gridSize,
        vMax: (v + 1) / gridSize
      };
    };

    // 各面のUV設定
    // BoxGeometryの頂点順序: [uMax,vMax], [uMin,vMax], [uMax,vMin], [uMin,vMin]
    const setFaceUV = (startIdx, uCoord, vCoord, flipU = false, flipV = false) => {
      const uv = getUV(uCoord, vCoord);
      // デフォルトは左から右（uMin→uMax）で貼る
      let u0 = flipU ? uv.uMax : uv.uMin;
      let u1 = flipU ? uv.uMin : uv.uMax;
      let v0 = flipV ? uv.vMin : uv.vMax;
      let v1 = flipV ? uv.vMax : uv.vMin;

      uvAttribute.setXY(startIdx + 0, u1, v0);
      uvAttribute.setXY(startIdx + 1, u0, v0);
      uvAttribute.setXY(startIdx + 2, u1, v1);
      uvAttribute.setXY(startIdx + 3, u0, v1);
    };

    // +X (right): Z と Y を使用
    setFaceUV(0, 7 - z, y, true, false);
    // -X (left): Z と Y を使用
    setFaceUV(4, z, y, false, false);
    // +Y (top): X と Z を使用
    setFaceUV(8, x, 7 - z, true, false);
    // -Y (bottom): X と Z を使用
    setFaceUV(12, x, z, true, false);
    // +Z (front): X と Y を使用
    setFaceUV(16, x, y, true, false);
    // -Z (back): X と Y を使用
    setFaceUV(20, 7 - x, y, true, false);

    uvAttribute.needsUpdate = true;
  }

  /**
   * グリッドヘルパーを作成（床面のグリッド線）
   * @param {number} gridSize - グリッドサイズ（デフォルト: 8）
   * @param {number} voxelSize - ボクセルサイズ
   * @returns {THREE.GridHelper} グリッドヘルパー
   */
  createGridHelper(gridSize = 8, voxelSize = 1 / 8) {
    const size = gridSize * voxelSize;
    const grid = new this.THREE.GridHelper(size, gridSize, 0x888888, 0x444444);
    grid.position.y = -0.5; // 床面の位置
    return grid;
  }

  /**
   * ワイヤーフレームボックスを作成（ボクセル範囲を示す）
   * @param {number} gridSize - グリッドサイズ
   * @param {number} voxelSize - ボクセルサイズ
   * @returns {THREE.LineSegments} ワイヤーフレーム
   */
  createBoundingBox(gridSize = 8, voxelSize = 1 / 8) {
    const size = gridSize * voxelSize;
    const geometry = new this.THREE.BoxGeometry(size, size, size);
    const edges = new this.THREE.EdgesGeometry(geometry);
    const material = new this.THREE.LineBasicMaterial({ color: 0x666666 });
    return new this.THREE.LineSegments(edges, material);
  }

  /**
   * キャッシュをクリア
   */
  clearCache() {
    this.textureCache.forEach(texture => {
      texture.dispose();
    });
    this.textureCache.clear();
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.CustomBlockMeshBuilder = CustomBlockMeshBuilder;
}
