/**
 * RopeWay.js
 * ロープウェイ管理 - ロープ接続を利用したブロック群の直線移動
 */

/**
 * 相対座標を1つの整数キーにパックする（範囲 -128〜127）
 */
function packBlockKeyRW(rx, ry, rz) {
    return ((rx + 128) << 16) | ((ry + 128) << 8) | (rz + 128);
}

class RopeWayBody {
    /**
     * @param {number} originX - rope_way の初期ワールドX
     * @param {number} originY - rope_way の初期ワールドY
     * @param {number} originZ - rope_way の初期ワールドZ
     * @param {{x:number, y:number, z:number}} moveVector - 移動ベクトル（整数）
     * @param {number} totalDistance - ユークリッド距離
     * @param {Array<{rx:number, ry:number, rz:number, blockId:string, orientation:number}>} blocks
     */
    constructor(originX, originY, originZ, moveVector, totalDistance, blocks) {
        this._originX = originX;
        this._originY = originY;
        this._originZ = originZ;
        this._moveVector = moveVector;
        this._totalDistance = totalDistance;
        this._blocks = blocks;
        this._displacement = 0;
        this._speed = 6.0;
        this._isMoving = true;
    }

    get displacement() { return this._displacement; }
    get isMoving() { return this._isMoving; }
    get blockCount() { return this._blocks.length; }

    GetBlocks() {
        return this._blocks.map(b => ({
            rx: b.rx, ry: b.ry, rz: b.rz, blockId: b.blockId
        }));
    }
}

class RopeWayManager {
    static _NON_MOVABLE = new Set(['stone', 'dirt', 'grass', 'sand', 'water']);
    static _DIRS_6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

    /**
     * @param {object} chunkManager
     * @param {THREE.Group} worldContainer
     * @param {object} textureLoader
     * @param {object} ropeManager - RopeManager インスタンス
     */
    constructor(chunkManager, worldContainer, textureLoader, ropeManager) {
        this._chunkManager = chunkManager;
        this._scene = worldContainer;
        this._textureLoader = textureLoader;
        this._ropeManager = ropeManager;
        /** @type {Map<string, RopeWayBody>} */
        this._bodies = new Map();
        /** @type {Map<string, object>} メッシュ */
        this._meshes = new Map();
        this._bodiesCache = [];
        this._bodiesCacheDirty = true;
    }

    GetAllBodies() {
        if (this._bodiesCacheDirty) {
            this._bodiesCache = Array.from(this._bodies.values());
            this._bodiesCacheDirty = false;
        }
        return this._bodiesCache;
    }

    /**
     * 移動体のブロック現在ワールドAABBリストを返す（プレイヤーAABB範囲でフィルタ）
     * @param {RopeWayBody} body - 移動体
     * @param {{minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number}} playerAABB
     * @returns {Array<{minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number}>}
     */
    GetCollidingBlocks(body, playerAABB) {
        const progress = body._totalDistance > 0 ? body._displacement / body._totalDistance : 0;
        const offX = body._moveVector.x * progress;
        const offY = body._moveVector.y * progress;
        const offZ = body._moveVector.z * progress;
        const result = [];
        for (const b of body._blocks) {
            const bx = body._originX + b.rx + offX;
            const by = body._originY + b.ry + offY;
            const bz = body._originZ + b.rz + offZ;
            const blockAABB = { minX: bx, minY: by, minZ: bz, maxX: bx + 1, maxY: by + 1, maxZ: bz + 1 };
            if (blockAABB.minX < playerAABB.maxX && blockAABB.maxX > playerAABB.minX &&
                blockAABB.minY < playerAABB.maxY && blockAABB.maxY > playerAABB.minY &&
                blockAABB.minZ < playerAABB.maxZ && blockAABB.maxZ > playerAABB.minZ) {
                result.push(blockAABB);
            }
        }
        return result;
    }

    GetBodyAt(wx, wy, wz) {
        return this._bodies.get(`${wx},${wy},${wz}`) || null;
    }

    ToggleBody(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        if (this._bodies.has(key)) {
            this._dissolveBody(key);
        } else {
            this._createBody(wx, wy, wz);
        }
    }

    StopBody(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        if (this._bodies.has(key)) {
            this._dissolveBody(key);
        }
    }

    /**
     * 隣接6方向から pole_with_rope を検索し、接続先を返す
     * @returns {{poleX, poleY, poleZ, targetX, targetY, targetZ}|null}
     */
    _findAdjacentRopePole(wx, wy, wz) {
        if (!this._ropeManager) return null;
        for (const [dx, dy, dz] of RopeWayManager._DIRS_6) {
            const px = wx + dx, py = wy + dy, pz = wz + dz;
            const blockId = this._getBlockAt(px, py, pz);
            if (blockId !== 'pole_with_rope') continue;
            const conn = this._ropeManager.GetConnection(px, py, pz);
            if (!conn) continue;
            return { poleX: px, poleY: py, poleZ: pz, targetX: conn.x, targetY: conn.y, targetZ: conn.z };
        }
        return null;
    }

    _createBody(wx, wy, wz) {
        const ropeInfo = this._findAdjacentRopePole(wx, wy, wz);
        if (!ropeInfo) return;

        const moveVector = {
            x: ropeInfo.targetX - ropeInfo.poleX,
            y: ropeInfo.targetY - ropeInfo.poleY,
            z: ropeInfo.targetZ - ropeInfo.poleZ
        };
        const totalDistance = Math.sqrt(
            moveVector.x * moveVector.x +
            moveVector.y * moveVector.y +
            moveVector.z * moveVector.z
        );
        if (totalDistance === 0) return;

        const blocks = this._bfsDetect(wx, wy, wz);
        const key = `${wx},${wy},${wz}`;
        const body = new RopeWayBody(wx, wy, wz, moveVector, totalDistance, blocks);
        this._bodies.set(key, body);
        this._bodiesCacheDirty = true;

        // ブロックをairに置換 + ライトマップ更新
        for (const b of blocks) {
            const bx = wx + b.rx, by = wy + b.ry, bz = wz + b.rz;
            this._setBlockAt(bx, by, bz, 'air');
            this._updateLight(bx, by, bz, true);
        }

        this._rebuildAffectedChunks(wx, wy, wz, blocks);

        // 移動体メッシュ生成
        if (typeof RotationBodyMesh !== 'undefined') {
            const compatBody = {
                _axisX: wx, _axisY: wy, _axisZ: wz,
                _blocks: blocks,
                _blockSet: new Set(blocks.map(b => packBlockKeyRW(b.rx, b.ry, b.rz))),
                _frontDx: 0, _frontDy: 1, _frontDz: 0,
                _centerX: wx + 0.5, _centerY: wy + 0.5, _centerZ: wz + 0.5
            };
            const mesh = new RotationBodyMesh(compatBody, this._textureLoader, this._chunkManager);
            mesh.Build();
            this._scene.add(mesh.GetGroup());
            this._meshes.set(key, mesh);
        }
    }

    _dissolveBody(key) {
        const body = this._bodies.get(key);
        if (!body) return;

        const wx = body._originX, wy = body._originY, wz = body._originZ;
        const mv = body._moveVector;
        const ratio = body._displacement >= body._totalDistance
            ? 1 : body._displacement / body._totalDistance;
        const dx = Math.round(mv.x * ratio);
        const dy = Math.round(mv.y * ratio);
        const dz = Math.round(mv.z * ratio);

        for (const b of body._blocks) {
            const bx = wx + b.rx + dx, by = wy + b.ry + dy, bz = wz + b.rz + dz;
            this._setBlockAt(bx, by, bz, b.blockId, b.orientation);
            this._updateLight(bx, by, bz, false);
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

        // チャンクメッシュ再構築
        this._rebuildAffectedChunks(wx, wy, wz, body._blocks);
        if (dx !== 0 || dy !== 0 || dz !== 0) {
            this._rebuildAffectedChunks(wx + dx, wy + dy, wz + dz, body._blocks);
        }
    }

    /**
     * ブロックが移動体に含められるかを判定
     */
    static _IsMovable(blockId) {
        return blockId && blockId !== 'air' &&
            !RopeWayManager._NON_MOVABLE.has(blockId) &&
            blockId !== 'pole' && blockId !== 'pole_with_rope';
    }

    /**
     * BFS連結検出（rope_way 自身を含む、pole/pole_with_rope は除外）
     */
    _bfsDetect(wx, wy, wz) {
        const blocks = [];
        const visited = new Set();
        const queue = [wx, wy, wz];
        let head = 0;
        visited.add(packBlockKeyRW(0, 0, 0));

        while (head < queue.length && blocks.length < 4096) {
            const cx = queue[head], cy = queue[head + 1], cz = queue[head + 2];
            head += 3;

            const blockId = this._getBlockAt(cx, cy, cz);
            if (!RopeWayManager._IsMovable(blockId)) continue;

            const orientation = this._getOrientation(cx, cy, cz) || 0;
            blocks.push({ rx: cx - wx, ry: cy - wy, rz: cz - wz, blockId, orientation });

            for (const [ddx, ddy, ddz] of RopeWayManager._DIRS_6) {
                const nx = cx + ddx, ny = cy + ddy, nz = cz + ddz;
                const nKey = packBlockKeyRW(nx - wx, ny - wy, nz - wz);
                if (visited.has(nKey)) continue;
                visited.add(nKey);
                if (!RopeWayManager._IsMovable(this._getBlockAt(nx, ny, nz))) continue;
                queue.push(nx, ny, nz);
            }
        }

        return blocks;
    }

    Update(deltaTime) {
        if (this._bodies.size === 0) return;

        const keysToDissolve = [];

        for (const [key, body] of this._bodies) {
            if (!body._isMoving) continue;

            body._displacement += body._speed * deltaTime;

            // 到着判定
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
                group.position.x = body._originX + 0.5 + body._moveVector.x * progress;
                group.position.y = body._originY + 0.5 + body._moveVector.y * progress;
                group.position.z = body._originZ + 0.5 + body._moveVector.z * progress;
            }
        }

        for (const key of keysToDissolve) {
            this._dissolveBody(key);
        }
    }

    // === ヘルパーメソッド ===

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

    _rebuildAffectedChunks(baseX, baseY, baseZ, blocks) {
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
}

if (typeof window !== 'undefined') {
    window.RopeWayBody = RopeWayBody;
    window.RopeWayManager = RopeWayManager;
}
