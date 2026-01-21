/**
 * 標準ブロックメッシュビルダー
 * Three.jsを使用して標準ブロック（立方体）のメッシュを生成する
 */

class StandardBlockMeshBuilder {
  /**
   * コンストラクタ
   * @param {THREE} THREE - Three.jsライブラリ
   */
  constructor(THREE) {
    this.THREE = THREE;
    this.textureLoader = new THREE.TextureLoader();
    this.loadedTextures = new Map();
  }

  /**
   * テクスチャをロード
   * @param {string} textureData - Base64エンコードされたテクスチャデータ
   * @returns {THREE.Texture} ロードされたテクスチャ
   */
  loadTexture(textureData) {
    if (!textureData) return null;

    // キャッシュから取得
    if (this.loadedTextures.has(textureData)) {
      return this.loadedTextures.get(textureData);
    }

    const texture = this.textureLoader.load(textureData);
    texture.magFilter = this.THREE.NearestFilter;
    texture.minFilter = this.THREE.NearestFilter;
    this.loadedTextures.set(textureData, texture);
    return texture;
  }

  /**
   * テクスチャキャッシュをクリア
   */
  clearTextureCache() {
    this.loadedTextures.forEach(texture => texture.dispose());
    this.loadedTextures.clear();
  }

  /**
   * 標準ブロックのメッシュを生成
   * @param {Object} blockData - ブロックデータ
   * @param {Object} textureMap - テクスチャ名とBase64データのマップ
   * @returns {THREE.Mesh} 生成されたメッシュ
   */
  buildMesh(blockData, textureMap) {
    const THREE = this.THREE;
    const geometry = new THREE.BoxGeometry(1, 1, 1);

    // 各面のマテリアルを作成
    // BoxGeometryの面の順序: +X(right), -X(left), +Y(top), -Y(bottom), +Z(front), -Z(back)
    const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    const materials = faceOrder.map(face => {
      const textureName = this.getTextureForFace(blockData, face);
      const textureData = textureName ? textureMap[textureName] : null;
      return this.createMaterial(textureData);
    });

    const mesh = new THREE.Mesh(geometry, materials);
    return mesh;
  }

  /**
   * 特定の面に使用するテクスチャ名を取得
   * @param {Object} blockData - ブロックデータ
   * @param {string} face - 面の名前 (top, bottom, front, back, left, right)
   * @returns {string|null} テクスチャ名
   */
  getTextureForFace(blockData, face) {
    // 面専用のテクスチャがあればそれを使用
    const faceKey = `tex_${face}`;
    if (blockData[faceKey]) {
      return blockData[faceKey];
    }
    // なければデフォルトテクスチャを使用
    return blockData.tex_default || null;
  }

  /**
   * マテリアルを作成
   * @param {string} textureData - Base64エンコードされたテクスチャデータ
   * @returns {THREE.MeshStandardMaterial} マテリアル
   */
  createMaterial(textureData) {
    const THREE = this.THREE;
    const options = {
      side: THREE.FrontSide,
    };

    if (textureData) {
      options.map = this.loadTexture(textureData);
    } else {
      // テクスチャがない場合はグレーの色を使用
      options.color = 0x808080;
    }

    return new THREE.MeshStandardMaterial(options);
  }

  /**
   * ブロックのメッシュを更新（テクスチャ変更時）
   * @param {THREE.Mesh} mesh - 更新対象のメッシュ
   * @param {Object} blockData - ブロックデータ
   * @param {Object} textureMap - テクスチャ名とBase64データのマップ
   */
  updateMesh(mesh, blockData, textureMap) {
    if (!mesh || !mesh.material) return;

    const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];

    // 各面のマテリアルを更新
    faceOrder.forEach((face, index) => {
      const textureName = this.getTextureForFace(blockData, face);
      const textureData = textureName ? textureMap[textureName] : null;

      // 古いマテリアルを破棄
      if (mesh.material[index]) {
        if (mesh.material[index].map) {
          // テクスチャはキャッシュで管理するので破棄しない
        }
        mesh.material[index].dispose();
      }

      // 新しいマテリアルを設定
      mesh.material[index] = this.createMaterial(textureData);
    });
  }

  /**
   * 床面のグリッド線を作成
   * @param {number} size - グリッドのサイズ
   * @returns {THREE.LineSegments} グリッド線
   */
  createFloorOutline(size = 1) {
    const THREE = this.THREE;
    const halfSize = size / 2;

    const points = [
      // 四角形の外枠
      new THREE.Vector3(-halfSize, 0, -halfSize),
      new THREE.Vector3(halfSize, 0, -halfSize),
      new THREE.Vector3(halfSize, 0, -halfSize),
      new THREE.Vector3(halfSize, 0, halfSize),
      new THREE.Vector3(halfSize, 0, halfSize),
      new THREE.Vector3(-halfSize, 0, halfSize),
      new THREE.Vector3(-halfSize, 0, halfSize),
      new THREE.Vector3(-halfSize, 0, -halfSize),
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    return new THREE.LineSegments(geometry, material);
  }

  /**
   * 方向ラベルを作成
   * @param {string} text - 表示するテキスト
   * @param {THREE.Vector3} position - 位置
   * @returns {THREE.Sprite} テキストスプライト
   */
  createDirectionLabel(text, position) {
    const THREE = this.THREE;

    // キャンバスを作成してテキストを描画
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 64;

    context.fillStyle = 'transparent';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.font = 'bold 24px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // テクスチャを作成
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(0.8, 0.4, 1);

    return sprite;
  }

  /**
   * 全ての方向ラベルを作成
   * @param {number} distance - ブロックからの距離
   * @returns {THREE.Group} ラベルグループ
   */
  createAllDirectionLabels(distance = 1) {
    const THREE = this.THREE;
    const group = new THREE.Group();

    const labels = [
      { text: 'FRONT', position: new THREE.Vector3(0, 0, distance) },
      { text: 'BACK', position: new THREE.Vector3(0, 0, -distance) },
      { text: 'LEFT', position: new THREE.Vector3(-distance, 0, 0) },
      { text: 'RIGHT', position: new THREE.Vector3(distance, 0, 0) },
    ];

    labels.forEach(({ text, position }) => {
      const label = this.createDirectionLabel(text, position);
      group.add(label);
    });

    return group;
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.StandardBlockMeshBuilder = StandardBlockMeshBuilder;
}
