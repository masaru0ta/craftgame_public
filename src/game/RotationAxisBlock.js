/**
 * RotationAxisBlock.js
 * 回転軸ブロック管理 - 回転体の生成・解除・角度更新
 */
/**
 * 相対座標 (rx,ry,rz) を1つの整数キーにパックする（範囲 -128〜127）
 * @param {number} rx
 * @param {number} ry
 * @param {number} rz
 * @returns {number}
 */
function packBlockKey(rx, ry, rz) {
    return ((rx + 128) << 16) | ((ry + 128) << 8) | (rz + 128);
}

class RotationBody {
    /**
     * @param {number} axisX - 回転軸ブロックのワールドX
     * @param {number} axisY - 回転軸ブロックのワールドY
     * @param {number} axisZ - 回転軸ブロックのワールドZ
     * @param {number} orientation - 回転軸ブロックのorientation
     * @param {Array<{rx:number, ry:number, rz:number, blockId:string}>} blocks - 構成ブロック（軸からの相対座標）
     */
    constructor(axisX, axisY, axisZ, orientation, blocks, stopAt90 = false) {
        this._axisX = axisX;
        this._axisY = axisY;
        this._axisZ = axisZ;
        this._orientation = orientation;
        this._blocks = blocks;
        // 整数キーSetで文字列生成を回避
        this._blockSet = new Set(blocks.map(b => packBlockKey(b.rx, b.ry, b.rz)));
        this._angle = 0;
        this._isRotating = true;
        this._rotationSpeed = Math.PI / 2; // 1.57 rad/s
        this._stopAt90 = stopAt90; // 90度で自動停止するか
        this._parentBody = null; // 親回転体（入れ子の場合）
        // front方向をキャッシュ（毎フレームの再計算を回避）
        const f = RotationAxisManager._FRONT_DIRS[orientation] || RotationAxisManager._FRONT_DIRS[0];
        this._frontDx = f.dx;
        this._frontDy = f.dy;
        this._frontDz = f.dz;
        // 軸中心座標をキャッシュ
        this._centerX = axisX + 0.5;
        this._centerY = axisY + 0.5;
        this._centerZ = axisZ + 0.5;
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
        return { dx: this._frontDx, dy: this._frontDy, dz: this._frontDz };
    }

    /**
     * 角度を更新
     * @param {number} deltaTime - 経過秒数
     * @returns {boolean} 90度停止に達したらtrue
     */
    Update(deltaTime) {
        if (!this._isRotating) return false;
        this._angle += this._rotationSpeed * deltaTime;
        if (this._stopAt90 && Math.abs(this._angle) >= Math.PI / 2) {
            // 90度ぴったりにスナップ
            this._angle = (this._rotationSpeed > 0 ? 1 : -1) * Math.PI / 2;
            this._isRotating = false;
            return true;
        }
        return false;
    }
}

class RotationAxisManager {
    static _DIRS_6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

    // 回転軸として扱うブロックIDの集合
    static _ROTOR_IDS = new Set(['rotor', 'rotor_90']);

    // 回転体に含めないブロック（自然ブロック）
    static _NON_ROTATABLE = new Set(['stone', 'dirt', 'grass', 'sand', 'water']);

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

    // front方向ごとの1ステップ回転行列（左手座標系 (a,b)→(b,-a)）
    static _STEP_MATRICES = {
        'dy+':  [0,0,1, 0,1,0, -1,0,0],  // Y+軸: (x,z)→(z,-x)
        'dy-':  [0,0,-1, 0,1,0, 1,0,0],   // Y-軸: (x,z)→(-z,x)
        'dz+':  [0,1,0, -1,0,0, 0,0,1],   // Z+軸: (x,y)→(y,-x)
        'dz-':  [0,-1,0, 1,0,0, 0,0,1],   // Z-軸: (x,y)→(-y,x)
        'dx+':  [1,0,0, 0,0,1, 0,-1,0],   // X+軸: (y,z)→(z,-y)
        'dx-':  [1,0,0, 0,0,-1, 0,1,0],   // X-軸: (y,z)→(-z,y)
    };

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
        /** @type {Map<string, number>} 次の回転方向(1=CW, -1=CCW) key: "x,y,z" */
        this._nextDirection = new Map();
        // GetAllBodies用キャッシュ（_bodiesが変わったらdirty）
        this._bodiesCache = [];
        this._bodiesCacheDirty = true;
        // 座標変換用の再利用オブジェクト
        this._tmpVec = { x: 0, y: 0, z: 0 };
    }

    /**
     * ワールド上の全回転体を返す
     * @returns {Array<RotationBody>}
     */
    GetAllBodies() {
        if (this._bodiesCacheDirty) {
            this._bodiesCache = Array.from(this._bodies.values());
            this._bodiesCacheDirty = false;
        }
        return this._bodiesCache;
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
            // 回転中 → 解除して次の方向を反転
            const body = this._bodies.get(key);
            const currentDir = body._rotationSpeed > 0 ? 1 : -1;
            this._nextDirection.set(key, -currentDir);
            this._dissolveBody(key);
        } else {
            this._createBody(wx, wy, wz);
        }
    }

    /**
     * 回転体を解除（公開API）
     * @param {number} wx
     * @param {number} wy
     * @param {number} wz
     */
    DissolveBody(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        if (this._bodies.has(key)) {
            this._dissolveBody(key);
            this._nextDirection.delete(key);
        }
    }

    /**
     * 回転体を生成
     */
    _createBody(wx, wy, wz) {
        // 回転軸ブロックのorientationを取得
        let orientation = this._getOrientation(wx, wy, wz);

        // 軸ブロックのIDを取得
        let axisBlockId = this._getBlockAt(wx, wy, wz);

        // チャンクデータにない場合（親回転体内のrotor）、親のブロックリストから取得
        let parentBody = null;
        if (orientation === null || axisBlockId === 'air') {
            for (const [, body] of this._bodies) {
                for (const b of body._blocks) {
                    if (RotationAxisManager._ROTOR_IDS.has(b.blockId) &&
                        body._axisX + b.rx === wx &&
                        body._axisY + b.ry === wy &&
                        body._axisZ + b.rz === wz) {
                        orientation = b.orientation;
                        axisBlockId = b.blockId;
                        parentBody = body;
                        break;
                    }
                }
                if (parentBody) break;
            }
        }
        if (orientation === null) return;

        const front = RotationAxisManager.OrientationToFrontDir(orientation);

        // front面の隣接ブロックを起点にBFS
        const startX = wx + front.dx;
        const startY = wy + front.dy;
        const startZ = wz + front.dz;

        let startBlock = this._getBlockAt(startX, startY, startZ);
        // 親回転体内のブロックもチェック
        if ((!startBlock || startBlock === 'air') && parentBody) {
            const srx = startX - parentBody._axisX;
            const sry = startY - parentBody._axisY;
            const srz = startZ - parentBody._axisZ;
            for (const b of parentBody._blocks) {
                if (b.rx === srx && b.ry === sry && b.rz === srz) {
                    startBlock = b.blockId;
                    break;
                }
            }
        }
        if (!startBlock || startBlock === 'air' || RotationAxisManager._NON_ROTATABLE.has(startBlock)) return;

        // BFS連結検出（親回転体内の場合は親のブロック情報を使用）
        const blocks = parentBody
            ? this._bfsDetectFromParent(startX, startY, startZ, wx, wy, wz, front, parentBody)
            : this._bfsDetect(startX, startY, startZ, wx, wy, wz, front);
        if (blocks.length === 0) return;

        // 回転体生成
        const stopAt90 = (axisBlockId === 'rotor_90');
        const body = new RotationBody(wx, wy, wz, orientation, blocks, stopAt90);
        const key = `${wx},${wy},${wz}`;
        // 前回の回転方向の記憶があれば反映
        const dir = this._nextDirection.get(key);
        if (dir === -1) {
            body._rotationSpeed = -Math.abs(body._rotationSpeed);
        }
        this._bodies.set(key, body);
        this._bodiesCacheDirty = true;

        // 親回転体内から生成された場合は明示的に親子関係を設定
        if (parentBody) {
            body._parentBody = parentBody;
        }

        // 親子関係の検出（parentBodyが未設定の場合のみ）
        if (!body._parentBody) for (const [, existingBody] of this._bodies) {
            if (existingBody === body) continue;
            // ケース1: 新しい回転体の軸が既存回転体のブロック上 → 新しい回転体が子
            const local = this.WorldToLocal(existingBody, body._centerX, body._centerY, body._centerZ);
            const rx = Math.round(local.x - 0.5) - existingBody._axisX;
            const ry = Math.round(local.y - 0.5) - existingBody._axisY;
            const rz = Math.round(local.z - 0.5) - existingBody._axisZ;
            if (existingBody._blockSet.has(packBlockKey(rx, ry, rz))) {
                body._parentBody = existingBody;
                break;
            }
            // ケース2: 既存回転体の軸が新しい回転体のブロック上 → 既存回転体が子
            if (existingBody._parentBody === null) {
                const local2 = this.WorldToLocal(body, existingBody._centerX, existingBody._centerY, existingBody._centerZ);
                const rx2 = Math.round(local2.x - 0.5) - body._axisX;
                const ry2 = Math.round(local2.y - 0.5) - body._axisY;
                const rz2 = Math.round(local2.z - 0.5) - body._axisZ;
                if (body._blockSet.has(packBlockKey(rx2, ry2, rz2))) {
                    existingBody._parentBody = body;
                }
            }
        }

        // ブロックをチャンクデータからairに置換 + ライトマップ更新
        for (const b of blocks) {
            const bx = wx + b.rx, by = wy + b.ry, bz = wz + b.rz;
            this._setBlockAt(bx, by, bz, 'air');
            this._updateLight(bx, by, bz, true);
        }

        // 親回転体から子のブロックを除外してメッシュ再構築
        if (body._parentBody) {
            const childBlockKeys = new Set(blocks.map(b =>
                packBlockKey(b.rx + wx - body._parentBody._axisX,
                             b.ry + wy - body._parentBody._axisY,
                             b.rz + wz - body._parentBody._axisZ)));
            // 軸ブロック自身も除外（子rotorのブロック）
            childBlockKeys.add(packBlockKey(wx - body._parentBody._axisX,
                                            wy - body._parentBody._axisY,
                                            wz - body._parentBody._axisZ));
            body._parentBody._blocks = body._parentBody._blocks.filter(b =>
                !childBlockKeys.has(packBlockKey(b.rx, b.ry, b.rz)));
            body._parentBody._blockSet = new Set(
                body._parentBody._blocks.map(b => packBlockKey(b.rx, b.ry, b.rz)));
            // 親メッシュ再構築
            const parentKey = `${body._parentBody._axisX},${body._parentBody._axisY},${body._parentBody._axisZ}`;
            const parentMesh = this._meshes.get(parentKey);
            if (parentMesh) {
                parentMesh.Build();
            }
        }

        // 影響チャンクのメッシュ再構築
        this._rebuildAffectedChunks(wx, wy, wz, blocks);

        // 回転体メッシュ生成
        if (typeof RotationBodyMesh !== 'undefined') {
            const mesh = new RotationBodyMesh(body, this._textureLoader, this._chunkManager);
            mesh.Build();
            this._scene.add(mesh.GetGroup());
            this._meshes.set(key, mesh);

            // メッシュ親子化
            if (body._parentBody) {
                // ケース1: 新bodyが子 → 親メッシュの子にする
                this._reparentMesh(body);
            }
            // ケース2: 既存bodyが子になった → 既存メッシュを新bodyの子にする
            for (const [, existingBody] of this._bodies) {
                if (existingBody !== body && existingBody._parentBody === body) {
                    this._reparentMesh(existingBody);
                }
            }
        }
    }

    /**
     * 子回転体のメッシュを親メッシュグループの子に移動
     * @param {RotationBody} childBody - 子回転体（_parentBodyが設定済み）
     */
    _reparentMesh(childBody) {
        const childKey = `${childBody._axisX},${childBody._axisY},${childBody._axisZ}`;
        const childMesh = this._meshes.get(childKey);
        const parentKey = `${childBody._parentBody._axisX},${childBody._parentBody._axisY},${childBody._parentBody._axisZ}`;
        const parentMesh = this._meshes.get(parentKey);
        if (!childMesh || !parentMesh) return;

        const group = childMesh.GetGroup();
        // シーンから外して親メッシュの子に追加
        this._scene.remove(group);
        parentMesh.GetGroup().add(group);
        // 位置を親の軸中心からの相対座標に変更
        const px = childBody._parentBody._axisX + 0.5;
        const py = childBody._parentBody._axisY + 0.5;
        const pz = childBody._parentBody._axisZ + 0.5;
        group.position.set(
            childBody._axisX + 0.5 - px,
            childBody._axisY + 0.5 - py,
            childBody._axisZ + 0.5 - pz
        );
    }

    /**
     * 回転体を解除（ブロック群を地形に復元）
     */
    _dissolveBody(key) {
        const body = this._bodies.get(key);
        if (!body) return;

        // 子回転体を先に解除
        const childKeys = [];
        for (const [childKey, childBody] of this._bodies) {
            if (childBody._parentBody === body) {
                childKeys.push(childKey);
            }
        }
        for (const childKey of childKeys) {
            this._dissolveBody(childKey);
        }

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
            let newOri = b.orientation || 0;
            if (steps !== 0 && b.orientation !== undefined) {
                if (b.orientation >= 101 && b.orientation <= 106) {
                    newOri = this._rotateHalfOrientation(b.orientation, front, steps);
                } else {
                    const blockDef = this._textureLoader ? this._textureLoader.getBlockDef(b.blockId) : null;
                    if (blockDef && blockDef.shape_type === 'custom') {
                        // カスタムブロック: 0-23回転行列で変換
                        newOri = this._rotateOrientation(b.orientation, front, steps);
                    } else if (blockDef && (blockDef.rotatable || blockDef.sidePlaceable)) {
                        // rotatable/sidePlaceable ブロック: 0-23回転行列で変換
                        newOri = this._rotateOrientation(b.orientation, front, steps);
                    } else {
                        newOri = 0;
                    }
                }
            }
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
        this._bodiesCacheDirty = true;

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
        if (this._bodies.size === 0) return;
        const keysToDissolve = [];
        for (const [key, body] of this._bodies) {
            const stopped = body.Update(deltaTime);
            const mesh = this._meshes.get(key);
            if (mesh) {
                mesh.UpdateRotation(body._angle);
            }
            if (stopped) {
                keysToDissolve.push(key);
            }
        }
        for (const key of keysToDissolve) {
            const body = this._bodies.get(key);
            if (body) {
                const currentDir = body._rotationSpeed > 0 ? 1 : -1;
                this._nextDirection.set(key, -currentDir);
            }
            this._dissolveBody(key);
        }
    }

    /**
     * ワールド座標をローカル座標に変換（逆回転）
     * @param {RotationBody} body - 回転体
     * @param {number} wx - ワールドX
     * @param {number} wy - ワールドY
     * @param {number} wz - ワールドZ
     * @returns {{x:number, y:number, z:number}} ローカル座標
     */
    WorldToLocal(body, wx, wy, wz) {
        // 親がいる場合、まず親のローカル空間に変換（ループで再帰回避）
        let b = body._parentBody;
        if (b) {
            // 親チェーンを配列に集める（通常1〜2段）
            const chain = [b];
            while (b._parentBody) { b = b._parentBody; chain.push(b); }
            // 最上位の親から順に逆回転
            for (let i = chain.length - 1; i >= 0; i--) {
                const p = chain[i];
                const dx = wx - p._centerX, dy = wy - p._centerY, dz = wz - p._centerZ;
                this._rotatePointInPlace(dx, dy, dz, p._frontDx, p._frontDy, p._frontDz, -p._angle);
                wx = this._tmpVec.x + p._centerX;
                wy = this._tmpVec.y + p._centerY;
                wz = this._tmpVec.z + p._centerZ;
            }
        }
        const dx = wx - body._centerX, dy = wy - body._centerY, dz = wz - body._centerZ;
        this._rotatePointInPlace(dx, dy, dz, body._frontDx, body._frontDy, body._frontDz, -body._angle);
        this._tmpVec.x += body._centerX;
        this._tmpVec.y += body._centerY;
        this._tmpVec.z += body._centerZ;
        return this._tmpVec;
    }

    /**
     * ローカル座標をワールド座標に変換（正回転）
     * @param {RotationBody} body - 回転体
     * @param {number} lx - ローカルX
     * @param {number} ly - ローカルY
     * @param {number} lz - ローカルZ
     * @returns {{x:number, y:number, z:number}} ワールド座標
     */
    LocalToWorld(body, lx, ly, lz) {
        // 自身の正回転
        let dx = lx - body._centerX, dy = ly - body._centerY, dz = lz - body._centerZ;
        this._rotatePointInPlace(dx, dy, dz, body._frontDx, body._frontDy, body._frontDz, body._angle);
        let rx = this._tmpVec.x + body._centerX;
        let ry = this._tmpVec.y + body._centerY;
        let rz = this._tmpVec.z + body._centerZ;
        // 親チェーンを辿って正回転（ループで再帰回避）
        let p = body._parentBody;
        while (p) {
            dx = rx - p._centerX; dy = ry - p._centerY; dz = rz - p._centerZ;
            this._rotatePointInPlace(dx, dy, dz, p._frontDx, p._frontDy, p._frontDz, p._angle);
            rx = this._tmpVec.x + p._centerX;
            ry = this._tmpVec.y + p._centerY;
            rz = this._tmpVec.z + p._centerZ;
            p = p._parentBody;
        }
        this._tmpVec.x = rx; this._tmpVec.y = ry; this._tmpVec.z = rz;
        return this._tmpVec;
    }

    /**
     * 回転軸に応じて点を回転し、結果を _tmpVec に書き込む（オブジェクト生成なし）
     * @param {number} dx - 軸中心からのX
     * @param {number} dy - 軸中心からのY
     * @param {number} dz - 軸中心からのZ
     * @param {number} frontDx
     * @param {number} frontDy
     * @param {number} frontDz
     * @param {number} angle - 回転角度
     */
    _rotatePointInPlace(dx, dy, dz, frontDx, frontDy, frontDz, angle) {
        const out = this._tmpVec;
        if (frontDy !== 0) {
            const theta = frontDy * angle;
            const cos = Math.cos(theta), sin = Math.sin(theta);
            out.x = dx * cos + dz * sin; out.y = dy; out.z = -dx * sin + dz * cos;
        } else if (frontDz !== 0) {
            const theta = frontDz * angle;
            const cos = Math.cos(theta), sin = Math.sin(theta);
            out.x = dx * cos + dy * sin; out.y = -dx * sin + dy * cos; out.z = dz;
        } else {
            const theta = frontDx * angle;
            const cos = Math.cos(theta), sin = Math.sin(theta);
            out.x = dx; out.y = dy * cos + dz * sin; out.z = -dy * sin + dz * cos;
        }
    }

    /**
     * プレイヤーAABBを逆回転し、ローカル空間で衝突する回転体ブロックのAABBリストを返す
     * @param {RotationBody} body - 回転体
     * @param {{minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number}} worldAABB - ワールド空間のAABB
     * @returns {Array<{minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number}>}
     */
    GetLocalCollidingBlocks(body, worldAABB) {
        // 幾何中心を逆回転
        const halfW = (worldAABB.maxX - worldAABB.minX) / 2;
        const halfH = (worldAABB.maxY - worldAABB.minY) / 2;
        const centerX = (worldAABB.minX + worldAABB.maxX) / 2;
        const centerY = (worldAABB.minY + worldAABB.maxY) / 2;
        const centerZ = (worldAABB.minZ + worldAABB.maxZ) / 2;

        const local = this.WorldToLocal(body, centerX, centerY, centerZ);
        // WorldToLocalの結果は_tmpVecなのでローカル変数にコピー
        const lx = local.x, ly = local.y, lz = local.z;

        // ローカル空間でAABB範囲
        const lMinX = lx - halfW, lMinY = ly - halfH, lMinZ = lz - halfW;
        const lMaxX = lx + halfW, lMaxY = ly + halfH, lMaxZ = lz + halfW;

        // ローカルAABB範囲の整数座標をチェック
        const result = [];
        const ax = body._axisX, ay = body._axisY, az = body._axisZ;
        const blockSet = body._blockSet;
        const xMin = Math.floor(lMinX), xMax = Math.floor(lMaxX);
        const yMin = Math.floor(lMinY), yMax = Math.floor(lMaxY);
        const zMin = Math.floor(lMinZ), zMax = Math.floor(lMaxZ);

        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                for (let z = zMin; z <= zMax; z++) {
                    if (blockSet.has(packBlockKey(x - ax, y - ay, z - az))) {
                        // ローカルAABBとの交差判定（ブロックAABBは x..x+1, y..y+1, z..z+1）
                        if (lMinX < x + 1 && lMaxX > x &&
                            lMinY < y + 1 && lMaxY > y &&
                            lMinZ < z + 1 && lMaxZ > z) {
                            result.push({ minX: x, minY: y, minZ: z, maxX: x + 1, maxY: y + 1, maxZ: z + 1 });
                        }
                    }
                }
            }
        }
        return result;
    }

    /**
     * BFS連結検出
     * front面の隣接ブロックを起点に、回転軸の反対方向には広がらない
     */
    _bfsDetect(startX, startY, startZ, axisX, axisY, axisZ, front) {
        const blocks = [];
        const visited = new Set();
        // フラット配列でキュー管理（配列生成を回避）
        const queue = [startX, startY, startZ];
        let head = 0;
        visited.add(packBlockKey(startX - axisX, startY - axisY, startZ - axisZ));

        // front方向の境界座標（ドット積で比較）
        const fdx = front.dx, fdy = front.dy, fdz = front.dz;
        const boundary = fdx * axisX + fdy * axisY + fdz * axisZ;

        while (head < queue.length && blocks.length < 4096) {
            const cx = queue[head], cy = queue[head + 1], cz = queue[head + 2];
            head += 3;

            const blockId = this._getBlockAt(cx, cy, cz);
            if (!blockId || blockId === 'air' || RotationAxisManager._NON_ROTATABLE.has(blockId)) continue;

            const orientation = this._getOrientation(cx, cy, cz) || 0;
            blocks.push({
                rx: cx - axisX,
                ry: cy - axisY,
                rz: cz - axisZ,
                blockId,
                orientation
            });

            for (const [dx, dy, dz] of RotationAxisManager._DIRS_6) {
                const nx = cx + dx, ny = cy + dy, nz = cz + dz;

                // front面の反対側（軸ブロック側）には広げない
                if (fdx * nx + fdy * ny + fdz * nz <= boundary) continue;

                const nKey = packBlockKey(nx - axisX, ny - axisY, nz - axisZ);
                if (visited.has(nKey)) continue;
                visited.add(nKey);

                const nBlock = this._getBlockAt(nx, ny, nz);
                if (!nBlock || nBlock === 'air' || RotationAxisManager._NON_ROTATABLE.has(nBlock)) continue;

                queue.push(nx, ny, nz);
            }
        }

        return blocks;
    }

    /**
     * 親回転体のブロックリストからBFS連結検出（親回転体内の子rotor用）
     * チャンクデータではなく親のブロックリストを参照する
     */
    _bfsDetectFromParent(startX, startY, startZ, axisX, axisY, axisZ, front, parentBody) {
        // 親回転体のブロックをワールド座標→ブロック情報のMapに変換
        const parentBlockMap = new Map();
        for (const b of parentBody._blocks) {
            const wx = parentBody._axisX + b.rx;
            const wy = parentBody._axisY + b.ry;
            const wz = parentBody._axisZ + b.rz;
            parentBlockMap.set(packBlockKey(wx, wy, wz), b);
        }

        const blocks = [];
        const visited = new Set();
        const queue = [startX, startY, startZ];
        let head = 0;
        visited.add(packBlockKey(startX - axisX, startY - axisY, startZ - axisZ));

        const fdx = front.dx, fdy = front.dy, fdz = front.dz;
        const boundary = fdx * axisX + fdy * axisY + fdz * axisZ;

        while (head < queue.length && blocks.length < 4096) {
            const cx = queue[head], cy = queue[head + 1], cz = queue[head + 2];
            head += 3;

            // 親回転体のブロック情報から取得
            const parentBlock = parentBlockMap.get(packBlockKey(cx, cy, cz));
            if (!parentBlock) continue;
            const blockId = parentBlock.blockId;
            if (RotationAxisManager._NON_ROTATABLE.has(blockId)) continue;

            blocks.push({
                rx: cx - axisX,
                ry: cy - axisY,
                rz: cz - axisZ,
                blockId,
                orientation: parentBlock.orientation || 0
            });

            for (const [dx, dy, dz] of RotationAxisManager._DIRS_6) {
                const nx = cx + dx, ny = cy + dy, nz = cz + dz;
                if (fdx * nx + fdy * ny + fdz * nz <= boundary) continue;

                const nKey = packBlockKey(nx - axisX, ny - axisY, nz - axisZ);
                if (visited.has(nKey)) continue;
                visited.add(nKey);

                if (!parentBlockMap.has(packBlockKey(nx, ny, nz))) continue;
                queue.push(nx, ny, nz);
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
     * 3x3行列の乗算 a × b → 新しい9要素配列
     */
    static _mulMatrix3(a, b) {
        return [
            a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
            a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
            a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8]
        ];
    }

    /**
     * front方向のステップ行列キーを返す
     */
    static _stepMatrixKey(front) {
        if (front.dy !== 0) return front.dy > 0 ? 'dy+' : 'dy-';
        if (front.dz !== 0) return front.dz > 0 ? 'dz+' : 'dz-';
        return front.dx > 0 ? 'dx+' : 'dx-';
    }

    /**
     * 回転体の回転に応じてカスタムブロックの orientation (0-23) を変換
     */
    _rotateOrientation(orientation, front, steps) {
        if (typeof ChunkMeshBuilder === 'undefined' || !ChunkMeshBuilder.ORIENTATION_MATRICES) {
            return orientation;
        }
        const origM = ChunkMeshBuilder.ORIENTATION_MATRICES[orientation];
        if (!origM) return orientation;

        const bodyM = this._buildBodyRotationMatrix(front, steps);
        const composed = RotationAxisManager._mulMatrix3(bodyM, origM);

        // 誤差除去（整数回転なので各要素は0,1,-1のいずれか）
        for (let i = 0; i < 9; i++) {
            const v = composed[i];
            composed[i] = Math.abs(v) < 0.5 ? 0 : (v > 0 ? 1 : -1);
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
        return orientation;
    }

    // ハーフブロック orientation (1-6) の方向ベクトル
    // 1:下(Y-), 2:上(Y+), 3:南(-Z), 4:北(+Z), 5:西(-X), 6:東(+X)
    static _HALF_ORI_DIRS = [
        null,
        [0, -1, 0],  // 1: 下
        [0, 1, 0],   // 2: 上
        [0, 0, -1],  // 3: 南(-Z)
        [0, 0, 1],   // 4: 北(+Z)
        [-1, 0, 0],  // 5: 西(-X)
        [1, 0, 0],   // 6: 東(+X)
    ];

    /**
     * ハーフブロックの orientation (101-106) を回転に応じて変換
     */
    _rotateHalfOrientation(orientation, front, steps) {
        const halfOri = orientation - 100; // 1-6
        const dir = RotationAxisManager._HALF_ORI_DIRS[halfOri];
        if (!dir) return orientation;

        // 方向ベクトルを90°×stepsで回転
        const bodyM = this._buildBodyRotationMatrix(front, steps);
        const rx = Math.round(bodyM[0] * dir[0] + bodyM[1] * dir[1] + bodyM[2] * dir[2]);
        const ry = Math.round(bodyM[3] * dir[0] + bodyM[4] * dir[1] + bodyM[5] * dir[2]);
        const rz = Math.round(bodyM[6] * dir[0] + bodyM[7] * dir[1] + bodyM[8] * dir[2]);

        // 回転後の方向ベクトルから orientation を逆引き
        for (let i = 1; i <= 6; i++) {
            const d = RotationAxisManager._HALF_ORI_DIRS[i];
            if (d[0] === rx && d[1] === ry && d[2] === rz) return 100 + i;
        }
        return orientation;
    }

    // orientable標準ブロックの方向ベクトル（orientation 0-5）
    // 0:+Y, 1:-Y, 2:+Z, 3:-Z, 4:+X, 5:-X
    static _ORIENTABLE_DIRS = [
        [0, 1, 0],   // 0: +Y（上）
        [0, -1, 0],  // 1: -Y（下）
        [0, 0, 1],   // 2: +Z（北）
        [0, 0, -1],  // 3: -Z（南）
        [1, 0, 0],   // 4: +X（東）
        [-1, 0, 0],  // 5: -X（西）
    ];

    /**
     * orientable標準ブロックの orientation (0-5) を回転に応じて変換
     */
    _rotateOrientableOrientation(orientation, front, steps) {
        const dir = RotationAxisManager._ORIENTABLE_DIRS[orientation];
        if (!dir) return orientation;

        const bodyM = this._buildBodyRotationMatrix(front, steps);
        const rx = Math.round(bodyM[0] * dir[0] + bodyM[1] * dir[1] + bodyM[2] * dir[2]);
        const ry = Math.round(bodyM[3] * dir[0] + bodyM[4] * dir[1] + bodyM[5] * dir[2]);
        const rz = Math.round(bodyM[6] * dir[0] + bodyM[7] * dir[1] + bodyM[8] * dir[2]);

        for (let i = 0; i <= 5; i++) {
            const d = RotationAxisManager._ORIENTABLE_DIRS[i];
            if (d[0] === rx && d[1] === ry && d[2] === rz) return i;
        }
        return orientation;
    }

    /**
     * 回転体の回転（front方向×steps）を3x3行列として構築
     */
    _buildBodyRotationMatrix(front, steps) {
        const r = RotationAxisManager._STEP_MATRICES[RotationAxisManager._stepMatrixKey(front)];
        let m = [1,0,0, 0,1,0, 0,0,1];
        for (let i = 0; i < steps; i++) {
            m = RotationAxisManager._mulMatrix3(r, m);
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
