/**
 * CharacterEditor
 * キャラクターの3D編集コアクラス
 * Three.jsシーン管理、カメラ操作、表面セルの着色/消去、グリッド表示
 */
class CharacterEditor {
    static CELL_SIZE = 1 / 8; // 1セル = 1/8ブロック

    // Three.js BoxGeometry面順序 → 仕様面ID
    // BoxGeometry groups: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
    // 仕様面ID: PY=0, NY=1, PX=2, NX=3, PZ=4, NZ=5
    static THREE_FACE_TO_SPEC = [2, 3, 0, 1, 4, 5];
    static SPEC_FACE_TO_THREE = [2, 3, 0, 1, 4, 5];

    constructor(options) {
        this.canvas = options.canvas;
        this.THREE = options.THREE;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.raycaster = null;
        this.mouse = new THREE.Vector2();

        this.characterData = new CharacterData();
        this.partMeshes = {};      // partId → THREE.Group
        this.partBoxes = {};       // partId → THREE.Mesh
        this.partFaceTextures = {}; // partId → { faceId: DataTexture }
        this.partGrids = {};

        this.animator = null;

        // カメラ制御
        this.horizontalAngle = 90;  // 正面(+Z)から見る
        this.verticalAngle = 20;
        this.cameraDistance = 10;

        // マウス操作
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.dragThreshold = 5;

        this.selectedTool = 'paint';
        this.selectedColor = 0xE74C3C;

        this.animationId = null;
        this.lastTime = 0;
    }

    init() {
        this._setupScene();
        this._setupRenderer();
        this._setupCamera();
        this._setupLights();
        this._setupRaycaster();
        this._buildCharacterMeshes();
        this._setupAnimator();
        this._attachEvents();
        this._startRenderLoop();
    }

    _setupScene() {
        this.scene = new this.THREE.Scene();
        this.scene.background = new this.THREE.Color(0x2a2a3e);
    }

    _setupCamera() {
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera = new this.THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        this._updateCameraPosition();
    }

    _setupRenderer() {
        this.renderer = new this.THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
    }

    _setupLights() {
        const ambient = new this.THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        const directional = new this.THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(5, 10, 5);
        this.scene.add(directional);
    }

    _setupRaycaster() {
        this.raycaster = new this.THREE.Raycaster();
    }

    /**
     * 全パーツのメッシュを生成
     * 面ごとに個別DataTexture+マテリアルを使用
     */
    _buildCharacterMeshes() {
        const THREE = this.THREE;
        const CELL = CharacterEditor.CELL_SIZE;

        for (const [partId, partDef] of Object.entries(CharacterData.PARTS)) {
            const w = partDef.width * CELL;
            const h = partDef.height * CELL;
            const d = partDef.depth * CELL;

            // 面ごとのDataTextureとマテリアルを生成
            // BoxGeometry groups: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z
            const faceTextures = {};
            const materials = [];

            for (let threeIdx = 0; threeIdx < 6; threeIdx++) {
                const specFace = CharacterEditor.THREE_FACE_TO_SPEC[threeIdx];
                const faceSize = this.characterData.getFaceSize(partId, specFace);
                const texW = faceSize.cols;
                const texH = faceSize.rows;

                const data = new Uint8Array(texW * texH * 4);
                for (let i = 0; i < texW * texH; i++) {
                    data[i * 4 + 0] = 0xCC;
                    data[i * 4 + 1] = 0xCC;
                    data[i * 4 + 2] = 0xCC;
                    data[i * 4 + 3] = 0xFF;
                }

                const texture = new THREE.DataTexture(data, texW, texH, THREE.RGBAFormat);
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                texture.needsUpdate = true;

                faceTextures[specFace] = texture;
                materials.push(new THREE.MeshLambertMaterial({ map: texture }));
            }

            this.partFaceTextures[partId] = faceTextures;

            // Boxジオメトリ（マテリアル配列を使用）
            const geometry = new THREE.BoxGeometry(w, h, d);
            const mesh = new THREE.Mesh(geometry, materials);

            // ピボット用Group
            const pivot = partDef.pivot;
            mesh.position.set(
                w / 2 - pivot[0] * CELL,
                h / 2 - pivot[1] * CELL,
                d / 2 - pivot[2] * CELL
            );

            const group = new THREE.Group();
            group.add(mesh);

            // オフセット
            const offset = partDef.offset;
            group.position.set(
                offset[0] * CELL + pivot[0] * CELL,
                offset[1] * CELL + pivot[1] * CELL,
                offset[2] * CELL + pivot[2] * CELL
            );

            // グリッド線
            const gridLines = this._createGridLines(partId);
            mesh.add(gridLines);

            this.scene.add(group);
            this.partMeshes[partId] = group;
            this.partBoxes[partId] = mesh;
        }

        this._centerCharacter();
    }

    _centerCharacter() {
        const CELL = CharacterEditor.CELL_SIZE;
        const centerY = 16 * CELL;
        const centerX = 4 * CELL;

        for (const group of Object.values(this.partMeshes)) {
            group.position.x -= centerX;
            group.position.y -= centerY;
        }
    }

    /**
     * パーツ表面のグリッド線を生成
     */
    _createGridLines(partId) {
        const THREE = this.THREE;
        const CELL = CharacterEditor.CELL_SIZE;
        const p = CharacterData.PARTS[partId];
        const w = p.width * CELL, h = p.height * CELL, d = p.depth * CELL;
        const hw = w / 2, hh = h / 2, hd = d / 2;
        const eps = 0.001;
        const pts = [];

        // +Z面
        for (let i = 0; i <= p.width; i++) { const x = -hw + i * CELL; pts.push(new THREE.Vector3(x, -hh, hd + eps), new THREE.Vector3(x, hh, hd + eps)); }
        for (let j = 0; j <= p.height; j++) { const y = -hh + j * CELL; pts.push(new THREE.Vector3(-hw, y, hd + eps), new THREE.Vector3(hw, y, hd + eps)); }
        // -Z面
        for (let i = 0; i <= p.width; i++) { const x = -hw + i * CELL; pts.push(new THREE.Vector3(x, -hh, -hd - eps), new THREE.Vector3(x, hh, -hd - eps)); }
        for (let j = 0; j <= p.height; j++) { const y = -hh + j * CELL; pts.push(new THREE.Vector3(-hw, y, -hd - eps), new THREE.Vector3(hw, y, -hd - eps)); }
        // +X面
        for (let i = 0; i <= p.depth; i++) { const z = -hd + i * CELL; pts.push(new THREE.Vector3(hw + eps, -hh, z), new THREE.Vector3(hw + eps, hh, z)); }
        for (let j = 0; j <= p.height; j++) { const y = -hh + j * CELL; pts.push(new THREE.Vector3(hw + eps, y, -hd), new THREE.Vector3(hw + eps, y, hd)); }
        // -X面
        for (let i = 0; i <= p.depth; i++) { const z = -hd + i * CELL; pts.push(new THREE.Vector3(-hw - eps, -hh, z), new THREE.Vector3(-hw - eps, hh, z)); }
        for (let j = 0; j <= p.height; j++) { const y = -hh + j * CELL; pts.push(new THREE.Vector3(-hw - eps, y, -hd), new THREE.Vector3(-hw - eps, y, hd)); }
        // +Y面
        for (let i = 0; i <= p.width; i++) { const x = -hw + i * CELL; pts.push(new THREE.Vector3(x, hh + eps, -hd), new THREE.Vector3(x, hh + eps, hd)); }
        for (let j = 0; j <= p.depth; j++) { const z = -hd + j * CELL; pts.push(new THREE.Vector3(-hw, hh + eps, z), new THREE.Vector3(hw, hh + eps, z)); }
        // -Y面
        for (let i = 0; i <= p.width; i++) { const x = -hw + i * CELL; pts.push(new THREE.Vector3(x, -hh - eps, -hd), new THREE.Vector3(x, -hh - eps, hd)); }
        for (let j = 0; j <= p.depth; j++) { const z = -hd + j * CELL; pts.push(new THREE.Vector3(-hw, -hh - eps, z), new THREE.Vector3(hw, -hh - eps, z)); }

        const geometry = new THREE.BufferGeometry().setFromPoints(pts);
        return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.5 }));
    }

    _setupAnimator() {
        this.animator = new CharacterAnimator(this.partMeshes);
    }

    _attachEvents() {
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _onMouseDown(e) {
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    _onMouseMove(e) {
        if (!this.isDragging) return;
        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        const dist = Math.sqrt(Math.pow(e.clientX - this.dragStartX, 2) + Math.pow(e.clientY - this.dragStartY, 2));
        if (dist > this.dragThreshold) {
            this.horizontalAngle += deltaX * 0.5;
            this.verticalAngle = Math.max(-89, Math.min(89, this.verticalAngle + deltaY * 0.5));
            this._updateCameraPosition();
            this._wasDragged = true;
        }
    }

    _onMouseUp(e) {
        const wasDragged = this._wasDragged;
        this.isDragging = false;
        this._wasDragged = false;
        if (!wasDragged) this._handleClick(e);
    }

    _onWheel(e) {
        e.preventDefault();
        this.cameraDistance = Math.max(1, Math.min(20, this.cameraDistance + e.deltaY * 0.005));
        this._updateCameraPosition();
    }

    _handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const hit = this.hitTest(canvasX, canvasY);
        if (!hit) return;

        if (e.shiftKey) {
            const color = this.characterData.getCell(hit.partId, hit.faceId, hit.row, hit.col);
            if (color !== 0) this.selectedColor = color;
            if (this._onColorPicked) this._onColorPicked(this.selectedColor);
            return;
        }

        if (e.button === 2) {
            this.characterData.setCell(hit.partId, hit.faceId, hit.row, hit.col, 0);
            this._updateFaceTexture(hit.partId, hit.faceId);
            return;
        }

        switch (this.selectedTool) {
            case 'paint':
                this.characterData.setCell(hit.partId, hit.faceId, hit.row, hit.col, this.selectedColor);
                this._updateFaceTexture(hit.partId, hit.faceId);
                break;
            case 'eraser':
                this.characterData.setCell(hit.partId, hit.faceId, hit.row, hit.col, 0);
                this._updateFaceTexture(hit.partId, hit.faceId);
                break;
            case 'eyedropper': {
                const color = this.characterData.getCell(hit.partId, hit.faceId, hit.row, hit.col);
                if (color !== 0) this.selectedColor = color;
                this.selectedTool = 'paint';
                if (this._onColorPicked) this._onColorPicked(this.selectedColor);
                if (this._onToolChanged) this._onToolChanged('paint');
                break;
            }
            case 'fill':
                this._floodFill(hit.partId, hit.faceId, hit.row, hit.col, this.selectedColor);
                this._updateFaceTexture(hit.partId, hit.faceId);
                break;
        }
    }

    _floodFill(partId, faceId, startRow, startCol, newColor) {
        const targetColor = this.characterData.getCell(partId, faceId, startRow, startCol);
        if (targetColor === newColor) return;
        const size = this.characterData.getFaceSize(partId, faceId);
        const stack = [[startRow, startCol]];
        const visited = new Set();
        while (stack.length > 0) {
            const [row, col] = stack.pop();
            const key = row + ',' + col;
            if (visited.has(key)) continue;
            if (row < 0 || row >= size.rows || col < 0 || col >= size.cols) continue;
            if (this.characterData.getCell(partId, faceId, row, col) !== targetColor) continue;
            visited.add(key);
            this.characterData.setCell(partId, faceId, row, col, newColor);
            stack.push([row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]);
        }
    }

    /**
     * 特定面のDataTextureを更新
     */
    _updateFaceTexture(partId, faceId) {
        const textures = this.partFaceTextures[partId];
        if (!textures) return;
        const texture = textures[faceId];
        if (!texture) return;

        const faceSize = this.characterData.getFaceSize(partId, faceId);
        const data = texture.image.data;

        for (let row = 0; row < faceSize.rows; row++) {
            for (let col = 0; col < faceSize.cols; col++) {
                const color = this.characterData.getCell(partId, faceId, row, col);
                let r, g, b;
                if (color === 0) { r = 0xCC; g = 0xCC; b = 0xCC; }
                else { r = (color >> 16) & 0xFF; g = (color >> 8) & 0xFF; b = color & 0xFF; }
                // DataTextureは左下原点なのでrow反転（row 0=テクスチャ上端にする）
                const texRow = faceSize.rows - 1 - row;
                const px = (texRow * faceSize.cols + col) * 4;
                data[px + 0] = r;
                data[px + 1] = g;
                data[px + 2] = b;
                data[px + 3] = 0xFF;
            }
        }
        texture.needsUpdate = true;
    }

    /**
     * 全面のテクスチャを更新
     */
    _updateAllTextures(partId) {
        for (let faceId = 0; faceId < 6; faceId++) {
            this._updateFaceTexture(partId, faceId);
        }
    }

    _updateCameraPosition() {
        const THREE = this.THREE;
        const radH = THREE.MathUtils.degToRad(this.horizontalAngle);
        const radV = THREE.MathUtils.degToRad(this.verticalAngle);
        this.camera.position.x = Math.cos(radH) * Math.cos(radV) * this.cameraDistance;
        this.camera.position.y = Math.sin(radV) * this.cameraDistance;
        this.camera.position.z = Math.sin(radH) * Math.cos(radV) * this.cameraDistance;
        this.camera.lookAt(0, 0, 0);
    }

    _startRenderLoop() {
        this.lastTime = performance.now();
        const loop = (now) => {
            this.animationId = requestAnimationFrame(loop);
            const dt = (now - this.lastTime) / 1000;
            this.lastTime = now;
            if (this.animator) this.animator.update(dt);
            this.renderer.render(this.scene, this.camera);
        };
        this.animationId = requestAnimationFrame(loop);
    }

    // ============================
    // テストAPI
    // ============================

    getPartCount() { return Object.keys(this.partMeshes).length; }

    getCellColor(partId, faceId, row, col) {
        return this.characterData.getCell(partId, faceId, row, col);
    }

    setCellColor(partId, faceId, row, col, color) {
        this.characterData.setCell(partId, faceId, row, col, color);
        this._updateFaceTexture(partId, faceId);
    }

    getSelectedTool() { return this.selectedTool; }
    getSelectedColor() { return this.selectedColor; }

    isAnimating() { return this.animator ? this.animator.isPlaying : false; }

    getPartRotation(partId) {
        return this.animator ? this.animator.getPartRotation(partId) : { x: 0, y: 0, z: 0 };
    }

    getCameraState() {
        return { distance: this.cameraDistance, azimuth: this.horizontalAngle, polar: this.verticalAngle };
    }

    /**
     * 指定canvas座標でのレイキャスト
     * デフォルトUV(0-1)から直接セル座標を計算
     */
    hitTest(canvasX, canvasY) {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        this.mouse.x = (canvasX / width) * 2 - 1;
        this.mouse.y = -(canvasY / height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const meshes = Object.values(this.partBoxes);
        const intersects = this.raycaster.intersectObjects(meshes);
        if (intersects.length === 0) return null;

        const intersect = intersects[0];
        const mesh = intersect.object;

        // パーツ特定
        let hitPartId = null;
        for (const [partId, box] of Object.entries(this.partBoxes)) {
            if (box === mesh) { hitPartId = partId; break; }
        }
        if (!hitPartId) return null;

        // 面法線 → 面ID
        const normal = intersect.face.normal.clone();
        const faceId = this._normalToFaceId(normal);
        if (faceId === -1) return null;

        // デフォルトUV(0-1)からセル座標を直接計算
        const uv = intersect.uv;
        if (!uv) return null;

        const faceSize = this.characterData.getFaceSize(hitPartId, faceId);
        const col = Math.min(Math.floor(uv.x * faceSize.cols), faceSize.cols - 1);
        const row = Math.min(faceSize.rows - 1 - Math.floor(uv.y * faceSize.rows), faceSize.rows - 1);

        if (col < 0 || row < 0) return null;

        return { partId: hitPartId, faceId, row, col };
    }

    _normalToFaceId(normal) {
        const abs = Math.abs;
        if (abs(normal.y) > abs(normal.x) && abs(normal.y) > abs(normal.z)) {
            return normal.y > 0 ? 0 : 1;
        }
        if (abs(normal.x) > abs(normal.z)) {
            return normal.x > 0 ? 2 : 3;
        }
        return normal.z > 0 ? 4 : 5;
    }

    /**
     * 指定セルのcanvas上の中心座標（テスト用）
     */
    getCanvasCenterOfCell(partId, faceId, row, col) {
        const THREE = this.THREE;
        const CELL = CharacterEditor.CELL_SIZE;
        const p = CharacterData.PARTS[partId];
        if (!p) return null;

        const w = p.width * CELL, h = p.height * CELL, d = p.depth * CELL;
        const hw = w / 2, hh = h / 2, hd = d / 2;
        const faceSize = this.characterData.getFaceSize(partId, faceId);

        let lx, ly, lz;
        switch (faceId) {
            case 0: lx = -hw + (col + 0.5) * CELL; ly = hh; lz = -hd + (row + 0.5) * CELL; break;
            case 1: lx = -hw + (col + 0.5) * CELL; ly = -hh; lz = -hd + (row + 0.5) * CELL; break;
            case 2: lx = hw; ly = -hh + (faceSize.rows - row - 0.5) * CELL; lz = -hd + (col + 0.5) * CELL; break;
            case 3: lx = -hw; ly = -hh + (faceSize.rows - row - 0.5) * CELL; lz = -hd + (col + 0.5) * CELL; break;
            case 4: lx = -hw + (col + 0.5) * CELL; ly = -hh + (faceSize.rows - row - 0.5) * CELL; lz = hd; break;
            case 5: lx = -hw + (col + 0.5) * CELL; ly = -hh + (faceSize.rows - row - 0.5) * CELL; lz = -hd; break;
            default: return null;
        }

        const mesh = this.partBoxes[partId];
        if (!mesh) return null;

        const worldPos = new THREE.Vector3(lx, ly, lz);
        mesh.localToWorld(worldPos);

        const projected = worldPos.project(this.camera);
        if (projected.z > 1) return null;

        return {
            x: Math.round((projected.x + 1) / 2 * this.canvas.clientWidth),
            y: Math.round((-projected.y + 1) / 2 * this.canvas.clientHeight)
        };
    }

    loadCharacterData(data) {
        this.characterData = data;
        for (const partId of Object.keys(CharacterData.PARTS)) {
            this._updateAllTextures(partId);
        }
    }

    getCharacterData() { return this.characterData; }
}

if (typeof window !== 'undefined') {
    window.CharacterEditor = CharacterEditor;
}
