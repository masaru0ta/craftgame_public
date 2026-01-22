/**
 * 標準ブロック用メッシュ生成ライブラリ
 * Three.jsを使用してブロックのメッシュを生成する
 */
class StandardBlockMeshBuilder {
  /**
   * @param {Object} THREE - Three.jsライブラリ
   */
  constructor(THREE) {
    this.THREE = THREE;
    // デフォルトテクスチャ（紫色）
    this.defaultColor = 0x8800ff;
  }

  /**
   * ブロックメッシュを生成
   * @param {Object} textures - テクスチャ設定 { default, front, top, bottom, left, right, back }
   * @param {Object} textureImages - テクスチャ画像データ { textureName: imageBase64 }
   * @returns {THREE.Mesh} 生成されたメッシュ
   */
  createBlockMesh(textures = {}, textureImages = {}) {
    const THREE = this.THREE;
    const geometry = new THREE.BoxGeometry(1, 1, 1);

    // 面の順序: right(+X), left(-X), top(+Y), bottom(-Y), front(+Z), back(-Z)
    const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    const materials = faceOrder.map(face => {
      return this._createMaterial(face, textures, textureImages);
    });

    const mesh = new THREE.Mesh(geometry, materials);
    return mesh;
  }

  /**
   * 特定の面のマテリアルを作成
   * @param {string} face - 面の名前
   * @param {Object} textures - テクスチャ設定
   * @param {Object} textureImages - テクスチャ画像データ
   * @returns {THREE.MeshBasicMaterial} マテリアル
   */
  _createMaterial(face, textures, textureImages) {
    const THREE = this.THREE;
    const textureName = textures[face] || textures.default;

    if (textureName && textureImages[textureName]) {
      const texture = this._loadTexture(textureImages[textureName]);
      return new THREE.MeshBasicMaterial({ map: texture });
    }

    // テクスチャがない場合はデフォルト色
    return new THREE.MeshBasicMaterial({ color: this.defaultColor });
  }

  /**
   * Base64画像からテクスチャを読み込み
   * @param {string} base64 - Base64エンコードされた画像データ
   * @returns {THREE.Texture} テクスチャ
   */
  _loadTexture(base64) {
    const THREE = this.THREE;
    const texture = new THREE.TextureLoader().load(base64);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
  }

  /**
   * ブロックメッシュのテクスチャを更新
   * @param {THREE.Mesh} mesh - 更新対象のメッシュ
   * @param {string} face - 面の名前
   * @param {string|null} textureName - テクスチャ名（nullの場合は解除）
   * @param {Object} textures - 現在のテクスチャ設定
   * @param {Object} textureImages - テクスチャ画像データ
   */
  updateFaceTexture(mesh, face, textureName, textures, textureImages) {
    const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    const faceIndex = faceOrder.indexOf(face);
    if (faceIndex === -1) return;

    // 新しいテクスチャ設定を作成
    const newTextures = { ...textures };
    if (textureName) {
      newTextures[face] = textureName;
    } else {
      delete newTextures[face];
    }

    // マテリアルを更新
    const material = this._createMaterial(face, newTextures, textureImages);
    if (Array.isArray(mesh.material)) {
      // 古いマテリアルを破棄
      if (mesh.material[faceIndex].map) {
        mesh.material[faceIndex].map.dispose();
      }
      mesh.material[faceIndex].dispose();
      mesh.material[faceIndex] = material;
    }
  }

  /**
   * すべてのテクスチャを更新
   * @param {THREE.Mesh} mesh - 更新対象のメッシュ
   * @param {Object} textures - テクスチャ設定
   * @param {Object} textureImages - テクスチャ画像データ
   */
  updateAllTextures(mesh, textures, textureImages) {
    const THREE = this.THREE;
    const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];

    // 古いマテリアルを破棄
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(mat => {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
    }

    // 新しいマテリアルを作成
    const materials = faceOrder.map(face => {
      return this._createMaterial(face, textures, textureImages);
    });
    mesh.material = materials;
  }

  /**
   * メッシュのリソースを解放
   * @param {THREE.Mesh} mesh - 解放対象のメッシュ
   */
  disposeMesh(mesh) {
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(mat => {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
    } else if (mesh.material) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    }
  }
}
