/**
 * カスタムブロックエディタ UI
 * 8x8x8ボクセルの3Dプレビュー、編集、マテリアル選択を管理
 * 当たり判定編集モード（4x4x4）をサポート
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

    // 当たり判定データ
    this.collisionData = VoxelCollision.createEmpty();
    this.collisionMesh = null;

    // 編集モード: 'look' または 'collision'
    this.editMode = 'look';

    // マテリアル設定
    this.materialTextures = { 1: null, 2: null, 3: null };
    this.currentMaterial = 1;
    this.brushSize = 1;
    this.savedBrushSize = 1; // モード切替時に保存

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
    this.onCollisionChange = null;
    this.onMaterialChange = null;
    this.onModeChange = null;

    // 背景色の設定
    this.bgColors = [0x000000, 0x4169e1, 0x228b22];
    this.currentBgColorIndex = 0;

    // ミニプレビュー用
    this.miniRenderer = null;
    this.miniScene = null;
    this.miniCamera = null;
    this.miniMesh = null;

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

    // 当たり判定ワイヤーフレームグループ
    this.collisionMesh = new THREE.Group();
    this.scene.add(this.collisionMesh);

    // 4x4グリッド（当たり判定モード用、初期非表示）
    this.floorGrid4x4 = this.createFloorGrid4x4(1);
    this.floorGrid4x4.position.y = -0.5;
    this.floorGrid4x4.visible = false;
    this.scene.add(this.floorGrid4x4);
  }

  /**
   * 4x4床面グリッドを作成
   * @param {number} size - グリッド全体のサイズ
   * @returns {THREE.LineSegments} グリッド線
   */
  createFloorGrid4x4(size = 1) {
    const THREE = this.THREE;
    const halfSize = size / 2;
    const step = size / 4;

    const points = [];

    // グリッド線（X方向）
    for (let i = 0; i <= 4; i++) {
      const z = -halfSize + i * step;
      points.push(new THREE.Vector3(-halfSize, 0, z));
      points.push(new THREE.Vector3(halfSize, 0, z));
    }

    // グリッド線（Z方向）
    for (let i = 0; i <= 4; i++) {
      const x = -halfSize + i * step;
      points.push(new THREE.Vector3(x, 0, -halfSize));
      points.push(new THREE.Vector3(x, 0, halfSize));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, opacity: 0.7, transparent: true });
    return new THREE.LineSegments(geometry, material);
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

    // タッチイベント対応
    this.initTouchEvents();
  }

  /**
   * タッチイベントを初期化
   */
  initTouchEvents() {
    const canvas = this.renderer.domElement;

    // タッチ状態管理
    this.touchState = {
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      startTime: 0,
      isDragging: false,
      isLongPress: false,
      longPressTimer: null,
      initialPinchDistance: 0
    };

    // タッチ開始
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        this.touchState.startX = touch.clientX;
        this.touchState.startY = touch.clientY;
        this.touchState.lastX = touch.clientX;
        this.touchState.lastY = touch.clientY;
        this.touchState.startTime = Date.now();
        this.touchState.isDragging = false;
        this.touchState.isLongPress = false;

        // ハイライト更新
        this.updateMousePositionFromTouch(touch);
        this.updateHighlight();

        // ロングプレス検出（500ms）
        this.touchState.longPressTimer = setTimeout(() => {
          if (!this.touchState.isDragging) {
            this.touchState.isLongPress = true;
            // 振動フィードバック（対応デバイスのみ）
            if (navigator.vibrate) {
              navigator.vibrate(50);
            }
            // ロングプレスで削除
            this.deleteVoxel();
          }
        }, 500);
      } else if (e.touches.length === 2) {
        // ピンチ開始
        clearTimeout(this.touchState.longPressTimer);
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.touchState.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: false });

    // タッチ移動
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - this.touchState.startX;
        const dy = touch.clientY - this.touchState.startY;

        // 移動距離が閾値を超えたらドラッグ開始
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          this.touchState.isDragging = true;
          clearTimeout(this.touchState.longPressTimer);
        }

        // ドラッグ中は視点回転
        if (this.touchState.isDragging) {
          const deltaX = touch.clientX - this.touchState.lastX;
          const deltaY = touch.clientY - this.touchState.lastY;

          this.cameraTheta -= deltaX * 0.01;
          this.cameraPhi += deltaY * 0.01;
          this.cameraPhi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPhi));

          this.updateCameraPosition();
        }

        this.touchState.lastX = touch.clientX;
        this.touchState.lastY = touch.clientY;

        // ハイライト更新
        this.updateMousePositionFromTouch(touch);
        this.updateHighlight();
      } else if (e.touches.length === 2) {
        // ピンチズーム
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (this.touchState.initialPinchDistance > 0) {
          const scale = this.touchState.initialPinchDistance / distance;
          this.cameraDistance = Math.max(1.5, Math.min(10, this.cameraDistance * scale));
          this.updateCameraPosition();
          this.touchState.initialPinchDistance = distance;
        }
      }
    }, { passive: false });

    // タッチ終了
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      clearTimeout(this.touchState.longPressTimer);

      // タップ（短いタッチでドラッグなし）で配置
      if (!this.touchState.isDragging && !this.touchState.isLongPress) {
        const touchDuration = Date.now() - this.touchState.startTime;
        if (touchDuration < 300) {
          this.placeVoxel();
        }
      }

      this.touchState.isDragging = false;
      this.touchState.isLongPress = false;
      this.touchState.initialPinchDistance = 0;
    }, { passive: false });

    // タッチキャンセル
    canvas.addEventListener('touchcancel', (e) => {
      clearTimeout(this.touchState.longPressTimer);
      this.touchState.isDragging = false;
      this.touchState.isLongPress = false;
      this.touchState.initialPinchDistance = 0;
    }, { passive: false });
  }

  /**
   * タッチ位置からマウス位置を更新
   */
  updateMousePositionFromTouch(touch) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
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

    // モードに応じてレイキャスト対象を切り替え
    const targetMesh = this.editMode === 'collision' ? this.collisionMesh : this.blockMesh;
    const voxelMeshes = targetMesh.children;
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
    // 当たり判定モードでは4x4、見た目モードでは8x8
    const gridSize = this.editMode === 'collision' ? 4 : 8;
    const voxelSize = 1 / gridSize;
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

    // 当たり判定モードではスナップなし、見た目モードではブラシサイズスナップ
    let snappedX, snappedY, snappedZ;
    const effectiveBrushSize = this.editMode === 'collision' ? 1 : this.brushSize;

    if (this.editMode === 'collision') {
      snappedX = x;
      snappedY = y;
      snappedZ = z;
    } else {
      snappedX = this.snapToGrid(x);
      snappedY = this.snapToGrid(y);
      snappedZ = this.snapToGrid(z);
    }

    // 範囲チェック
    snappedX = Math.max(0, Math.min(gridSize - effectiveBrushSize, snappedX));
    snappedY = Math.max(0, Math.min(gridSize - effectiveBrushSize, snappedY));
    snappedZ = Math.max(0, Math.min(gridSize - effectiveBrushSize, snappedZ));

    // エッジの位置を更新（スナップされた位置の中心）
    const edgeCenterX = offset + (snappedX + effectiveBrushSize / 2 - 0.5) * voxelSize;
    const edgeCenterY = offset + (snappedY + effectiveBrushSize / 2 - 0.5) * voxelSize;
    const edgeCenterZ = offset + (snappedZ + effectiveBrushSize / 2 - 0.5) * voxelSize;
    this.highlight.edges.position.set(edgeCenterX, edgeCenterY, edgeCenterZ);
    this.highlight.edges.visible = true;

    // 面の位置と回転を更新
    const faceOffset = voxelSize * effectiveBrushSize / 2 + 0.001;
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
    const halfSize = 0.5;

    // 当たり判定モードでは4x4、見た目モードでは8x8
    const gridSize = this.editMode === 'collision' ? 4 : 8;
    const voxelSize = 1 / gridSize;

    // グリッド座標を計算
    let x = Math.floor((hit.point.x + halfSize) / voxelSize);
    let z = Math.floor((hit.point.z + halfSize) / voxelSize);

    // 当たり判定モードではブラシサイズスナップなし、見た目モードではスナップ
    if (this.editMode !== 'collision') {
      x = this.snapToGrid(x);
      z = this.snapToGrid(z);
    }

    // 範囲チェック
    const effectiveBrushSize = this.editMode === 'collision' ? 1 : this.brushSize;
    x = Math.max(0, Math.min(gridSize - effectiveBrushSize, x));
    z = Math.max(0, Math.min(gridSize - effectiveBrushSize, z));

    this.highlightedVoxel = null;
    this.highlightedFace = {
      floor: true,
      x: x,
      z: z
    };

    // 床面上のハイライト位置
    const centerX = -halfSize + (x + effectiveBrushSize / 2) * voxelSize;
    const centerZ = -halfSize + (z + effectiveBrushSize / 2) * voxelSize;

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

    // 当たり判定モードの場合は専用処理
    if (this.editMode === 'collision') {
      this.placeCollisionVoxel();
      return;
    }

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
   * 当たり判定ボクセルを配置
   */
  placeCollisionVoxel() {
    if (!this.highlightedFace) return;

    let placed = false;

    if (this.highlightedFace.floor) {
      // 床面からの配置（showFloorHighlightで既に4x4座標系）
      const baseX = this.highlightedFace.x;
      const baseZ = this.highlightedFace.z;

      if (VoxelCollision.isValidPosition(baseX, 0, baseZ)) {
        VoxelCollision.set(this.collisionData, baseX, 0, baseZ, 1);
        placed = true;
      }
    } else if (this.highlightedVoxel) {
      // 既存ボクセルに隣接して配置（座標は既に4x4座標系）
      const normal = this.highlightedFace.normal;
      const nx = Math.round(normal.x);
      const ny = Math.round(normal.y);
      const nz = Math.round(normal.z);

      const targetX = this.highlightedVoxel.x + nx;
      const targetY = this.highlightedVoxel.y + ny;
      const targetZ = this.highlightedVoxel.z + nz;

      if (VoxelCollision.isValidPosition(targetX, targetY, targetZ)) {
        VoxelCollision.set(this.collisionData, targetX, targetY, targetZ, 1);
        placed = true;
      }
    }

    if (placed) {
      this.rebuildCollisionMesh();
      if (this.onCollisionChange) {
        this.onCollisionChange(this.collisionData);
      }
    }
  }

  /**
   * ボクセルを削除
   */
  deleteVoxel() {
    if (!this.highlightedVoxel) return;

    // 当たり判定モードの場合は専用処理
    if (this.editMode === 'collision') {
      this.deleteCollisionVoxel();
      return;
    }

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
   * 当たり判定ボクセルを削除
   */
  deleteCollisionVoxel() {
    if (!this.highlightedVoxel) return;

    // showVoxelHighlight()で既に4x4座標系で設定されている
    const { x, y, z } = this.highlightedVoxel;

    if (VoxelCollision.isValidPosition(x, y, z) &&
        VoxelCollision.get(this.collisionData, x, y, z) === 1) {
      VoxelCollision.set(this.collisionData, x, y, z, 0);
      this.rebuildCollisionMesh();
      this.updateHighlight();
      if (this.onCollisionChange) {
        this.onCollisionChange(this.collisionData);
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

    // voxel_collisionをデコード
    this.collisionData = VoxelCollision.decode(blockData.voxel_collision || '');

    // マテリアルテクスチャを設定
    for (let m = 1; m <= 3; m++) {
      const texName = blockData[`material_${m}`];
      if (texName && this.textureMap[texName]) {
        this.materialTextures[m] = this.textureMap[texName];
      }
    }

    // メッシュを再構築
    this.rebuildMesh();
    this.rebuildCollisionMesh();

    // 初期状態: 見た目モードなので当たり判定は非表示
    if (this.editMode === 'look') {
      this.blockMesh.visible = true;
      this.collisionMesh.visible = false;
    } else {
      this.blockMesh.visible = false;
      this.collisionMesh.visible = true;
    }
  }

  /**
   * 当たり判定メッシュを再構築
   * 白いボクセルで表示
   */
  rebuildCollisionMesh() {
    const THREE = this.THREE;

    // 既存のメッシュを削除
    while (this.collisionMesh.children.length > 0) {
      const child = this.collisionMesh.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.collisionMesh.remove(child);
    }

    // 当たり判定ボクセルを白いボクセルで表示
    const gridSize = 4;
    const voxelSize = 1 / gridSize; // 0.25

    for (let y = 0; y < gridSize; y++) {
      for (let z = 0; z < gridSize; z++) {
        for (let x = 0; x < gridSize; x++) {
          if (VoxelCollision.get(this.collisionData, x, y, z) === 1) {
            // 白いボクセルを作成
            const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
            const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const mesh = new THREE.Mesh(geometry, material);

            // 位置を設定
            const offset = -0.5 + voxelSize / 2;
            mesh.position.set(
              offset + x * voxelSize,
              offset + y * voxelSize,
              offset + z * voxelSize
            );

            this.collisionMesh.add(mesh);
          }
        }
      }
    }
  }

  /**
   * 編集モードを切り替え
   * @param {string} mode - 'look' または 'collision'
   */
  setEditMode(mode) {
    if (mode !== 'look' && mode !== 'collision') return;
    if (this.editMode === mode) return;

    const previousMode = this.editMode;
    this.editMode = mode;

    if (mode === 'collision') {
      // 当たり判定モードに切り替え
      // 現在のブラシサイズを保存
      this.savedBrushSize = this.brushSize;
      // ブラシサイズを2に固定（当たり判定1ボクセル = 見た目2x2x2）
      this.brushSize = 2;
      this.meshBuilder.updateHighlightSize(this.highlight, 2);

      // グリッド切り替え
      this.floorGrid.visible = false;
      this.floorGrid4x4.visible = true;

      // 当たり判定モード: 見た目を非表示、当たり判定を表示
      this.blockMesh.visible = false;
      this.collisionMesh.visible = true;
    } else {
      // 見た目モードに切り替え
      // ブラシサイズを復元
      this.brushSize = this.savedBrushSize;
      this.meshBuilder.updateHighlightSize(this.highlight, this.brushSize);

      // グリッド切り替え
      this.floorGrid.visible = true;
      this.floorGrid4x4.visible = false;

      // 見た目モード: 見た目を表示、当たり判定を非表示
      this.blockMesh.visible = true;
      this.collisionMesh.visible = false;
    }

    this.updateHighlight();

    if (this.onModeChange) {
      this.onModeChange(mode);
    }
  }

  /**
   * 現在の編集モードを取得
   * @returns {string} 'look' または 'collision'
   */
  getEditMode() {
    return this.editMode;
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
      voxel_look: VoxelData.encode(this.voxelData),
      voxel_collision: VoxelCollision.encode(this.collisionData)
    };
  }

  /**
   * 当たり判定データを取得
   * @returns {number[][][]} 当たり判定データ
   */
  getCollisionData() {
    return this.collisionData;
  }

  /**
   * ミニプレビュー用のレンダラーを初期化
   * @param {HTMLCanvasElement} canvas - キャンバス要素
   */
  initMiniPreview(canvas) {
    const THREE = this.THREE;
    const size = canvas.width;

    // ミニシーン
    this.miniScene = new THREE.Scene();
    this.miniScene.background = new THREE.Color(0x222222);

    // ミニカメラ
    this.miniCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.miniCamera.position.set(1.5, 1, 1.5);
    this.miniCamera.lookAt(0, 0, 0);

    // ミニレンダラー
    this.miniRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    this.miniRenderer.setSize(size, size);
    this.miniRenderer.setPixelRatio(window.devicePixelRatio);

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.miniScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    this.miniScene.add(directionalLight);

    // メッシュグループ
    this.miniMesh = new THREE.Group();
    this.miniScene.add(this.miniMesh);
  }

  /**
   * ミニプレビューを更新
   * @param {string} type - 'look' または 'collision'
   */
  updateMiniPreview(type) {
    if (!this.miniRenderer || !this.miniScene) return;

    const THREE = this.THREE;

    // 既存のメッシュを削除
    while (this.miniMesh.children.length > 0) {
      const child = this.miniMesh.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.miniMesh.remove(child);
    }

    if (type === 'collision') {
      // 当たり判定の白いボクセルを表示
      const gridSize = 4;
      const voxelSize = 1 / gridSize;

      for (let y = 0; y < gridSize; y++) {
        for (let z = 0; z < gridSize; z++) {
          for (let x = 0; x < gridSize; x++) {
            if (VoxelCollision.get(this.collisionData, x, y, z) === 1) {
              const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
              const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
              const mesh = new THREE.Mesh(geometry, material);

              const offset = -0.5 + voxelSize / 2;
              mesh.position.set(
                offset + x * voxelSize,
                offset + y * voxelSize,
                offset + z * voxelSize
              );

              this.miniMesh.add(mesh);
            }
          }
        }
      }
    } else {
      // 見た目のメッシュを表示
      const newMesh = this.meshBuilder.buildMesh(this.voxelData, this.materialTextures);
      while (newMesh.children.length > 0) {
        const child = newMesh.children[0];
        newMesh.remove(child);
        this.miniMesh.add(child);
      }
    }

    // レンダリング
    this.miniRenderer.render(this.miniScene, this.miniCamera);
  }

  /**
   * ミニプレビューをレンダリング
   */
  renderMiniPreview() {
    if (this.miniRenderer && this.miniScene && this.miniCamera) {
      this.miniRenderer.render(this.miniScene, this.miniCamera);
    }
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

    // 当たり判定メッシュを破棄
    while (this.collisionMesh.children.length > 0) {
      const child = this.collisionMesh.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.collisionMesh.remove(child);
    }

    // ミニプレビューを破棄
    if (this.miniRenderer) {
      this.miniRenderer.dispose();
    }
    if (this.miniMesh) {
      while (this.miniMesh.children.length > 0) {
        const child = this.miniMesh.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        this.miniMesh.remove(child);
      }
    }

    this.meshBuilder.clearTextureCache();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  /**
   * シーンを取得（簡易チェッカー用）
   * @returns {THREE.Scene} シーン
   */
  getScene() {
    return this.scene;
  }

  /**
   * カメラを取得（簡易チェッカー用）
   * @returns {THREE.Camera} カメラ
   */
  getCamera() {
    return this.camera;
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.CustomBlockEditor = CustomBlockEditor;
}
