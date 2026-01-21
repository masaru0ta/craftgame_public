/**
 * カスタムブロックメッシュビルダー
 * 8x8x8ボクセルデータからThree.jsメッシュを生成する
 *
 * UV座標マッピング:
 * - 8x8x8のボクセルグリッドに1枚のテクスチャを貼る
 * - 各ボクセルはテクスチャの1/64（8x8分割の1つ）を表示
 */

class CustomBlockMeshBuilder {
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
    texture.wrapS = this.THREE.ClampToEdgeWrapping;
    texture.wrapT = this.THREE.ClampToEdgeWrapping;
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
   * カスタムブロックのメッシュを生成
   * @param {number[][][]} voxelData - 8x8x8のボクセルデータ
   * @param {Object} materialTextures - マテリアル番号(1,2,3)とテクスチャデータのマップ
   * @returns {THREE.Group} 生成されたメッシュグループ
   */
  buildMesh(voxelData, materialTextures) {
    const THREE = this.THREE;
    const group = new THREE.Group();

    if (!voxelData) return group;

    // マテリアルを作成（マテリアル1,2,3用）
    const materials = {};
    for (let m = 1; m <= 3; m++) {
      const textureData = materialTextures[m];
      materials[m] = this.createMaterial(textureData);
    }

    // 各ボクセルを処理
    for (let y = 0; y < 8; y++) {
      for (let z = 0; z < 8; z++) {
        for (let x = 0; x < 8; x++) {
          const value = voxelData[y][z][x];
          if (value === 0) continue; // 空気はスキップ

          // ボクセルのメッシュを作成
          const voxelMesh = this.createVoxelMesh(x, y, z, value, voxelData, materials);
          if (voxelMesh) {
            group.add(voxelMesh);
          }
        }
      }
    }

    return group;
  }

  /**
   * 個別ボクセルのメッシュを作成
   * @param {number} x - X座標（0-7）
   * @param {number} y - Y座標（0-7）
   * @param {number} z - Z座標（0-7）
   * @param {number} material - マテリアル番号（1-3）
   * @param {number[][][]} voxelData - ボクセルデータ
   * @param {Object} materials - マテリアルマップ
   * @returns {THREE.Mesh|null} 生成されたメッシュ
   */
  createVoxelMesh(x, y, z, material, voxelData, materials) {
    const THREE = this.THREE;
    const voxelSize = 1 / 8; // 全体を1として各ボクセルは1/8

    const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

    // UV座標を設定
    this.setVoxelUV(geometry, x, y, z);

    // 面ごとの明るさを設定（頂点カラー）
    this.setFaceBrightness(geometry);

    // メッシュを作成
    const mesh = new THREE.Mesh(geometry, materials[material]);

    // 位置を設定（中心を原点にするため-0.5から+0.5の範囲に配置）
    const offset = -0.5 + voxelSize / 2;
    mesh.position.set(
      offset + x * voxelSize,
      offset + y * voxelSize,
      offset + z * voxelSize
    );

    return mesh;
  }

  /**
   * 面ごとの明るさを頂点カラーで設定
   * BoxGeometryの面順序: +X(right), -X(left), +Y(top), -Y(bottom), +Z(front), -Z(back)
   * @param {THREE.BoxGeometry} geometry - ジオメトリ
   */
  setFaceBrightness(geometry) {
    const THREE = this.THREE;

    // 面ごとの明るさ（0.0〜1.0）
    // +X, -X: 側面（やや暗い）
    // +Y: 上面（明るい）
    // -Y: 底面（暗い）
    // +Z, -Z: 前後面（中間）
    const faceBrightness = [
      0.75, // +X (right)
      0.75, // -X (left)
      1.0,  // +Y (top) - 最も明るい
      0.5,  // -Y (bottom) - 最も暗い
      0.85, // +Z (front)
      0.85  // -Z (back)
    ];

    // 頂点カラー配列を作成（各面4頂点 × 6面 = 24頂点）
    const colors = [];
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
      const brightness = faceBrightness[faceIdx];
      // 各面は4頂点
      for (let v = 0; v < 4; v++) {
        colors.push(brightness, brightness, brightness);
      }
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }

  /**
   * ボクセルのUV座標を設定
   * @param {THREE.BoxGeometry} geometry - ジオメトリ
   * @param {number} x - X座標（0-7）
   * @param {number} y - Y座標（0-7）
   * @param {number} z - Z座標（0-7）
   */
  setVoxelUV(geometry, x, y, z) {
    const uvAttribute = geometry.attributes.uv;

    // 各面のUV座標を計算して設定
    // BoxGeometryの面順序: +X(right), -X(left), +Y(top), -Y(bottom), +Z(front), -Z(back)

    // +X (right): U = 7-z, V = y
    this.setFaceUV(uvAttribute, 0, 7 - z, y, true, false);

    // -X (left): U = z, V = y
    this.setFaceUV(uvAttribute, 4, z, y, true, false);

    // +Y (top): U = x, V = 7-z
    this.setFaceUV(uvAttribute, 8, x, 7 - z, true, false);

    // -Y (bottom): U = x, V = z
    this.setFaceUV(uvAttribute, 12, x, z, true, false);

    // +Z (front): U = x, V = y
    this.setFaceUV(uvAttribute, 16, x, y, true, false);

    // -Z (back): U = 7-x, V = y
    this.setFaceUV(uvAttribute, 20, 7 - x, y, true, false);

    uvAttribute.needsUpdate = true;
  }

  /**
   * 面のUV座標を設定
   * @param {THREE.BufferAttribute} uvAttribute - UV属性
   * @param {number} startIdx - 開始インデックス
   * @param {number} uCoord - U座標（0-7）
   * @param {number} vCoord - V座標（0-7）
   * @param {boolean} flipU - U座標を反転するか
   * @param {boolean} flipV - V座標を反転するか
   */
  setFaceUV(uvAttribute, startIdx, uCoord, vCoord, flipU = false, flipV = false) {
    const uMin = uCoord / 8;
    const uMax = (uCoord + 1) / 8;
    const vMin = vCoord / 8;
    const vMax = (vCoord + 1) / 8;

    // flipUがtrueの場合、uMaxから始める（左右反転防止）
    const u0 = flipU ? uMax : uMin;
    const u1 = flipU ? uMin : uMax;
    const v0 = flipV ? vMin : vMax;
    const v1 = flipV ? vMax : vMin;

    // BoxGeometryの頂点順序に合わせて設定
    uvAttribute.setXY(startIdx + 0, u1, v0);
    uvAttribute.setXY(startIdx + 1, u0, v0);
    uvAttribute.setXY(startIdx + 2, u1, v1);
    uvAttribute.setXY(startIdx + 3, u0, v1);
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
      vertexColors: true, // 頂点カラーを有効化（面ごとの明るさ用）
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
   * メッシュを更新（ボクセルデータ変更時）
   * @param {THREE.Group} group - 更新対象のグループ
   * @param {number[][][]} voxelData - 新しいボクセルデータ
   * @param {Object} materialTextures - マテリアルテクスチャマップ
   */
  updateMesh(group, voxelData, materialTextures) {
    // 既存のメッシュを全て削除
    while (group.children.length > 0) {
      const child = group.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      group.remove(child);
    }

    // 新しいメッシュを生成
    const newGroup = this.buildMesh(voxelData, materialTextures);
    while (newGroup.children.length > 0) {
      const child = newGroup.children[0];
      newGroup.remove(child);
      group.add(child);
    }
  }

  /**
   * 床面のグリッド線を作成（8x8グリッド）
   * @param {number} size - グリッド全体のサイズ（デフォルト1）
   * @returns {THREE.LineSegments} グリッド線
   */
  createFloorGrid(size = 1) {
    const THREE = this.THREE;
    const halfSize = size / 2;
    const step = size / 8;

    const points = [];

    // グリッド線（X方向）
    for (let i = 0; i <= 8; i++) {
      const z = -halfSize + i * step;
      points.push(new THREE.Vector3(-halfSize, 0, z));
      points.push(new THREE.Vector3(halfSize, 0, z));
    }

    // グリッド線（Z方向）
    for (let i = 0; i <= 8; i++) {
      const x = -halfSize + i * step;
      points.push(new THREE.Vector3(x, 0, -halfSize));
      points.push(new THREE.Vector3(x, 0, halfSize));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true });
    return new THREE.LineSegments(geometry, material);
  }

  /**
   * 床面の外枠を作成
   * @param {number} size - サイズ
   * @returns {THREE.LineSegments} 外枠線
   */
  createFloorOutline(size = 1) {
    const THREE = this.THREE;
    const halfSize = size / 2;

    const points = [
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

  /**
   * ボクセルハイライトメッシュを作成
   * @param {number} brushSize - ブラシサイズ（1, 2, 4）
   * @returns {Object} ハイライト用のメッシュとエッジ
   */
  createHighlight(brushSize = 1) {
    const THREE = this.THREE;
    const voxelSize = 1 / 8;
    const size = voxelSize * brushSize;

    // 面のハイライト（緑、半透明）
    const faceGeometry = new THREE.PlaneGeometry(size, size);
    const faceMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial);
    faceMesh.visible = false;

    // 辺のハイライト（赤）
    const edgeGeometry = new THREE.BoxGeometry(size, size, size);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(edgeGeometry),
      edgeMaterial
    );
    edges.visible = false;

    return { face: faceMesh, edges };
  }

  /**
   * ハイライトを更新
   * @param {Object} highlight - ハイライトオブジェクト
   * @param {number} brushSize - 新しいブラシサイズ
   */
  updateHighlightSize(highlight, brushSize) {
    const THREE = this.THREE;
    const voxelSize = 1 / 8;
    const size = voxelSize * brushSize;

    // 面のジオメトリを更新
    highlight.face.geometry.dispose();
    highlight.face.geometry = new THREE.PlaneGeometry(size, size);

    // エッジのジオメトリを更新
    const oldEdgeGeometry = highlight.edges.geometry;
    const boxGeometry = new THREE.BoxGeometry(size, size, size);
    highlight.edges.geometry = new THREE.EdgesGeometry(boxGeometry);
    oldEdgeGeometry.dispose();
    boxGeometry.dispose();
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.CustomBlockMeshBuilder = CustomBlockMeshBuilder;
}
