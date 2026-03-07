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
        this._blockSet = new Set(blocks.map(b => `${b.rx},${b.ry},${b.rz}`));
        this._angle = 0;
        this._isRotating = true;
        this._rotationSpeed = Math.PI / 2; // 1.57 rad/s
        this._parentBody = null; // 親回転体（入れ子の場合）
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
        // 前回の回転方向の記憶があれば反映
        const dir = this._nextDirection.get(key);
        if (dir === -1) {
            body._rotationSpeed = -Math.abs(body._rotationSpeed);
        }
        this._bodies.set(key, body);

        // 親子関係の検出
        for (const [, existingBody] of this._bodies) {
            if (existingBody === body) continue;
            // ケース1: 新しい回転体の軸が既存回転体のブロック上 → 新しい回転体が子
            const checkX = wx + 0.5, checkY = wy + 0.5, checkZ = wz + 0.5;
            const local = this.WorldToLocal(existingBody, checkX, checkY, checkZ);
            const rx = Math.round(local.x - 0.5) - existingBody._axisX;
            const ry = Math.round(local.y - 0.5) - existingBody._axisY;
            const rz = Math.round(local.z - 0.5) - existingBody._axisZ;
            if (existingBody._blockSet.has(`${rx},${ry},${rz}`)) {
                body._parentBody = existingBody;
                break;
            }
            // ケース2: 既存回転体の軸が新しい回転体のブロック上 → 既存回転体が子
            if (existingBody._parentBody === null) {
                const ex = existingBody._axisX + 0.5, ey = existingBody._axisY + 0.5, ez = existingBody._axisZ + 0.5;
                const local2 = this.WorldToLocal(body, ex, ey, ez);
                const rx2 = Math.round(local2.x - 0.5) - body._axisX;
                const ry2 = Math.round(local2.y - 0.5) - body._axisY;
                const rz2 = Math.round(local2.z - 0.5) - body._axisZ;
                if (body._blockSet.has(`${rx2},${ry2},${rz2}`)) {
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
     * ワールド座標をローカル座標に変換（逆回転）
     * @param {RotationBody} body - 回転体
     * @param {number} wx - ワールドX
     * @param {number} wy - ワールドY
     * @param {number} wz - ワールドZ
     * @returns {{x:number, y:number, z:number}} ローカル座標
     */
    WorldToLocal(body, wx, wy, wz) {
        // 親がいる場合、まず親のローカル空間に変換
        if (body._parentBody) {
            const mid = this.WorldToLocal(body._parentBody, wx, wy, wz);
            wx = mid.x; wy = mid.y; wz = mid.z;
        }
        const front = body.GetFrontDirection();
        const dx = wx - (body._axisX + 0.5);
        const dy = wy - (body._axisY + 0.5);
        const dz = wz - (body._axisZ + 0.5);
        const rotated = this._rotatePoint(dx, dy, dz, front, -body._angle);
        return {
            x: rotated.x + body._axisX + 0.5,
            y: rotated.y + body._axisY + 0.5,
            z: rotated.z + body._axisZ + 0.5
        };
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
        const front = body.GetFrontDirection();
        const dx = lx - (body._axisX + 0.5);
        const dy = ly - (body._axisY + 0.5);
        const dz = lz - (body._axisZ + 0.5);
        const rotated = this._rotatePoint(dx, dy, dz, front, body._angle);
        const result = {
            x: rotated.x + body._axisX + 0.5,
            y: rotated.y + body._axisY + 0.5,
            z: rotated.z + body._axisZ + 0.5
        };
        // 親がいる場合、親のワールド空間に変換
        if (body._parentBody) {
            return this.LocalToWorld(body._parentBody, result.x, result.y, result.z);
        }
        return result;
    }

    /**
     * 回転軸に応じて点を回転する
     * RotationBodyMesh.UpdateRotation と同じ符号規則
     * @param {number} dx - 軸中心からのX
     * @param {number} dy - 軸中心からのY
     * @param {number} dz - 軸中心からのZ
     * @param {{dx:number, dy:number, dz:number}} front - 回転軸方向
     * @param {number} angle - 回転角度（正=正回転、負=逆回転）
     * @returns {{x:number, y:number, z:number}}
     */
    _rotatePoint(dx, dy, dz, front, angle) {
        // CW回転（_rotate90と同じ回転方向）
        // θ = front.d? * angle。逆回転は angle = -body._angle で呼ばれる。
        let theta, cos, sin;
        if (front.dy !== 0) {
            theta = front.dy * angle;
            cos = Math.cos(theta);
            sin = Math.sin(theta);
            return { x: dx * cos + dz * sin, y: dy, z: -dx * sin + dz * cos };
        } else if (front.dz !== 0) {
            theta = front.dz * angle;
            cos = Math.cos(theta);
            sin = Math.sin(theta);
            return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos, z: dz };
        } else {
            theta = front.dx * angle;
            cos = Math.cos(theta);
            sin = Math.sin(theta);
            return { x: dx, y: dy * cos + dz * sin, z: -dy * sin + dz * cos };
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

        // ローカル空間でAABBを再構築
        const localAABB = {
            minX: local.x - halfW,
            minY: local.y - halfH,
            minZ: local.z - halfW,
            maxX: local.x + halfW,
            maxY: local.y + halfH,
            maxZ: local.z + halfW
        };

        // ローカルAABB範囲の整数座標をチェック
        const result = [];
        const ax = body._axisX, ay = body._axisY, az = body._axisZ;
        const xMin = Math.floor(localAABB.minX);
        const xMax = Math.floor(localAABB.maxX);
        const yMin = Math.floor(localAABB.minY);
        const yMax = Math.floor(localAABB.maxY);
        const zMin = Math.floor(localAABB.minZ);
        const zMax = Math.floor(localAABB.maxZ);

        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                for (let z = zMin; z <= zMax; z++) {
                    const rx = x - ax, ry = y - ay, rz = z - az;
                    if (body._blockSet.has(`${rx},${ry},${rz}`)) {
                        const blockAABB = {
                            minX: x, minY: y, minZ: z,
                            maxX: x + 1, maxY: y + 1, maxZ: z + 1
                        };
                        // ローカルAABBとの交差判定
                        if (localAABB.minX < blockAABB.maxX && localAABB.maxX > blockAABB.minX &&
                            localAABB.minY < blockAABB.maxY && localAABB.maxY > blockAABB.minY &&
                            localAABB.minZ < blockAABB.maxZ && localAABB.maxZ > blockAABB.minZ) {
                            result.push(blockAABB);
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
