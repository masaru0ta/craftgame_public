/**
 * カスタムブロック用エディターUI
 * Three.jsを使用した3Dボクセル編集機能を提供
 */

class CustomBlockEditor {
  /**
   * コンストラクタ
   * @param {Object} options - 設定オプション
   * @param {HTMLElement} options.previewContainer - 3Dプレビューを描画するコンテナ
   * @param {HTMLElement} options.materialContainer - マテリアルスロットを表示するコンテナ
   * @param {THREE} options.THREE - Three.jsライブラリ
   * @param {CustomBlockMeshBuilder} options.meshBuilder - メッシュビルダー
   */
  constructor(options) {
    this.previewContainer = options.previewContainer;
    this.materialContainer = options.materialContainer;
    this.THREE = options.THREE;
    this.meshBuilder = options.meshBuilder;

    // テクスチャ一覧（外部から設定）
    this.textures = [];

    // マテリアル設定
    this.materials = [null, null, null]; // material_1, material_2, material_3
    this.currentMaterial = 1; // 現在選択中のマテリアル（1-3）

    // ボクセルデータ
    this.voxelData = new VoxelData(8, 8, 8);
    this.voxelSize = 1 / 8;

    // Three.js関連
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.voxelGroup = null;
    this.gridHelper = null;
    this.boundingBox = null;
    this.labels = [];
    this.raycaster = null;
    this.mouse = null;

    // カメラ制御
    this.cameraDistance = 2;
    this.cameraAngleH = 45;
    this.cameraAngleV = 30;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // ハイライト用
    this.highlightedVoxel = null;
    this.highlightMeshes = [];

    // テクスチャ選択モーダル
    this.textureModal = null;
    this.currentEditingMaterial = null;

    // イベントコールバック
    this.onDataChange = null;
    this.onTextureUpload = null;

    this.init();
  }

  /**
   * 初期化
   */
  init() {
    this.initThreeJS();
    this.initMaterialSlots();
    this.initEventListeners();
    this.animate();
  }

  /**
   * Three.jsの初期化
   */
  initThreeJS() {
    const container = this.previewContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // シーン
    this.scene = new this.THREE.Scene();
    this.scene.background = new this.THREE.Color(0x333333);

    // カメラ
    this.camera = new this.THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.updateCameraPosition();

    // レンダラー
    this.renderer = new this.THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    container.appendChild(this.renderer.domElement);

    // レイキャスター
    this.raycaster = new this.THREE.Raycaster();
    this.mouse = new this.THREE.Vector2();

    // グリッドヘルパー
    this.gridHelper = this.meshBuilder.createGridHelper(8, this.voxelSize);
    this.scene.add(this.gridHelper);

    // バウンディングボックス
    this.boundingBox = this.meshBuilder.createBoundingBox(8, this.voxelSize);
    this.scene.add(this.boundingBox);

    // ラベルを作成
    this.createLabels();

    // ボクセルグループ
    this.voxelGroup = new this.THREE.Group();
    this.scene.add(this.voxelGroup);

    // 初期ボクセルメッシュを作成
    this.rebuildVoxelMesh();
  }

  /**
   * 方向ラベルを作成
   */
  createLabels() {
    const offset = 0.7;
    const labelData = [
      { text: 'FRONT', position: [0, -0.5, offset] },
      { text: 'BACK', position: [0, -0.5, -offset] },
      { text: 'LEFT', position: [-offset, -0.5, 0] },
      { text: 'RIGHT', position: [offset, -0.5, 0] }
    ];

    labelData.forEach(data => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.text, 64, 16);

      const texture = new this.THREE.CanvasTexture(canvas);
      const material = new this.THREE.SpriteMaterial({ map: texture });
      const sprite = new this.THREE.Sprite(material);
      sprite.position.set(data.position[0], data.position[1], data.position[2]);
      sprite.scale.set(0.5, 0.125, 1);
      this.scene.add(sprite);
      this.labels.push(sprite);
    });
  }

  /**
   * カメラ位置を更新
   */
  updateCameraPosition() {
    const hRad = this.cameraAngleH * Math.PI / 180;
    const vRad = this.cameraAngleV * Math.PI / 180;

    this.camera.position.x = this.cameraDistance * Math.cos(vRad) * Math.sin(hRad);
    this.camera.position.y = this.cameraDistance * Math.sin(vRad);
    this.camera.position.z = this.cameraDistance * Math.cos(vRad) * Math.cos(hRad);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * マテリアルスロットの初期化
   */
  initMaterialSlots() {
    this.materialContainer.innerHTML = '';

    for (let i = 1; i <= 3; i++) {
      const slot = document.createElement('div');
      slot.className = 'material-slot' + (i === this.currentMaterial ? ' selected' : '');
      slot.dataset.material = i;

      const preview = document.createElement('div');
      preview.className = 'material-preview';

      const label = document.createElement('div');
      label.className = 'material-label';
      label.textContent = `material_${i}`;

      const keyHint = document.createElement('div');
      keyHint.className = 'material-key-hint';
      keyHint.textContent = i;

      slot.appendChild(preview);
      slot.appendChild(label);
      slot.appendChild(keyHint);
      this.materialContainer.appendChild(slot);

      slot.addEventListener('click', (e) => {
        if (e.shiftKey || e.ctrlKey) {
          // Shift/Ctrlクリックでテクスチャ選択
          this.openTextureSelector(i);
        } else {
          // 通常クリックでマテリアル選択
          this.selectMaterial(i);
        }
      });

      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.openTextureSelector(i);
      });
    }
  }

  /**
   * イベントリスナーの初期化
   */
  initEventListeners() {
    const canvas = this.renderer.domElement;

    // マウスダウン
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // 左クリック: ドラッグ開始 or 削除
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      } else if (e.button === 2) { // 右クリック: 配置
        this.handleVoxelPlace(e);
      }
    });

    // マウス移動
    canvas.addEventListener('mousemove', (e) => {
      // ハイライト更新
      this.updateHighlight(e);

      // ドラッグ中なら視点回転
      if (this.isDragging) {
        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;

        // 右にドラッグするとブロックが右に回転
        this.cameraAngleH -= deltaX * 0.5;
        this.cameraAngleV += deltaY * 0.5;
        this.cameraAngleV = Math.max(-90, Math.min(90, this.cameraAngleV));

        this.updateCameraPosition();

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });

    // マウスアップ
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.isDragging) {
        // ドラッグ距離が小さければクリックとして削除
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5) {
          this.handleVoxelDelete(e);
        }
      }
      this.isDragging = false;
    });

    // マウスがキャンバスから出たらハイライト解除
    canvas.addEventListener('mouseleave', () => {
      this.clearHighlight();
    });

    // 右クリックメニュー無効化
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // マウスホイール
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance += e.deltaY * 0.002;
      this.cameraDistance = Math.max(0.5, Math.min(5, this.cameraDistance));
      this.updateCameraPosition();
    });

    // キーボード
    document.addEventListener('keydown', (e) => {
      if (e.key === '1') this.selectMaterial(1);
      if (e.key === '2') this.selectMaterial(2);
      if (e.key === '3') this.selectMaterial(3);
    });

    // ウィンドウリサイズ
    window.addEventListener('resize', () => this.onResize());
  }

  /**
   * ハイライト更新
   * @param {MouseEvent} e - マウスイベント
   */
  updateHighlight(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.voxelGroup.children, true);

    // 以前のハイライトをクリア
    this.clearHighlight();

    if (intersects.length > 0) {
      const hit = intersects[0];
      const voxelMesh = hit.object;
      const { x, y, z } = voxelMesh.userData;

      this.highlightedVoxel = { x, y, z, hit };

      // ハイライトボックスを作成
      this.createHighlightBox(x, y, z, hit);
    }
  }

  /**
   * ハイライトボックスを作成
   * @param {number} x - X座標
   * @param {number} y - Y座標
   * @param {number} z - Z座標
   * @param {Object} hit - レイキャスト結果
   */
  createHighlightBox(x, y, z, hit) {
    const size = this.voxelSize * 1.02; // 少し大きく
    const geometry = new this.THREE.BoxGeometry(size, size, size);

    // 面ごとに色を設定（緑:選択面、赤:その他）
    const materials = [];
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);

    // Three.js BoxGeometry の面順序: +X, -X, +Y, -Y, +Z, -Z
    const faceNormals = [
      new this.THREE.Vector3(1, 0, 0),   // +X (right)
      new this.THREE.Vector3(-1, 0, 0),  // -X (left)
      new this.THREE.Vector3(0, 1, 0),   // +Y (top)
      new this.THREE.Vector3(0, -1, 0),  // -Y (bottom)
      new this.THREE.Vector3(0, 0, 1),   // +Z (front)
      new this.THREE.Vector3(0, 0, -1),  // -Z (back)
    ];

    faceNormals.forEach(faceNormal => {
      const isSelectedFace = faceNormal.dot(normal) > 0.9;
      const color = isSelectedFace ? 0x00ff00 : 0xff0000;
      materials.push(new this.THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.3,
        side: this.THREE.FrontSide
      }));
    });

    const highlightMesh = new this.THREE.Mesh(geometry, materials);
    highlightMesh.position.set(
      (x - 3.5) * this.voxelSize,
      (y - 3.5) * this.voxelSize,
      (z - 3.5) * this.voxelSize
    );

    this.scene.add(highlightMesh);
    this.highlightMeshes.push(highlightMesh);
  }

  /**
   * ハイライトをクリア
   */
  clearHighlight() {
    this.highlightMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.highlightMeshes = [];
    this.highlightedVoxel = null;
  }

  /**
   * ボクセル配置（右クリック）
   * @param {MouseEvent} e - マウスイベント
   */
  handleVoxelPlace(e) {
    if (!this.highlightedVoxel) {
      // ボクセルがない場合は中央に配置
      const centerPos = this.getCenterPosition();
      this.voxelData.set(centerPos.x, centerPos.y, centerPos.z, this.currentMaterial);
      this.rebuildVoxelMesh();
      this.triggerDataChange();
      return;
    }

    const { hit } = this.highlightedVoxel;
    const pos = this.getAdjacentPosition(hit);

    if (pos && this.isInBounds(pos.x, pos.y, pos.z)) {
      this.voxelData.set(pos.x, pos.y, pos.z, this.currentMaterial);
      this.rebuildVoxelMesh();
      this.triggerDataChange();
    }
  }

  /**
   * ボクセル削除（左クリック）
   * @param {MouseEvent} e - マウスイベント
   */
  handleVoxelDelete(e) {
    if (!this.highlightedVoxel) return;

    const { x, y, z } = this.highlightedVoxel;
    this.voxelData.set(x, y, z, 0);
    this.rebuildVoxelMesh();
    this.clearHighlight();
    this.triggerDataChange();
  }

  /**
   * 隣接位置を取得
   * @param {Object} hit - レイキャスト結果
   * @returns {Object|null} 隣接位置 {x, y, z}
   */
  getAdjacentPosition(hit) {
    const { x, y, z } = hit.object.userData;
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);

    // 法線方向に隣接するボクセル位置を計算
    const nx = x + Math.round(normal.x);
    const ny = y + Math.round(normal.y);
    const nz = z + Math.round(normal.z);

    return { x: nx, y: ny, z: nz };
  }

  /**
   * 座標が範囲内かチェック
   * @param {number} x - X座標
   * @param {number} y - Y座標
   * @param {number} z - Z座標
   * @returns {boolean} 範囲内かどうか
   */
  isInBounds(x, y, z) {
    return x >= 0 && x < 8 && y >= 0 && y < 8 && z >= 0 && z < 8;
  }

  /**
   * 中央位置を取得（空の場合の初期配置用）
   * @returns {Object} 中央位置
   */
  getCenterPosition() {
    return { x: 3, y: 0, z: 3 };
  }

  /**
   * マテリアルを選択
   * @param {number} index - マテリアルインデックス（1-3）
   */
  selectMaterial(index) {
    this.currentMaterial = index;
    this.updateMaterialSlots();
  }

  /**
   * マテリアルスロットの表示を更新
   */
  updateMaterialSlots() {
    const slots = this.materialContainer.querySelectorAll('.material-slot');
    slots.forEach((slot, i) => {
      const material = this.materials[i];
      const preview = slot.querySelector('.material-preview');

      if (material && material.image_base64) {
        preview.style.backgroundImage = `url(${material.image_base64})`;
        preview.style.backgroundColor = '';
      } else {
        preview.style.backgroundImage = '';
        const colors = ['#ff4444', '#44ff44', '#4444ff'];
        preview.style.backgroundColor = colors[i];
      }

      if (i + 1 === this.currentMaterial) {
        slot.classList.add('selected');
      } else {
        slot.classList.remove('selected');
      }
    });
  }

  /**
   * テクスチャ選択モーダルを開く
   * @param {number} materialIndex - マテリアルインデックス（1-3）
   */
  openTextureSelector(materialIndex) {
    this.currentEditingMaterial = materialIndex;

    if (this.textureModal) {
      this.textureModal.remove();
    }

    this.textureModal = document.createElement('div');
    this.textureModal.className = 'texture-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'texture-modal-content';

    const title = document.createElement('h3');
    title.textContent = `material_${materialIndex} テクスチャを選択`;
    modalContent.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'texture-grid';

    // 「テクスチャなし」オプション
    const noTexture = document.createElement('div');
    noTexture.className = 'texture-tile no-texture';
    noTexture.textContent = 'なし';
    noTexture.addEventListener('click', () => this.selectTexture(materialIndex, null));
    grid.appendChild(noTexture);

    // テクスチャ一覧
    this.textures.forEach(tex => {
      const tile = document.createElement('div');
      tile.className = 'texture-tile';
      if (tex.image_base64) {
        tile.style.backgroundImage = `url(${tex.image_base64})`;
      }
      tile.title = tex.file_name;
      tile.addEventListener('click', () => this.selectTexture(materialIndex, tex));
      grid.appendChild(tile);
    });

    // 「テクスチャ追加」オプション
    const addTexture = document.createElement('div');
    addTexture.className = 'texture-tile add-texture';
    addTexture.textContent = '+追加';
    addTexture.addEventListener('click', () => this.uploadTexture());
    grid.appendChild(addTexture);

    modalContent.appendChild(grid);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn';
    closeBtn.textContent = '閉じる';
    closeBtn.addEventListener('click', () => this.closeTextureSelector());
    modalContent.appendChild(closeBtn);

    this.textureModal.appendChild(modalContent);
    document.body.appendChild(this.textureModal);

    this.textureModal.addEventListener('click', (e) => {
      if (e.target === this.textureModal) {
        this.closeTextureSelector();
      }
    });
  }

  /**
   * テクスチャ選択モーダルを閉じる
   */
  closeTextureSelector() {
    if (this.textureModal) {
      this.textureModal.remove();
      this.textureModal = null;
    }
    this.currentEditingMaterial = null;
  }

  /**
   * テクスチャを選択
   * @param {number} materialIndex - マテリアルインデックス（1-3）
   * @param {Object|null} texture - テクスチャデータ
   */
  selectTexture(materialIndex, texture) {
    this.materials[materialIndex - 1] = texture;
    this.updateMaterialSlots();
    this.rebuildVoxelMesh();
    this.closeTextureSelector();
    this.triggerDataChange();
  }

  /**
   * テクスチャをアップロード
   */
  uploadTexture() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        const fileName = file.name.replace(/\.[^/.]+$/, '');

        const maxId = this.textures.reduce((max, t) => Math.max(max, t.texture_id || 0), 0);
        const newId = maxId + 1;

        const newTexture = {
          texture_id: newId,
          file_name: fileName,
          color_hex: '',
          image_base64: base64
        };

        if (this.onTextureUpload) {
          await this.onTextureUpload(newTexture);
        }

        this.textures.push(newTexture);

        if (this.currentEditingMaterial) {
          this.openTextureSelector(this.currentEditingMaterial);
        }
      };
      reader.readAsDataURL(file);
    });

    input.click();
  }

  /**
   * ボクセルメッシュを再構築
   */
  rebuildVoxelMesh() {
    // 既存のメッシュを削除
    while (this.voxelGroup.children.length > 0) {
      const child = this.voxelGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.voxelGroup.remove(child);
    }

    // マテリアルを準備
    const threeMaterials = this.materials.map((mat, index) => {
      const colors = [0xff4444, 0x44ff44, 0x4444ff];
      if (mat && mat.image_base64) {
        return this.meshBuilder.createMaterial(mat.image_base64);
      }
      return this.meshBuilder.createMaterial(null, colors[index]);
    });

    // 各ボクセルのメッシュを作成
    this.voxelData.forEachNonEmpty((x, y, z, value) => {
      const materialIndex = value - 1;
      if (materialIndex < 0 || materialIndex >= 3) return;

      const mesh = this.meshBuilder.createVoxelMesh(
        x, y, z, value, threeMaterials[materialIndex], this.voxelSize
      );
      this.voxelGroup.add(mesh);
    });
  }

  /**
   * データ変更をトリガー
   */
  triggerDataChange() {
    if (this.onDataChange) {
      this.onDataChange();
    }
  }

  /**
   * リサイズ処理
   */
  onResize() {
    const container = this.previewContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * ブロックデータを設定
   * @param {Object} blockData - ブロックデータ
   */
  setBlockData(blockData) {
    // voxel_lookをデコード
    this.voxelData.decode(blockData.voxel_look || '');

    // マテリアルを設定
    const findTexture = (fileName) => {
      if (!fileName) return null;
      return this.textures.find(t => t.file_name === fileName) || null;
    };

    this.materials[0] = findTexture(blockData.material_1);
    this.materials[1] = findTexture(blockData.material_2);
    this.materials[2] = findTexture(blockData.material_3);

    this.updateMaterialSlots();
    this.rebuildVoxelMesh();
  }

  /**
   * 現在のデータを取得
   * @returns {Object} データ
   */
  getData() {
    return {
      voxel_look: this.voxelData.encode(),
      material_1: this.materials[0]?.file_name || '',
      material_2: this.materials[1]?.file_name || '',
      material_3: this.materials[2]?.file_name || ''
    };
  }

  /**
   * アニメーションループ
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * リソースを破棄
   */
  dispose() {
    while (this.voxelGroup.children.length > 0) {
      const child = this.voxelGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.voxelGroup.remove(child);
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    if (this.textureModal) {
      this.textureModal.remove();
    }

    this.meshBuilder.clearCache();
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.CustomBlockEditor = CustomBlockEditor;
}
