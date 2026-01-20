/**
 * 標準ブロック用メッシュ生成ライブラリ
 * Three.jsを使用して各面に異なるテクスチャを持つ立方体メッシュを生成する
 */

class StandardBlockMeshBuilder {
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
   * デフォルトのマテリアルを作成（テクスチャなし用）
   * @returns {THREE.MeshBasicMaterial} マテリアル
   */
  createDefaultMaterial() {
    return new this.THREE.MeshBasicMaterial({
      color: 0x808080,
      side: this.THREE.FrontSide
    });
  }

  /**
   * テクスチャ付きマテリアルを作成
   * @param {string} base64Data - Base64エンコードされた画像データ
   * @returns {THREE.MeshBasicMaterial} マテリアル
   */
  createMaterialFromBase64(base64Data) {
    const texture = this.createTextureFromBase64(base64Data);
    return new this.THREE.MeshBasicMaterial({
      map: texture,
      side: this.THREE.FrontSide
    });
  }

  /**
   * ブロックデータとテクスチャ一覧からメッシュを作成
   * @param {Object} blockData - ブロックデータ
   * @param {Array} textures - テクスチャ一覧
   * @param {number} size - ブロックサイズ（デフォルト: 1）
   * @returns {THREE.Mesh} メッシュ
   */
  createMesh(blockData, textures, size = 1) {
    const geometry = new this.THREE.BoxGeometry(size, size, size);

    // テクスチャをファイル名で検索するヘルパー
    const findTexture = (fileName) => {
      if (!fileName) return null;
      return textures.find(t => t.file_name === fileName);
    };

    // 各面のテクスチャを取得
    const defaultTex = findTexture(blockData.tex_default);
    const topTex = findTexture(blockData.tex_top) || defaultTex;
    const bottomTex = findTexture(blockData.tex_bottom) || defaultTex;
    const frontTex = findTexture(blockData.tex_front) || defaultTex;
    const backTex = findTexture(blockData.tex_back) || defaultTex;
    const leftTex = findTexture(blockData.tex_left) || defaultTex;
    const rightTex = findTexture(blockData.tex_right) || defaultTex;

    // マテリアルを作成するヘルパー
    const createMat = (tex) => {
      if (tex && tex.image_base64) {
        return this.createMaterialFromBase64(tex.image_base64);
      }
      return this.createDefaultMaterial();
    };

    // Three.js BoxGeometry の面順序:
    // 0: +X (right), 1: -X (left), 2: +Y (top), 3: -Y (bottom), 4: +Z (front), 5: -Z (back)
    const materials = [
      createMat(rightTex),   // +X: right
      createMat(leftTex),    // -X: left
      createMat(topTex),     // +Y: top
      createMat(bottomTex),  // -Y: bottom
      createMat(frontTex),   // +Z: front
      createMat(backTex),    // -Z: back
    ];

    const mesh = new this.THREE.Mesh(geometry, materials);
    return mesh;
  }

  /**
   * 個別のテクスチャデータから直接メッシュを作成
   * @param {Object} textureData - 面ごとのテクスチャBase64データ
   * @param {number} size - ブロックサイズ
   * @returns {THREE.Mesh} メッシュ
   */
  createMeshFromTextures(textureData, size = 1) {
    const geometry = new this.THREE.BoxGeometry(size, size, size);

    // マテリアルを作成するヘルパー
    const createMat = (base64) => {
      if (base64) {
        return this.createMaterialFromBase64(base64);
      }
      return this.createDefaultMaterial();
    };

    const defaultBase64 = textureData.default || null;

    // Three.js BoxGeometry の面順序
    const materials = [
      createMat(textureData.right || defaultBase64),   // +X: right
      createMat(textureData.left || defaultBase64),    // -X: left
      createMat(textureData.top || defaultBase64),     // +Y: top
      createMat(textureData.bottom || defaultBase64),  // -Y: bottom
      createMat(textureData.front || defaultBase64),   // +Z: front
      createMat(textureData.back || defaultBase64),    // -Z: back
    ];

    const mesh = new this.THREE.Mesh(geometry, materials);
    return mesh;
  }

  /**
   * メッシュの特定の面のテクスチャを更新
   * @param {THREE.Mesh} mesh - 更新対象のメッシュ
   * @param {string} face - 面名（top, bottom, front, back, left, right）
   * @param {string|null} base64Data - テクスチャのBase64データ（nullの場合デフォルト）
   * @param {string|null} defaultBase64 - デフォルトテクスチャのBase64データ
   */
  updateFaceTexture(mesh, face, base64Data, defaultBase64 = null) {
    const faceIndex = {
      'right': 0,
      'left': 1,
      'top': 2,
      'bottom': 3,
      'front': 4,
      'back': 5
    };

    const index = faceIndex[face];
    if (index === undefined) return;

    // 古いマテリアルを破棄
    if (mesh.material[index]) {
      if (mesh.material[index].map) {
        mesh.material[index].map.dispose();
      }
      mesh.material[index].dispose();
    }

    // 新しいマテリアルを作成
    const texData = base64Data || defaultBase64;
    if (texData) {
      mesh.material[index] = this.createMaterialFromBase64(texData);
    } else {
      mesh.material[index] = this.createDefaultMaterial();
    }
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
  window.StandardBlockMeshBuilder = StandardBlockMeshBuilder;
}
