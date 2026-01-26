/**
 * BlockThumbnail
 * ブロックのサムネイル画像を生成するユーティリティクラス
 * ゲーム内のアイテムプレビュー等でも利用可能
 */
class BlockThumbnail {
  /**
   * @param {Object} options
   * @param {Object} options.THREE - Three.jsライブラリ
   * @param {number} [options.size=64] - 出力画像サイズ（px）
   * @param {string|null} [options.backgroundColor='#1a237e'] - 背景色（nullで透明）
   */
  constructor(options) {
    this.THREE = options.THREE;
    this.size = options.size || 64;
    this.backgroundColor = options.backgroundColor !== undefined ? options.backgroundColor : '#1a237e';

    // Three.js オブジェクト
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // メッシュビルダー
    this.standardMeshBuilder = null;
    this.customMeshBuilder = null;

    // カメラ設定（サムネイル用に近づけて表示）
    this.cameraDistance = 2.2;
    this.horizontalAngle = 0;
    this.verticalAngle = 20;

    this._init();
  }

  /**
   * シーン・カメラ・レンダラーを初期化
   * @private
   */
  _init() {
    const THREE = this.THREE;

    // シーン作成
    this.scene = new THREE.Scene();
    if (this.backgroundColor) {
      this.scene.background = new THREE.Color(this.backgroundColor);
    } else {
      this.scene.background = null;
    }

    // カメラ作成
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this._updateCameraPosition();

    // レンダラー作成（オフスクリーン）
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: this.backgroundColor === null,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(this.size, this.size);
    this.renderer.setPixelRatio(1);

    // メッシュビルダー初期化
    if (typeof StandardBlockMeshBuilder !== 'undefined') {
      this.standardMeshBuilder = new StandardBlockMeshBuilder(THREE);
    }
    if (typeof CustomBlockMeshBuilder !== 'undefined') {
      this.customMeshBuilder = new CustomBlockMeshBuilder(THREE);
    }
  }

  /**
   * カメラ位置を更新
   * @private
   */
  _updateCameraPosition() {
    const THREE = this.THREE;
    const hRad = THREE.MathUtils.degToRad(this.horizontalAngle);
    const vRad = THREE.MathUtils.degToRad(this.verticalAngle);

    const x = this.cameraDistance * Math.cos(vRad) * Math.sin(hRad);
    const y = this.cameraDistance * Math.sin(vRad) + 0.5;
    const z = this.cameraDistance * Math.cos(vRad) * Math.cos(hRad);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0.5, 0);
  }

  /**
   * テクスチャ画像データのマップを作成
   * @private
   * @param {Array} textures - テクスチャ一覧
   * @returns {Object} { textureName: imageBase64 }
   */
  _buildTextureImages(textures) {
    const textureImages = {};
    for (const tex of textures) {
      if (tex.file_name && tex.image_base64) {
        textureImages[tex.file_name] = tex.image_base64;
      }
    }
    return textureImages;
  }

  /**
   * サムネイル画像を生成
   * @param {Object} blockData - ブロックデータ
   * @param {Array} textures - テクスチャ一覧
   * @returns {Promise<string>} Data URL (PNG形式)
   */
  async generate(blockData, textures) {
    // シーンをクリア（カメラ以外）
    this._clearScene();

    const textureImages = this._buildTextureImages(textures || []);
    const shapeType = blockData.shape_type || 'normal';

    let mesh = null;

    if (shapeType === 'custom' && this.customMeshBuilder) {
      // カスタムブロック
      mesh = await this._createCustomBlockMesh(blockData, textureImages);
    } else if (this.standardMeshBuilder) {
      // 標準ブロック
      mesh = await this._createStandardBlockMesh(blockData, textureImages);
    }

    if (mesh) {
      mesh.position.set(0, 0.5, 0);
      this.scene.add(mesh);
    }

    // レンダリング
    this.renderer.render(this.scene, this.camera);

    // Data URLを取得
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    // メッシュを破棄
    if (mesh) {
      this.scene.remove(mesh);
      this._disposeMesh(mesh);
    }

    return dataUrl;
  }

  /**
   * シーンをクリア
   * @private
   */
  _clearScene() {
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
      this.scene.remove(obj);
      this._disposeMesh(obj);
    }
  }

  /**
   * メッシュを破棄
   * @private
   * @param {Object} mesh
   */
  _disposeMesh(mesh) {
    if (!mesh) return;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      } else {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
      }
    }

    // 子要素も破棄
    if (mesh.children) {
      mesh.children.forEach(child => this._disposeMesh(child));
    }
  }

  /**
   * 標準ブロックのメッシュを作成
   * @private
   * @param {Object} blockData
   * @param {Object} textureImages
   * @returns {Promise<Object>} Three.js Mesh
   */
  async _createStandardBlockMesh(blockData, textureImages) {
    const THREE = this.THREE;
    const textures = {};
    const slots = ['default', 'front', 'top', 'bottom', 'left', 'right', 'back'];
    for (const slot of slots) {
      const key = slot === 'default' ? 'tex_default' : `tex_${slot}`;
      if (blockData[key]) {
        textures[slot] = blockData[key];
      }
    }

    // 同期的にテクスチャを読み込んでメッシュを作成
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];

    const materials = await Promise.all(faceOrder.map(async (face) => {
      const textureName = textures[face] || textures.default;
      if (textureName && textureImages[textureName]) {
        const texture = await this._loadTextureAsync(textureImages[textureName]);
        return new THREE.MeshBasicMaterial({ map: texture });
      }
      return new THREE.MeshBasicMaterial({ color: 0x808080 });
    }));

    return new THREE.Mesh(geometry, materials);
  }

  /**
   * テクスチャを非同期で読み込み（完了を待つ）
   * @private
   * @param {string} base64 - Base64画像データ
   * @returns {Promise<THREE.Texture>}
   */
  _loadTextureAsync(base64) {
    return new Promise((resolve) => {
      const THREE = this.THREE;
      const img = new Image();
      img.onload = () => {
        const texture = new THREE.Texture(img);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.needsUpdate = true;
        resolve(texture);
      };
      img.onerror = () => {
        // エラー時は空のテクスチャ
        resolve(new THREE.Texture());
      };
      img.src = base64;
    });
  }

  /**
   * カスタムブロックのメッシュを作成
   * @private
   * @param {Object} blockData
   * @param {Object} textureImages
   * @returns {Promise<Object>} Three.js Group
   */
  async _createCustomBlockMesh(blockData, textureImages) {
    const THREE = this.THREE;

    // マテリアル名を取得
    const materialNames = [
      blockData.material_1 || '',
      blockData.material_2 || '',
      blockData.material_3 || ''
    ];

    // マテリアルを作成（テクスチャ読み込み完了を待つ）
    const materials = await Promise.all(materialNames.map(async (name) => {
      if (name && textureImages[name]) {
        const texture = await this._loadTextureAsync(textureImages[name]);
        return new THREE.MeshBasicMaterial({
          map: texture,
          transparent: false,
          vertexColors: true
        });
      }
      return new THREE.MeshBasicMaterial({ color: 0x808080, vertexColors: true });
    }));

    // VoxelData をデコード
    const voxelData = VoxelData.decode(blockData.voxel_look || '');

    // メッシュを生成
    return this.customMeshBuilder.buildWithUV(voxelData, materials);
  }

  /**
   * リソースを解放
   */
  dispose() {
    this._clearScene();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
    this.standardMeshBuilder = null;
    this.customMeshBuilder = null;
  }
}
