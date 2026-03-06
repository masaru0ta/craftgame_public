/**
 * RotationAxisBlock.js
 * 回転軸ブロック管理 - 回転体の生成・解除・角度更新
 */
class RotationBody {
    /**
     * @param {number} axisX - 回転軸ブロックのワールドX
     * @param {number} axisY - 回転軸ブロックのワールドY
     * @param {number} axisZ - 回転軸ブロックのワールドZ
     * @param {number} orientation - 回転軸ブロックのorientation
     * @param {Array<{rx:number, ry:number, rz:number, blockId:string}>} blocks - 構成ブロック（軸からの相対座標）
     */
    constructor(axisX, axisY, axisZ, orientation, blocks) {
        this._axisX = axisX;
        this._axisY = axisY;
        this._axisZ = axisZ;
        this._orientation = orientation;
        this._blocks = blocks;
        this._angle = 0;
        this._isRotating = true;
        this._rotationSpeed = Math.PI / 2; // 1.57 rad/s
    }

    get angle() { return this._angle; }
    get isRotating() { return this._isRotating; }
    get blockCount() { return this._blocks.length; }

    /**
     * 構成ブロック一覧を返す（相対座標）
     * @returns {Array<{x:number, y:number, z:number, blockId:string}>}
     */
    GetConnectedBlocks() {
        return this._blocks.map(b => ({
            x: b.rx, y: b.ry, z: b.rz, blockId: b.blockId
        }));
    }

    /**
     * front面の方向ベクトルを返す
     * @returns {{dx:number, dy:number, dz:number}}
     */
    GetFrontDirection() {
        return RotationAxisManager.OrientationToFrontDir(this._orientation);
    }

    /**
     * 角度を更新
     * @param {number} deltaTime - 経過秒数
     */
    Update(deltaTime) {
        if (!this._isRotating) return;
        this._angle += this._rotationSpeed * deltaTime;
    }
}

class RotationAxisManager {
    static _DIRS_6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

    // orientation(0-5) → front面方向のマッピング
    // ゲーム座標系: north=Z+(back), south=Z-(front)
    static _FRONT_DIRS = [
        { dx: 0, dy: 1, dz: 0 },   // 0: top (Y+)
        { dx: 0, dy: -1, dz: 0 },  // 1: bottom (Y-)
        { dx: 0, dy: 0, dz: 1 },   // 2: north (Z+)
        { dx: 0, dy: 0, dz: -1 },  // 3: south (Z-)
        { dx: 1, dy: 0, dz: 0 },   // 4: east (X+)
        { dx: -1, dy: 0, dz: 0 },  // 5: west (X-)
    ];

    /**
     * orientationからfront面の方向を返す
     * orientation 0-5 がそのまま _FRONT_DIRS のインデックス
     * @param {number} orientation - 0〜5
     * @returns {{dx:number, dy:number, dz:number}}
     */
    static OrientationToFrontDir(orientation) {
        return RotationAxisManager._FRONT_DIRS[orientation] || { dx: 0, dy: 1, dz: 0 };
    }

    /**
     * @param {ChunkManager} chunkManager
     * @param {THREE.Scene} scene
     * @param {TextureLoader} textureLoader
     */
    constructor(chunkManager, scene, textureLoader) {
        this._chunkManager = chunkManager;
        this._scene = scene;
        this._textureLoader = textureLoader;
        /** @type {Map<string, RotationBody>} key: "x,y,z" */
        this._bodies = new Map();
        /** @type {Map<string, RotationBodyMesh>} key: "x,y,z" */
        this._meshes = new Map();
    }

    /**
     * ワールド上の全回転体を返す
     * @returns {Array<RotationBody>}
     */
    GetAllBodies() {
        return Array.from(this._bodies.values());
    }

    /**
     * 指定座標の回転軸に紐づく回転体を返す
     * @param {number} wx
     * @param {number} wy
     * @param {number} wz
     * @returns {RotationBody|null}
     */
    GetBodyAt(wx, wy, wz) {
        return this._bodies.get(`${wx},${wy},${wz}`) || null;
    }

    /**
     * 回転体の生成/解除をトグル
     * @param {number} wx - 回転軸ブロックのワールドX
     * @param {number} wy - 回転軸ブロックのワールドY
     * @param {number} wz - 回転軸ブロックのワールドZ
     */
    ToggleBody(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        if (this._bodies.has(key)) {
            this._dissolveBody(key);
        } else {
            this._createBody(wx, wy, wz);
        }
    }

    /**
     * 回転体を生成
     */
    _createBody(wx, wy, wz) {
        // 回転軸ブロックのorientationを取得
        const orientation = this._getOrientation(wx, wy, wz);
        if (orientation === null) return;

        const front = RotationAxisManager.OrientationToFrontDir(orientation);

        // front面の隣接ブロックを起点にBFS
        const startX = wx + front.dx;
        const startY = wy + front.dy;
        const startZ = wz + front.dz;

        const startBlock = this._getBlockAt(startX, startY, startZ);
        if (!startBlock || startBlock === 'air') return;

        // BFS連結検出
        const blocks = this._bfsDetect(startX, startY, startZ, wx, wy, wz, front);
        if (blocks.length === 0) return;

        // 回転体生成
        const body = new RotationBody(wx, wy, wz, orientation, blocks);
        const key = `${wx},${wy},${wz}`;
        this._bodies.set(key, body);

        // ブロックをチャンクデータからairに置換 + ライトマップ更新
        for (const b of blocks) {
            const bx = wx + b.rx, by = wy + b.ry, bz = wz + b.rz;
            this._setBlockAt(bx, by, bz, 'air');
            this._updateLight(bx, by, bz, true);
        }

        // 影響チャンクのメッシュ再構築
        this._rebuildAffectedChunks(wx, wy, wz, blocks);

        // 回転体メッシュ生成
        if (typeof RotationBodyMesh !== 'undefined') {
            const mesh = new RotationBodyMesh(body, this._textureLoader, this._chunkManager);
            mesh.Build();
            this._scene.add(mesh.GetGroup());
            this._meshes.set(key, mesh);
        }
    }

    /**
     * 回転体を解除（ブロック群を地形に復元）
     */
    _dissolveBody(key) {
        const body = this._bodies.get(key);
        if (!body) return;

        const wx = body._axisX;
        const wy = body._axisY;
        const wz = body._axisZ;
        const front = body.GetFrontDirection();
        // 90°ステップ数を整数で求める（浮動小数点誤差を排除）
        const steps = ((Math.round(body._angle / (Math.PI / 2)) % 4) + 4) % 4;

        // 回転体の構成ブロックを整数90°回転で復元 + ライトマップ更新
        const restoredBlocks = [];
        for (const b of body._blocks) {
            const restored = this._rotate90(b.rx, b.ry, b.rz, front, steps);
            const bx = wx + restored.x, by = wy + restored.y, bz = wz + restored.z;
            const newOri = (steps !== 0 && b.orientation !== undefined)
                ? this._rotateOrientation(b.orientation, front, steps)
                : (b.orientation || 0);
            this._setBlockAt(bx, by, bz, b.blockId, newOri);
            this._updateLight(bx, by, bz, false);
            restoredBlocks.push({ rx: restored.x, ry: restored.y, rz: restored.z });
        }

        // メッシュ削除
        const mesh = this._meshes.get(key);
        if (mesh) {
            this._scene.remove(mesh.GetGroup());
            mesh.Dispose();
            this._meshes.delete(key);
        }

        this._bodies.delete(key);

        // チャンクメッシュ再構築（元の位置と復元位置の両方）
        this._rebuildAffectedChunks(wx, wy, wz, body._blocks);
        if (steps !== 0) {
            this._rebuildAffectedChunks(wx, wy, wz, restoredBlocks);
        }
    }

    /**
     * 回転軸ブロック破壊時の処理（解除と同じ）
     * @param {number} wx
     * @param {number} wy
     * @param {number} wz
     */
    OnAxisDestroyed(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        if (this._bodies.has(key)) {
            this._dissolveBody(key);
        }
    }

    /**
     * 毎フレーム更新
     * @param {number} deltaTime
     */
    Update(deltaTime) {
        for (const [key, body] of this._bodies) {
            body.Update(deltaTime);
            const mesh = this._meshes.get(key);
            if (mesh) {
                mesh.UpdateRotation(body._angle);
            }
        }
    }

    /**
     * BFS連結検出
     * front面の隣接ブロックを起点に、回転軸の反対方向には広がらない
     */
    _bfsDetect(startX, startY, startZ, axisX, axisY, axisZ, front) {
        const blocks = [];
        const visited = new Set();
        const queue = [[startX, startY, startZ]];
        let head = 0;
        visited.add(`${startX},${startY},${startZ}`);

        // front方向の境界座標（ドット積で比較）
        const boundary = front.dx * axisX + front.dy * axisY + front.dz * axisZ;

        while (head < queue.length && blocks.length < 4096) {
            const [cx, cy, cz] = queue[head++];

            const blockId = this._getBlockAt(cx, cy, cz);
            if (!blockId || blockId === 'air') continue;

            const orientation = this._getOrientation(cx, cy, cz) || 0;
            blocks.push({
                rx: cx - axisX,
                ry: cy - axisY,
                rz: cz - axisZ,
                blockId,
                orientation
            });

            for (const [dx, dy, dz] of RotationAxisManager._DIRS_6) {
                const nx = cx + dx;
                const ny = cy + dy;
                const nz = cz + dz;

                // front面の反対側（軸ブロック側）には広げない
                // ドット積が境界以下ならfront方向で軸より手前 → 除外
                if (front.dx * nx + front.dy * ny + front.dz * nz <= boundary) continue;

                const nKey = `${nx},${ny},${nz}`;
                if (visited.has(nKey)) continue;
                visited.add(nKey);

                const nBlock = this._getBlockAt(nx, ny, nz);
                if (!nBlock || nBlock === 'air') continue;

                queue.push([nx, ny, nz]);
            }
        }

        return blocks;
    }

    /**
     * 90°整数ステップで相対座標を回転（浮動小数点誤差なし）
     * @param {number} rx - 軸からの相対X
     * @param {number} ry - 軸からの相対Y
     * @param {number} rz - 軸からの相対Z
     * @param {{dx:number, dy:number, dz:number}} front - 回転軸方向
     * @param {number} steps - 90°ステップ数 (0-3)
     * @returns {{x:number, y:number, z:number}}
     */
    _rotate90(rx, ry, rz, front, steps) {
        if (steps === 0) return { x: rx, y: ry, z: rz };

        let a = rx, b = rz; // Y軸回転の場合
        if (front.dz !== 0) { a = rx; b = ry; }
        else if (front.dx !== 0) { a = ry; b = rz; }

        // 左手座標系での90°×steps回転: (a,b) → (b,-a) → (-a,-b) → (-b,a)
        for (let i = 0; i < steps; i++) {
            const tmp = a;
            a = b;
            b = -tmp;
        }

        if (front.dy !== 0) return { x: a, y: ry, z: b };
        if (front.dz !== 0) return { x: a, y: b, z: rz };
        return { x: rx, y: a, z: b };
    }

    /**
     * 回転体の回転に応じてカスタムブロックの orientation (0-23) を変換
     * @param {number} orientation - 元の orientation (0-23)
     * @param {{dx:number, dy:number, dz:number}} front - 回転軸方向
     * @param {number} steps - 90°ステップ数 (1-3)
     * @returns {number} 新しい orientation (0-23)
     */
    _rotateOrientation(orientation, front, steps) {
        if (typeof ChunkMeshBuilder === 'undefined' || !ChunkMeshBuilder.ORIENTATION_MATRICES) {
            return orientation;
        }
        const origM = ChunkMeshBuilder.ORIENTATION_MATRICES[orientation];
        if (!origM) return orientation;

        // 回転体の90°回転を3x3行列として構築
        const bodyM = this._buildBodyRotationMatrix(front, steps);

        // 合成: bodyM × origM
        const composed = [
            bodyM[0]*origM[0]+bodyM[1]*origM[3]+bodyM[2]*origM[6], bodyM[0]*origM[1]+bodyM[1]*origM[4]+bodyM[2]*origM[7], bodyM[0]*origM[2]+bodyM[1]*origM[5]+bodyM[2]*origM[8],
            bodyM[3]*origM[0]+bodyM[4]*origM[3]+bodyM[5]*origM[6], bodyM[3]*origM[1]+bodyM[4]*origM[4]+bodyM[5]*origM[7], bodyM[3]*origM[2]+bodyM[4]*origM[5]+bodyM[5]*origM[8],
            bodyM[6]*origM[0]+bodyM[7]*origM[3]+bodyM[8]*origM[6], bodyM[6]*origM[1]+bodyM[7]*origM[4]+bodyM[8]*origM[7], bodyM[6]*origM[2]+bodyM[7]*origM[5]+bodyM[8]*origM[8]
        ];

        // 誤差除去
        for (let i = 0; i < 9; i++) {
            const v = composed[i];
            if (Math.abs(v) < 0.5) composed[i] = 0;
            else composed[i] = v > 0 ? 1 : -1;
        }

        // ORIENTATION_MATRICES から一致する orientation を逆引き
        const matrices = ChunkMeshBuilder.ORIENTATION_MATRICES;
        for (let i = 0; i < 24; i++) {
            const m = matrices[i];
            let match = true;
            for (let j = 0; j < 9; j++) {
                if (m[j] !== composed[j]) { match = false; break; }
            }
            if (match) return i;
        }
        return orientation; // 一致しない場合は元のまま
    }

    /**
     * 回転体の回転（front方向×steps）を3x3行列として構築
     */
    _buildBodyRotationMatrix(front, steps) {
        // _rotate90 と同じロジックを行列化
        // (a,b) → (b,-a) を1ステップとする
        // Y軸回転(front.dy≠0): (x,z)平面で回転
        // Z軸回転(front.dz≠0): (x,y)平面で回転
        // X軸回転(front.dx≠0): (y,z)平面で回転
        let m = [1,0,0, 0,1,0, 0,0,1]; // identity

        for (let i = 0; i < steps; i++) {
            let r;
            if (front.dy > 0) {
                // Y+軸: (x,z)→(z,-x)
                r = [0,0,1, 0,1,0, -1,0,0];
            } else if (front.dy < 0) {
                // Y-軸: (x,z)→(-z,x)
                r = [0,0,-1, 0,1,0, 1,0,0];
            } else if (front.dz > 0) {
                // Z+軸: (x,y)→(y,-x)
                r = [0,1,0, -1,0,0, 0,0,1];
            } else if (front.dz < 0) {
                // Z-軸: (x,y)→(-y,x)
                r = [0,-1,0, 1,0,0, 0,0,1];
            } else if (front.dx > 0) {
                // X+軸: (y,z)→(z,-y)
                r = [1,0,0, 0,0,1, 0,-1,0];
            } else {
                // X-軸: (y,z)→(-z,y)
                r = [1,0,0, 0,0,-1, 0,1,0];
            }
            // m = r × m
            const n = [
                r[0]*m[0]+r[1]*m[3]+r[2]*m[6], r[0]*m[1]+r[1]*m[4]+r[2]*m[7], r[0]*m[2]+r[1]*m[5]+r[2]*m[8],
                r[3]*m[0]+r[4]*m[3]+r[5]*m[6], r[3]*m[1]+r[4]*m[4]+r[5]*m[7], r[3]*m[2]+r[4]*m[5]+r[5]*m[8],
                r[6]*m[0]+r[7]*m[3]+r[8]*m[6], r[6]*m[1]+r[7]*m[4]+r[8]*m[7], r[6]*m[2]+r[7]*m[5]+r[8]*m[8]
            ];
            m = n;
        }
        return m;
    }

    /**
     * ワールド座標をチャンクローカル座標に解決
     * @returns {{cd: ChunkData, lx: number, ly: number, lz: number}|null}
     */
    _resolve(wx, wy, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.chunkData) return null;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return null;
        return { cd: chunk.chunkData, lx: ((wx % 16) + 16) % 16, ly, lz: ((wz % 16) + 16) % 16 };
    }

    _getBlockAt(wx, wy, wz) {
        const r = this._resolve(wx, wy, wz);
        return r ? r.cd.getBlock(r.lx, r.ly, r.lz) : null;
    }

    _getOrientation(wx, wy, wz) {
        const r = this._resolve(wx, wy, wz);
        return r ? r.cd.getOrientation(r.lx, r.ly, r.lz) : null;
    }

    _setBlockAt(wx, wy, wz, blockId, orientation = 0) {
        const r = this._resolve(wx, wy, wz);
        if (r) r.cd.setBlock(r.lx, r.ly, r.lz, blockId, orientation);
    }

    /**
     * ブロック変更後のライトマップ更新
     * @param {number} wx - ワールドX
     * @param {number} wy - ワールドY
     * @param {number} wz - ワールドZ
     * @param {boolean} removed - ブロックが除去されたか（true=air化, false=設置）
     */
    _updateLight(wx, wy, wz, removed) {
        const lc = this._chunkManager.lightCalculator;
        if (!lc) return;
        const r = this._resolve(wx, wy, wz);
        if (!r) return;
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const neighbors = this._chunkManager._getNeighborChunks(cx, cz);
        if (removed) {
            lc.onBlockRemoved(r.cd, r.lx, r.ly, r.lz, neighbors);
        } else {
            lc.onBlockPlaced(r.cd, r.lx, r.ly, r.lz, neighbors);
        }
    }

    /**
     * 影響チャンクのメッシュを再構築
     */
    _rebuildAffectedChunks(axisX, axisY, axisZ, blocks) {
        const affectedChunks = new Set();
        for (const b of blocks) {
            const wx = axisX + b.rx;
            const wz = axisZ + b.rz;
            const cx = Math.floor(wx / 16);
            const cz = Math.floor(wz / 16);
            affectedChunks.add(`${cx},${cz}`);
            // チャンク境界のブロックは隣接チャンクにも影響
            const lx = ((wx % 16) + 16) % 16;
            const lz = ((wz % 16) + 16) % 16;
            if (lx === 0)  affectedChunks.add(`${cx - 1},${cz}`);
            if (lx === 15) affectedChunks.add(`${cx + 1},${cz}`);
            if (lz === 0)  affectedChunks.add(`${cx},${cz - 1}`);
            if (lz === 15) affectedChunks.add(`${cx},${cz + 1}`);
        }
        // 軸ブロック自体のチャンクも
        affectedChunks.add(`${Math.floor(axisX / 16)},${Math.floor(axisZ / 16)}`);

        for (const key of affectedChunks) {
            const [cx, cz] = key.split(',').map(Number);
            this._chunkManager.rebuildChunkMesh(cx, cz);
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.RotationBody = RotationBody;
    window.RotationAxisManager = RotationAxisManager;
}
