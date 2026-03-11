/**
 * Piston.js
 * 粘着ピストン管理クラス - アニメーション付き伸長・収縮ロジック
 */

class PistonBody {
    /**
     * @param {number} pistonX - ピストン基部のワールドX
     * @param {number} pistonY - ピストン基部のワールドY
     * @param {number} pistonZ - ピストン基部のワールドZ
     * @param {{x:number,y:number,z:number}} moveVector - 移動ベクトル（D * 5）
     * @param {number} totalDistance - 移動距離（5）
     * @param {Array<{rx:number,ry:number,rz:number,blockId:string,orientation:number}>} blocks
     * @param {boolean} isExtending - 伸長中か収縮中か
     * @param {number} orientation - ピストンの orientation
     */
    constructor(pistonX, pistonY, pistonZ, moveVector, totalDistance, blocks, isExtending, orientation) {
        this._pistonX = pistonX;
        this._pistonY = pistonY;
        this._pistonZ = pistonZ;
        this._moveVector = moveVector;
        this._totalDistance = totalDistance;
        this._blocks = blocks;
        this._displacement = 0;
        this._speed = 10.0; // 10ブロック/秒
        this._isExtending = isExtending;
        this._orientation = orientation;
    }
}

class PistonManager {
    /** 伸長距離（固定5ブロック） */
    static _EXTEND_DISTANCE = 5;

    /** BFS最大ブロック数 */
    static _MAX_PUSH_COUNT = 12;

    /** 非可動ブロック */
    static _NON_PUSHABLE = new Set(['stone', 'dirt', 'grass', 'sand', 'water',
        'piston_base', 'sticky_piston_head', 'pole', 'pole_with_rope']);

    /** topDir → 方向ベクトル */
    static _DIRECTION_FROM_TOPDIR = [
        { x: 0, y: 1, z: 0 },   // 0: Y+
        { x: 0, y: -1, z: 0 },  // 1: Y-
        { x: 0, y: 0, z: 1 },   // 2: Z+
        { x: 0, y: 0, z: -1 },  // 3: Z-
        { x: 1, y: 0, z: 0 },   // 4: X+
        { x: -1, y: 0, z: 0 },  // 5: X-
    ];

    /** BFS探索用6方向 */
    static _SIX_DIRS = [
        { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
    ];

    /**
     * @param {object} chunkManager
     * @param {THREE.Group} worldContainer - シーンコンテナ
     * @param {object} textureLoader - テクスチャローダー
     */
    constructor(chunkManager, worldContainer, textureLoader) {
        this._chunkManager = chunkManager;
        this._scene = worldContainer;
        this._textureLoader = textureLoader;
        /** @type {Map<string, PistonBody>} */
        this._bodies = new Map();
        /** @type {Map<string, object>} */
        this._meshes = new Map();
    }

    // === ヘルパー ===

    _resolve(wx, wy, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.chunkData) return null;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return null;
        return { cd: chunk.chunkData, lx: ((wx % 16) + 16) % 16, ly, lz: ((wz % 16) + 16) % 16 };
    }

    _getBlock(wx, wy, wz) {
        const r = this._resolve(wx, wy, wz);
        return r ? r.cd.getBlock(r.lx, r.ly, r.lz) : null;
    }

    _getOrientation(wx, wy, wz) {
        const r = this._resolve(wx, wy, wz);
        return r ? r.cd.getOrientation(r.lx, r.ly, r.lz) : 0;
    }

    _setBlock(wx, wy, wz, blockId, orientation = 0) {
        const r = this._resolve(wx, wy, wz);
        if (r) r.cd.setBlock(r.lx, r.ly, r.lz, blockId, orientation);
    }

    _getDirection(orientation) {
        const topDir = Math.floor(orientation / 4);
        return PistonManager._DIRECTION_FROM_TOPDIR[topDir] || PistonManager._DIRECTION_FROM_TOPDIR[0];
    }

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

    _rebuildAffectedChunks(baseX, baseZ, blocks) {
        const affected = new Set();
        for (const b of blocks) {
            const bwx = baseX + b.rx, bwz = baseZ + b.rz;
            const cx = Math.floor(bwx / 16), cz = Math.floor(bwz / 16);
            affected.add(`${cx},${cz}`);
            const lx = ((bwx % 16) + 16) % 16;
            const lz = ((bwz % 16) + 16) % 16;
            if (lx === 0)  affected.add(`${cx - 1},${cz}`);
            if (lx === 15) affected.add(`${cx + 1},${cz}`);
            if (lz === 0)  affected.add(`${cx},${cz - 1}`);
            if (lz === 15) affected.add(`${cx},${cz + 1}`);
        }
        affected.add(`${Math.floor(baseX / 16)},${Math.floor(baseZ / 16)}`);
        for (const chunkKey of affected) {
            const [cx, cz] = chunkKey.split(',').map(Number);
            this._chunkManager.rebuildChunkMesh(cx, cz);
        }
    }

    // === BFS ===

    /**
     * @param {number} startX - BFS起点X
     * @param {number} startY - BFS起点Y
     * @param {number} startZ - BFS起点Z
     * @param {number} [excludeX] - 除外座標X（ピストン自身）
     * @param {number} [excludeY] - 除外座標Y
     * @param {number} [excludeZ] - 除外座標Z
     */
    _bfsConnectedBlocks(startX, startY, startZ, excludeX, excludeY, excludeZ) {
        const startBlock = this._getBlock(startX, startY, startZ);
        if (!startBlock || startBlock === 'air' || PistonManager._NON_PUSHABLE.has(startBlock)) {
            return [];
        }

        const result = [];
        const visited = new Set();
        const queue = [{ x: startX, y: startY, z: startZ }];
        visited.add(`${startX},${startY},${startZ}`);
        // ピストン自身の位置を除外
        if (excludeX !== undefined) {
            visited.add(`${excludeX},${excludeY},${excludeZ}`);
        }

        while (queue.length > 0) {
            if (result.length >= PistonManager._MAX_PUSH_COUNT) break;
            const pos = queue.shift();
            const blockId = this._getBlock(pos.x, pos.y, pos.z);
            if (!blockId || blockId === 'air' || PistonManager._NON_PUSHABLE.has(blockId)) continue;

            const orientation = this._getOrientation(pos.x, pos.y, pos.z);
            result.push({ x: pos.x, y: pos.y, z: pos.z, blockId, orientation });

            if (result.length >= PistonManager._MAX_PUSH_COUNT) break;

            for (const dir of PistonManager._SIX_DIRS) {
                const nx = pos.x + dir.x;
                const ny = pos.y + dir.y;
                const nz = pos.z + dir.z;
                const key = `${nx},${ny},${nz}`;
                if (visited.has(key)) continue;
                visited.add(key);
                const nb = this._getBlock(nx, ny, nz);
                if (nb && nb !== 'air' && !PistonManager._NON_PUSHABLE.has(nb)) {
                    queue.push({ x: nx, y: ny, z: nz });
                }
            }
        }

        return result;
    }

    // === 伸長 ===

    /**
     * 粘着ピストンを伸長する（アニメーション開始）
     * @param {number} wx - sticky_piston のワールドX
     * @param {number} wy - sticky_piston のワールドY
     * @param {number} wz - sticky_piston のワールドZ
     * @returns {boolean} 成功したか
     */
    Extend(wx, wy, wz) {
        const blockId = this._getBlock(wx, wy, wz);
        if (blockId !== 'sticky_piston') return false;

        // 既にアニメーション中なら拒否
        const bodyKey = `${wx},${wy},${wz}`;
        if (this._bodies.has(bodyKey)) return false;

        const orientation = this._getOrientation(wx, wy, wz);
        const d = this._getDirection(orientation);
        const dist = PistonManager._EXTEND_DISTANCE;

        // 経路上チェック（非可動ブロック）
        for (let i = 1; i <= dist; i++) {
            const b = this._getBlock(wx + d.x * i, wy + d.y * i, wz + d.z * i);
            if (b && b !== 'air' && PistonManager._NON_PUSHABLE.has(b)) {
                return false;
            }
        }

        // BFS連結検出
        const stickyX = wx + d.x, stickyY = wy + d.y, stickyZ = wz + d.z;
        const connectedBlocks = this._bfsConnectedBlocks(stickyX, stickyY, stickyZ, wx, wy, wz);

        // 経路上のブロックも押し出し対象に追加
        const allBlocks = [...connectedBlocks];
        const connectedSet = new Set(connectedBlocks.map(b => `${b.x},${b.y},${b.z}`));

        for (let i = 1; i <= dist; i++) {
            const bx = wx + d.x * i, by = wy + d.y * i, bz = wz + d.z * i;
            const key = `${bx},${by},${bz}`;
            if (connectedSet.has(key)) continue;
            const b = this._getBlock(bx, by, bz);
            if (b && b !== 'air') {
                if (PistonManager._NON_PUSHABLE.has(b)) return false;
                allBlocks.push({ x: bx, y: by, z: bz, blockId: b, orientation: this._getOrientation(bx, by, bz) });
                connectedSet.add(key);
            }
        }

        if (allBlocks.length > PistonManager._MAX_PUSH_COUNT) return false;

        // 移動先の空きチェック
        for (const block of allBlocks) {
            const destX = block.x + d.x * dist;
            const destY = block.y + d.y * dist;
            const destZ = block.z + d.z * dist;
            const destBlock = this._getBlock(destX, destY, destZ);
            if (destBlock && destBlock !== 'air') {
                if (!connectedSet.has(`${destX},${destY},${destZ}`)) return false;
            }
            if (destY < 0 || destY >= 128) return false;
        }

        // === 検証OK: アニメーション開始 ===

        // ピストン基部を即座に変更
        this._setBlock(wx, wy, wz, 'piston_base', orientation);

        // アニメーション用ブロックリスト（相対座標）
        // origin = ピストン位置 P
        const bodyBlocks = [];

        // 連結ブロックをワールドから除去 + bodyBlocksに追加
        for (const block of allBlocks) {
            bodyBlocks.push({
                rx: block.x - wx, ry: block.y - wy, rz: block.z - wz,
                blockId: block.blockId, orientation: block.orientation
            });
            this._setBlock(block.x, block.y, block.z, 'air');
            this._updateLight(block.x, block.y, block.z, true);
        }

        // ピストンヘッドをアニメーション体に含める（P+0 = 起点に配置、D*5先に移動）
        bodyBlocks.push({
            rx: 0, ry: 0, rz: 0,
            blockId: 'sticky_piston_head', orientation: orientation
        });

        // チャンクメッシュ再構築
        this._rebuildAffectedChunks(wx, wz, bodyBlocks);

        // PistonBody 生成
        const moveVector = { x: d.x * dist, y: d.y * dist, z: d.z * dist };
        const body = new PistonBody(wx, wy, wz, moveVector, dist, bodyBlocks, true, orientation);
        this._bodies.set(bodyKey, body);

        // メッシュ生成
        this._createMesh(bodyKey, body);

        return true;
    }

    // === 収縮 ===

    /**
     * ピストンを収縮する（アニメーション開始）
     * @param {number} wx - piston_base のワールドX
     * @param {number} wy - piston_base のワールドY
     * @param {number} wz - piston_base のワールドZ
     * @returns {boolean} 成功したか
     */
    Retract(wx, wy, wz) {
        const blockId = this._getBlock(wx, wy, wz);
        if (blockId !== 'piston_base') return false;

        const bodyKey = `${wx},${wy},${wz}`;
        if (this._bodies.has(bodyKey)) return false;

        const orientation = this._getOrientation(wx, wy, wz);
        const d = this._getDirection(orientation);
        const dist = PistonManager._EXTEND_DISTANCE;

        // ヘッド位置確認
        const headX = wx + d.x * dist, headY = wy + d.y * dist, headZ = wz + d.z * dist;
        if (this._getBlock(headX, headY, headZ) !== 'sticky_piston_head') return false;

        // BFS: ヘッドの先（P + 6*D）
        const stickyX = headX + d.x, stickyY = headY + d.y, stickyZ = headZ + d.z;
        const connectedBlocks = this._bfsConnectedBlocks(stickyX, stickyY, stickyZ, wx, wy, wz);

        // ピストンアーム位置のセット（引き戻し先チェックで許容する）
        const armPositions = new Set();
        for (let i = 1; i < dist; i++) {
            armPositions.add(`${wx + d.x * i},${wy + d.y * i},${wz + d.z * i}`);
        }

        // 引き戻し先の空きチェック
        for (const block of connectedBlocks) {
            const destX = block.x - d.x * dist;
            const destY = block.y - d.y * dist;
            const destZ = block.z - d.z * dist;
            const destBlock = this._getBlock(destX, destY, destZ);
            if (destBlock && destBlock !== 'air'
                && destBlock !== 'piston_base' && destBlock !== 'sticky_piston_head') {
                // ピストンアーム上の pole は収縮時に除去されるのでOK
                if (armPositions.has(`${destX},${destY},${destZ}`)) continue;
                const isOwnBlock = connectedBlocks.some(
                    b => b.x === destX && b.y === destY && b.z === destZ
                );
                if (!isOwnBlock) return false;
            }
            if (destY < 0 || destY >= 128) return false;
        }

        // === 検証OK: アニメーション開始 ===

        // ヘッド + ピストンアーム（pole）をワールドから削除
        this._setBlock(headX, headY, headZ, 'air');
        this._updateLight(headX, headY, headZ, true);
        for (let i = 1; i < dist; i++) {
            const px = wx + d.x * i, py = wy + d.y * i, pz = wz + d.z * i;
            this._setBlock(px, py, pz, 'air');
            this._updateLight(px, py, pz, true);
        }

        // bodyBlocks（現在位置を基準、origin = P）
        const bodyBlocks = [];

        // 連結ブロックをワールドから除去
        for (const block of connectedBlocks) {
            bodyBlocks.push({
                rx: block.x - wx, ry: block.y - wy, rz: block.z - wz,
                blockId: block.blockId, orientation: block.orientation
            });
            this._setBlock(block.x, block.y, block.z, 'air');
            this._updateLight(block.x, block.y, block.z, true);
        }

        // ピストンヘッドもアニメーション体に含める
        bodyBlocks.push({
            rx: headX - wx, ry: headY - wy, rz: headZ - wz,
            blockId: 'sticky_piston_head', orientation: orientation
        });

        // チャンクメッシュ再構築
        this._rebuildAffectedChunks(wx, wz, bodyBlocks);

        // 移動ベクトルは逆方向（-D * dist）
        const moveVector = { x: -d.x * dist, y: -d.y * dist, z: -d.z * dist };
        const body = new PistonBody(wx, wy, wz, moveVector, dist, bodyBlocks, false, orientation);
        this._bodies.set(bodyKey, body);

        this._createMesh(bodyKey, body);

        return true;
    }

    // === メッシュ生成 ===

    _createMesh(key, body) {
        if (typeof RotationBodyMesh === 'undefined' || !this._scene) return;

        try {
            const compatBody = {
                _axisX: body._pistonX, _axisY: body._pistonY, _axisZ: body._pistonZ,
                _blocks: body._blocks,
                _blockSet: new Set(body._blocks.map(b => {
                    return ((b.rx + 128) << 16) | ((b.ry + 128) << 8) | (b.rz + 128);
                })),
                _frontDx: 0, _frontDy: 1, _frontDz: 0,
                _centerX: body._pistonX + 0.5,
                _centerY: body._pistonY + 0.5,
                _centerZ: body._pistonZ + 0.5
            };
            const mesh = new RotationBodyMesh(compatBody, this._textureLoader, this._chunkManager);
            mesh.Build();
            this._scene.add(mesh.GetGroup());
            this._meshes.set(key, mesh);
        } catch (e) {
            console.warn('PistonManager: メッシュ生成失敗', e);
        }
    }

    // === dissolve ===

    _dissolveExtend(body) {
        const wx = body._pistonX, wy = body._pistonY, wz = body._pistonZ;
        const mv = body._moveVector;
        const d = this._getDirection(body._orientation);
        const dist = PistonManager._EXTEND_DISTANCE;

        // ブロックを移動先に書き戻し
        for (const b of body._blocks) {
            const bx = wx + b.rx + mv.x;
            const by = wy + b.ry + mv.y;
            const bz = wz + b.rz + mv.z;
            this._setBlock(bx, by, bz, b.blockId, b.orientation);
            this._updateLight(bx, by, bz, false);
        }

        // ピストンアーム: P+1*D 〜 P+4*D に pole を配置
        for (let i = 1; i < dist; i++) {
            const px = wx + d.x * i, py = wy + d.y * i, pz = wz + d.z * i;
            this._setBlock(px, py, pz, 'pole', 0);
            this._updateLight(px, py, pz, false);
        }

        // 移動先 + ポール位置のチャンクメッシュ再構築
        const destBlocks = body._blocks.map(b => ({
            rx: b.rx + mv.x, ry: b.ry + mv.y, rz: b.rz + mv.z
        }));
        for (let i = 1; i < dist; i++) {
            destBlocks.push({ rx: d.x * i, ry: d.y * i, rz: d.z * i });
        }
        this._rebuildAffectedChunks(wx, wz, destBlocks);
    }

    _dissolveRetract(body) {
        const wx = body._pistonX, wy = body._pistonY, wz = body._pistonZ;
        const mv = body._moveVector;

        // ブロックを引き戻し先に書き戻し（ヘッド以外）
        for (const b of body._blocks) {
            if (b.blockId === 'sticky_piston_head') continue; // ヘッドは消える
            const bx = wx + b.rx + mv.x;
            const by = wy + b.ry + mv.y;
            const bz = wz + b.rz + mv.z;
            this._setBlock(bx, by, bz, b.blockId, b.orientation);
            this._updateLight(bx, by, bz, false);
        }

        // ピストン基部を sticky_piston に戻す
        this._setBlock(wx, wy, wz, 'sticky_piston', body._orientation);

        // 引き戻し先チャンクメッシュ再構築
        const destBlocks = body._blocks.map(b => ({
            rx: b.rx + mv.x, ry: b.ry + mv.y, rz: b.rz + mv.z
        }));
        destBlocks.push({ rx: 0, ry: 0, rz: 0 }); // ピストン本体
        this._rebuildAffectedChunks(wx, wz, destBlocks);
    }

    _dissolveBody(key) {
        const body = this._bodies.get(key);
        if (!body) return;

        if (body._isExtending) {
            this._dissolveExtend(body);
        } else {
            this._dissolveRetract(body);
        }

        // メッシュ削除
        const mesh = this._meshes.get(key);
        if (mesh) {
            try {
                this._scene.remove(mesh.GetGroup());
                mesh.Dispose();
            } catch (e) {
                console.warn('PistonManager: メッシュ削除失敗', e);
            }
            this._meshes.delete(key);
        }

        this._bodies.delete(key);
    }

    // === 毎フレーム更新 ===

    /**
     * アニメーション更新
     * @param {number} deltaTime - 秒
     */
    Update(deltaTime) {
        if (this._bodies.size === 0) return;

        const keysToDissolve = [];

        for (const [key, body] of this._bodies) {
            body._displacement += body._speed * deltaTime;

            if (body._displacement >= body._totalDistance) {
                body._displacement = body._totalDistance;
                keysToDissolve.push(key);
                continue;
            }

            // メッシュ位置更新
            const mesh = this._meshes.get(key);
            if (mesh) {
                const progress = body._displacement / body._totalDistance;
                const group = mesh.GetGroup();
                group.position.x = body._pistonX + 0.5 + body._moveVector.x * progress;
                group.position.y = body._pistonY + 0.5 + body._moveVector.y * progress;
                group.position.z = body._pistonZ + 0.5 + body._moveVector.z * progress;
            }
        }

        for (const key of keysToDissolve) {
            this._dissolveBody(key);
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.PistonBody = PistonBody;
    window.PistonManager = PistonManager;
}
