/**
 * カスタムブロックエディタ UI
 * 8x8x8ボクセルの3Dプレビュー、編集、マテリアル選択を管理
 */

class CustomBlockEditor {
  /**
   * コンストラクタ
   * @param {Object} options - オプション
   * @param {HTMLElement} options.container - 3Dプレビューのコンテナ要素
   * @param {THREE} options.THREE - Three.jsライブラリ
   */
  constructor(options) {
    this.container = options.container;
    this.THREE = options.THREE;
    this.meshBuilder = new CustomBlockMeshBuilder(this.THREE);

    // 状態
    this.currentBlock = null;
    this.voxelData = VoxelData.createEmpty();
    this.textureMap = {};
    this.textureList = [];
    this.blockMesh = null;

    // マテリアル設定
    this.materialTextures = { 1: null, 2: null, 3: null };
    this.currentMaterial = 1;
    this.brushSize = 1;

    // カメラ制御
    this.cameraDistance = 3;
    this.cameraTheta = 0;
    this.cameraPhi = Math.PI / 9; // 約20度
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // レイキャスト用
    this.raycaster = new this.THREE.Raycaster();
    this.mouse = new this.THREE.Vector2();
    this.highlightedVoxel = null;
    this.highlightedFace = null;

    // イベントコールバック
    this.onVoxelChange = null;
    this.onMaterialChange = null;

    // 背景色の設定
    this.bgColors = [0x000000, 0x4169e1, 0x228b22];
    this.currentBgColorIndex = 0;

    // Three.js初期化
    this.initThree();
    this.initEventListeners();
    this.animate();
  }

  /**
   * Three.js を初期化
   */
  initThree() {
    const THREE = this.THREE;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || width;

    // シーン
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // カメラ
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.updateCameraPosition();

    // レンダラー
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);

    // 床面のグリッド（8x8）
    this.floorGrid = this.meshBuilder.createFloorGrid(1);
    this.floorGrid.position.y = -0.5;
    this.scene.add(this.floorGrid);

    // 床面の外枠
    this.floorOutline = this.meshBuilder.createFloorOutline(1);
    this.floorOutline.position.y = -0.5;
    this.scene.add(this.floorOutline);

    // 方向ラベル
    this.directionLabels = this.meshBuilder.createAllDirectionLabels(1);
    this.directionLabels.position.y = -0.5;
    this.scene.add(this.directionLabels);

    // ハイライト用メッシュ
    this.highlight = this.meshBuilder.createHighlight(this.brushSize);
    this.scene.add(this.highlight.face);
    this.scene.add(this.highlight.edges);

    // 床面のレイキャスト用プレーン（非表示）
    const floorGeometry = new THREE.PlaneGeometry(1, 1);
    floorGeometry.rotateX(-Math.PI / 2);
    const floorMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
    this.floorPlane.position.y = -0.5;
    this.scene.add(this.floorPlane);

    // ボクセルメッシュグループ
    this.blockMesh = new THREE.Group();
    this.scene.add(this.blockMesh);
  }

  /**
   * イベントリスナーを初期化
   */
  initEventListeners() {
    const canvas = this.renderer.domElement;

    // マウスダウン
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // 左クリック開始（ドラッグか削除か判定用）
        this.isDragging = false;
        this.mouseDownTime = Date.now();
        this.mouseDownPos = { x: e.clientX, y: e.clientY };
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    // マウス移動
    canvas.addEventListener('mousemove', (e) => {
      this.updateMousePosition(e);
      this.updateHighlight();

      // 左ボタン押下中でマウス移動した場合はドラッグ
      if (e.buttons === 1 && this.mouseDownPos) {
        const dx = e.clientX - this.mouseDownPos.x;
        const dy = e.clientY - this.mouseDownPos.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this.isDragging = true;
        }
      }

      // ドラッグ中は視点回転
      if (this.isDragging && e.buttons === 1) {
        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;

        this.cameraTheta -= deltaX * 0.01;
        this.cameraPhi += deltaY * 0.01;
        this.cameraPhi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPhi));

        this.updateCameraPosition();
      }

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    // マウスアップ
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0 && !this.isDragging) {
        // ドラッグでなければ削除
        this.deleteVoxel();
      }
      this.isDragging = false;
      this.mouseDownPos = null;
    });

    // 右クリックで配置
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.placeVoxel();
    });

    // マウスホイールで拡大縮小
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance += e.deltaY * 0.005;
      this.cameraDistance = Math.max(1.5, Math.min(10, this.cameraDistance));
      this.updateCameraPosition();
    });

    // キーボード（マテリアル切り替え）
    window.addEventListener('keydown', (e) => {
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        this.setCurrentMaterial(parseInt(e.key));
      }
    });

    // リサイズ対応
    window.addEventListener('resize', () => {
      this.handleResize();
    });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }
  }

  /**
   * マウス位置を更新
   */
  updateMousePosition(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * ハイライトを更新
   */
  updateHighlight() {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // ボクセルとの交差判定
    const voxelMeshes = this.blockMesh.children;
    const intersects = this.raycaster.intersectObjects(voxelMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      this.showVoxelHighlight(hit);
    } else {
      // 床面との交差判定
      const floorIntersects = this.raycaster.intersectObject(this.floorPlane);
      if (floorIntersects.length > 0) {
        this.showFloorHighlight(floorIntersects[0]);
      } else {
        this.hideHighlight();
      }
    }
  }

  /**
   * ボクセルハイライトを表示
   */
  showVoxelHighlight(hit) {
    const voxelSize = 1 / 8;
    const offset = -0.5 + voxelSize / 2;

    // ヒットしたボクセルの座標を取得
    const pos = hit.object.position;
    const x = Math.round((pos.x - offset) / voxelSize);
    const y = Math.round((pos.y - offset) / voxelSize);
    const z = Math.round((pos.z - offset) / voxelSize);

    this.highlightedVoxel = { x, y, z };

    // ヒット面の法線から配置位置を決定
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);

    this.highlightedFace = {
      normal: normal,
      point: hit.point.clone()
    };

    // ブラシサイズに応じたグリッドにスナップした位置を計算
    let snappedX = this.snapToGrid(x);
    let snappedY = this.snapToGrid(y);
    let snappedZ = this.snapToGrid(z);

    // 範囲チェック
    snappedX = Math.max(0, Math.min(8 - this.brushSize, snappedX));
    snappedY = Math.max(0, Math.min(8 - this.brushSize, snappedY));
    snappedZ = Math.max(0, Math.min(8 - this.brushSize, snappedZ));

    // エッジの位置を更新（スナップされた位置の中心）
    const edgeCenterX = offset + (snappedX + this.brushSize / 2 - 0.5) * voxelSize;
    const edgeCenterY = offset + (snappedY + this.brushSize / 2 - 0.5) * voxelSize;
    const edgeCenterZ = offset + (snappedZ + this.brushSize / 2 - 0.5) * voxelSize;
    this.highlight.edges.position.set(edgeCenterX, edgeCenterY, edgeCenterZ);
    this.highlight.edges.visible = true;

    // 面の位置と回転を更新
    const faceOffset = voxelSize * this.brushSize / 2 + 0.001;
    this.highlight.face.position.set(edgeCenterX, edgeCenterY, edgeCenterZ);
    this.highlight.face.position.add(normal.clone().multiplyScalar(faceOffset));

    // 面の向きを法線に合わせる
    this.highlight.face.lookAt(
      this.highlight.face.position.clone().add(normal)
    );
    this.highlight.face.visible = true;
  }

  /**
   * 床面ハイライトを表示
   */
  showFloorHighlight(hit) {
    const voxelSize = 1 / 8;
    const halfSize = 0.5;

    // グリッド座標を計算
    let x = Math.floor((hit.point.x + halfSize) / voxelSize);
    let z = Math.floor((hit.point.z + halfSize) / voxelSize);

    // ブラシサイズに応じたグリッドにスナップ
    x = this.snapToGrid(x);
    z = this.snapToGrid(z);

    // 範囲チェック
    x = Math.max(0, Math.min(8 - this.brushSize, x));
    z = Math.max(0, Math.min(8 - this.brushSize, z));

    this.highlightedVoxel = null;
    this.highlightedFace = {
      floor: true,
      x: x,
      z: z
    };

    // 床面上のハイライト位置
    const centerX = -halfSize + (x + this.brushSize / 2) * voxelSize;
    const centerZ = -halfSize + (z + this.brushSize / 2) * voxelSize;

    this.highlight.face.position.set(centerX, -0.5 + 0.001, centerZ);
    this.highlight.face.rotation.set(-Math.PI / 2, 0, 0);
    this.highlight.face.visible = true;
    this.highlight.edges.visible = false;
  }

  /**
   * ハイライトを非表示
   */
  hideHighlight() {
    this.highlight.face.visible = false;
    this.highlight.edges.visible = false;
    this.highlightedVoxel = null;
    this.highlightedFace = null;
  }

  /**
   * ボクセルを配置
   */
  placeVoxel() {
    if (!this.highlightedFace) return;

    const voxelSize = 1 / 8;
    const offset = -0.5 + voxelSize / 2;
    let placed = false;

    if (this.highlightedFace.floor) {
      // 床面からの配置（座標は既にスナップ済み）
      const baseX = this.highlightedFace.x;
      const baseZ = this.highlightedFace.z;

      // ブラシサイズ分のボクセルを配置（X, Y, Z全方向）
      for (let dx = 0; dx < this.brushSize; dx++) {
        for (let dy = 0; dy < this.brushSize; dy++) {
          for (let dz = 0; dz < this.brushSize; dz++) {
            const x = baseX + dx;
            const y = dy;
            const z = baseZ + dz;
            if (VoxelData.isValidPosition(x, y, z)) {
              VoxelData.set(this.voxelData, x, y, z, this.currentMaterial);
              placed = true;
            }
          }
        }
      }
    } else if (this.highlightedVoxel) {
      // 既存ボクセルに隣接して配置
      const normal = this.highlightedFace.normal;
      const nx = Math.round(normal.x);
      const ny = Math.round(normal.y);
      const nz = Math.round(normal.z);

      // 配置先の基準座標を計算
      let baseX = this.highlightedVoxel.x + nx;
      let baseY = this.highlightedVoxel.y + ny;
      let baseZ = this.highlightedVoxel.z + nz;

      // ブラシサイズに応じたグリッドにスナップ
      baseX = this.snapToGrid(baseX);
      baseY = this.snapToGrid(baseY);
      baseZ = this.snapToGrid(baseZ);

      // 範囲チェック
      baseX = Math.max(0, Math.min(8 - this.brushSize, baseX));
      baseY = Math.max(0, Math.min(8 - this.brushSize, baseY));
      baseZ = Math.max(0, Math.min(8 - this.brushSize, baseZ));

      // ブラシサイズ分のボクセルを配置
      for (let dx = 0; dx < this.brushSize; dx++) {
        for (let dy = 0; dy < this.brushSize; dy++) {
          for (let dz = 0; dz < this.brushSize; dz++) {
            const px = baseX + dx;
            const py = baseY + dy;
            const pz = baseZ + dz;

            if (VoxelData.isValidPosition(px, py, pz)) {
              VoxelData.set(this.voxelData, px, py, pz, this.currentMaterial);
              placed = true;
            }
          }
        }
      }
    }

    if (placed) {
      this.rebuildMesh();
      if (this.onVoxelChange) {
        this.onVoxelChange(this.voxelData);
      }
    }
  }

  /**
   * ボクセルを削除
   */
  deleteVoxel() {
    if (!this.highlightedVoxel) return;

    const { x, y, z } = this.highlightedVoxel;
    let deleted = false;

    // ブラシサイズに応じたグリッドにスナップ
    let baseX = this.snapToGrid(x);
    let baseY = this.snapToGrid(y);
    let baseZ = this.snapToGrid(z);

    // 範囲チェック
    baseX = Math.max(0, Math.min(8 - this.brushSize, baseX));
    baseY = Math.max(0, Math.min(8 - this.brushSize, baseY));
    baseZ = Math.max(0, Math.min(8 - this.brushSize, baseZ));

    // ブラシサイズ分のボクセルを削除
    for (let dx = 0; dx < this.brushSize; dx++) {
      for (let dy = 0; dy < this.brushSize; dy++) {
        for (let dz = 0; dz < this.brushSize; dz++) {
          const px = baseX + dx;
          const py = baseY + dy;
          const pz = baseZ + dz;
          if (VoxelData.isValidPosition(px, py, pz) && VoxelData.get(this.voxelData, px, py, pz) !== 0) {
            VoxelData.set(this.voxelData, px, py, pz, 0);
            deleted = true;
          }
        }
      }
    }

    if (deleted) {
      this.rebuildMesh();
      this.updateHighlight();
      if (this.onVoxelChange) {
        this.onVoxelChange(this.voxelData);
      }
    }
  }

  /**
   * メッシュを再構築
   */
  rebuildMesh() {
    this.meshBuilder.updateMesh(this.blockMesh, this.voxelData, this.materialTextures);
  }

  /**
   * カメラ位置を更新
   */
  updateCameraPosition() {
    const x = this.cameraDistance * Math.sin(this.cameraTheta) * Math.cos(this.cameraPhi);
    const y = this.cameraDistance * Math.sin(this.cameraPhi);
    const z = this.cameraDistance * Math.cos(this.cameraTheta) * Math.cos(this.cameraPhi);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * リサイズ処理
   */
  handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || width;

    if (width === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * アニメーションループ
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * テクスチャリストを設定
   * @param {Array} textures - テクスチャ配列
   */
  setTextures(textures) {
    this.textureList = textures;
    this.textureMap = {};

    textures.forEach(tex => {
      if (tex.file_name && tex.image_base64) {
        this.textureMap[tex.file_name] = tex.image_base64;
      }
    });

    // マテリアルが未設定の場合、最初のテクスチャを自動セット
    if (textures.length > 0) {
      for (let m = 1; m <= 3; m++) {
        if (!this.materialTextures[m] && textures[m - 1]) {
          this.materialTextures[m] = textures[m - 1].image_base64;
        }
      }
    }
  }

  /**
   * ブロックをロード
   * @param {Object} blockData - ブロックデータ
   */
  loadBlock(blockData) {
    this.currentBlock = { ...blockData };

    // voxel_lookをデコード
    this.voxelData = VoxelData.decode(blockData.voxel_look || '');

    // マテリアルテクスチャを設定
    for (let m = 1; m <= 3; m++) {
      const texName = blockData[`material_${m}`];
      if (texName && this.textureMap[texName]) {
        this.materialTextures[m] = this.textureMap[texName];
      }
    }

    // メッシュを再構築
    this.rebuildMesh();
  }

  /**
   * 現在のマテリアルを設定
   * @param {number} material - マテリアル番号（1-3）
   */
  setCurrentMaterial(material) {
    if (material >= 1 && material <= 3) {
      this.currentMaterial = material;
      if (this.onMaterialChange) {
        this.onMaterialChange(material);
      }
    }
  }

  /**
   * マテリアルのテクスチャを設定
   * @param {number} material - マテリアル番号（1-3）
   * @param {string} textureData - Base64テクスチャデータ
   * @param {string} textureName - テクスチャ名
   */
  setMaterialTexture(material, textureData, textureName) {
    if (material >= 1 && material <= 3) {
      this.materialTextures[material] = textureData;
      if (this.currentBlock) {
        this.currentBlock[`material_${material}`] = textureName;
      }
      this.rebuildMesh();
    }
  }

  /**
   * ブラシサイズを設定
   * @param {number} size - ブラシサイズ（1, 2, 4）
   */
  setBrushSize(size) {
    if (size === 1 || size === 2 || size === 4) {
      this.brushSize = size;
      this.meshBuilder.updateHighlightSize(this.highlight, size);
    }
  }

  /**
   * 座標をブラシサイズに応じたグリッドにスナップ
   * - 1x: スナップなし（0-7の任意の位置）
   * - 2x: 4x4x4グリッド（0, 2, 4, 6）
   * - 4x: 2x2x2グリッド（0, 4）
   * @param {number} coord - 座標値（0-7）
   * @returns {number} スナップ後の座標
   */
  snapToGrid(coord) {
    if (this.brushSize === 1) {
      return coord;
    } else if (this.brushSize === 2) {
      // 4x4x4グリッド: 0, 2, 4, 6
      return Math.floor(coord / 2) * 2;
    } else if (this.brushSize === 4) {
      // 2x2x2グリッド: 0, 4
      return Math.floor(coord / 4) * 4;
    }
    return coord;
  }

  /**
   * 現在のブロックデータを取得
   * @returns {Object} ブロックデータ
   */
  getBlockData() {
    if (!this.currentBlock) return null;

    return {
      ...this.currentBlock,
      voxel_look: VoxelData.encode(this.voxelData)
    };
  }

  /**
   * ボクセルデータを取得
   * @returns {number[][][]} ボクセルデータ
   */
  getVoxelData() {
    return this.voxelData;
  }

  /**
   * 背景色を次の色に切り替え
   * @returns {string} 新しい背景色のCSS形式
   */
  toggleBackgroundColor() {
    this.currentBgColorIndex = (this.currentBgColorIndex + 1) % this.bgColors.length;
    const color = this.bgColors[this.currentBgColorIndex];
    this.scene.background = new this.THREE.Color(color);
    return '#' + color.toString(16).padStart(6, '0');
  }

  /**
   * 現在の背景色をCSS形式で取得
   * @returns {string} 背景色のCSS形式
   */
  getCurrentBackgroundColor() {
    const color = this.bgColors[this.currentBgColorIndex];
    return '#' + color.toString(16).padStart(6, '0');
  }

  /**
   * リソースを解放
   */
  dispose() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // ボクセルメッシュを破棄
    while (this.blockMesh.children.length > 0) {
      const child = this.blockMesh.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.blockMesh.remove(child);
    }

    this.meshBuilder.clearTextureCache();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.CustomBlockEditor = CustomBlockEditor;
}
