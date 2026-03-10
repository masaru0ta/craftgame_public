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
        /** @type {Array<{body: RotationBody, key: string}>} 搭載中の回転体 */
        this._carriedRotationBodies = [];
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
        /** @type {RotationAxisManager|null} 外部から設定 */
        this.rotationAxisManager = null;
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

        // ロープウェイブロック範囲内のアクティブな回転体を検出して搭載
        this._detectCarriedRotationBodies(body, blocks, wx, wy, wz);

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

        // 搭載回転体の位置を最終オフセットにスナップ
        this._snapCarriedRotationBodies(body, dx, dy, dz);

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

            const prevDisplacement = body._displacement;
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

            // 搭載回転体の位置を差分で更新
            if (body._carriedRotationBodies.length > 0) {
                const deltaDist = body._displacement - prevDisplacement;
                const deltaRatio = deltaDist / body._totalDistance;
                const ddx = body._moveVector.x * deltaRatio;
                const ddy = body._moveVector.y * deltaRatio;
                const ddz = body._moveVector.z * deltaRatio;
                this._moveCarriedRotationBodies(body, ddx, ddy, ddz);
            }
        }

        for (const key of keysToDissolve) {
            this._dissolveBody(key);
        }
    }

    // === 搭載回転体の管理 ===

    /**
     * ロープウェイブロック範囲内のアクティブな回転体を検出して搭載リストに記録
     */
    _detectCarriedRotationBodies(rwBody, blocks, wx, wy, wz) {
        const ram = this.rotationAxisManager;
        if (!ram) return;

        // 整数キーで高速ルックアップ
        const blockKeys = new Set();
        for (const b of blocks) {
            blockKeys.add(packBlockKeyRW(b.rx, b.ry, b.rz));
        }

        const allBodies = ram.GetAllBodies();
        for (const rotBody of allBodies) {
            // 軸座標がロープウェイブロック範囲内か
            const axRx = rotBody._axisX - wx, axRy = rotBody._axisY - wy, axRz = rotBody._axisZ - wz;
            let carried = blockKeys.has(packBlockKeyRW(axRx, axRy, axRz));
            if (!carried) {
                // 回転体の構成ブロックのいずれかがロープウェイ範囲にあるか
                for (const rb of rotBody._blocks) {
                    if (blockKeys.has(packBlockKeyRW(axRx + rb.rx, axRy + rb.ry, axRz + rb.rz))) {
                        carried = true;
                        break;
                    }
                }
            }
            if (carried) {
                rwBody._carriedRotationBodies.push({
                    body: rotBody,
                    key: `${rotBody._axisX},${rotBody._axisY},${rotBody._axisZ}`,
                    origX: rotBody._axisX, origY: rotBody._axisY, origZ: rotBody._axisZ
                });
            }
        }
    }

    /**
     * 搭載回転体の座標・メッシュを差分移動する
     */
    _moveCarriedRotationBodies(rwBody, ddx, ddy, ddz) {
        const meshes = this.rotationAxisManager._meshes;
        for (const carried of rwBody._carriedRotationBodies) {
            const rotBody = carried.body;
            rotBody._axisX += ddx;
            rotBody._axisY += ddy;
            rotBody._axisZ += ddz;
            rotBody._centerX += ddx;
            rotBody._centerY += ddy;
            rotBody._centerZ += ddz;

            const mesh = meshes.get(carried.key);
            if (mesh) {
                const group = mesh.GetGroup();
                group.position.x += ddx;
                group.position.y += ddy;
                group.position.z += ddz;
            }
        }
    }

    /**
     * dissolve時に搭載回転体の座標を整数オフセットにスナップし、
     * RotationAxisManagerの_bodiesマップキーを更新する
     */
    _snapCarriedRotationBodies(rwBody, dx, dy, dz) {
        const ram = this.rotationAxisManager;
        if (!ram) return;

        for (const carried of rwBody._carriedRotationBodies) {
            const rotBody = carried.body;
            const oldKey = carried.key;
            const finalX = carried.origX + dx;
            const finalY = carried.origY + dy;
            const finalZ = carried.origZ + dz;

            rotBody._axisX = finalX;
            rotBody._axisY = finalY;
            rotBody._axisZ = finalZ;
            rotBody._centerX = finalX + 0.5;
            rotBody._centerY = finalY + 0.5;
            rotBody._centerZ = finalZ + 0.5;

            const newKey = `${finalX},${finalY},${finalZ}`;
            if (newKey === oldKey) continue;

            // _bodies / _meshes / _nextDirection のキーを一括更新
            const bodyRef = ram._bodies.get(oldKey);
            if (bodyRef) {
                ram._bodies.delete(oldKey);
                ram._bodies.set(newKey, bodyRef);
                ram._bodiesCacheDirty = true;
            }
            const mesh = ram._meshes.get(oldKey);
            if (mesh) {
                mesh.GetGroup().position.set(finalX + 0.5, finalY + 0.5, finalZ + 0.5);
                ram._meshes.delete(oldKey);
                ram._meshes.set(newKey, mesh);
            }
            const nd = ram._nextDirection.get(oldKey);
            if (nd !== undefined) {
                ram._nextDirection.delete(oldKey);
                ram._nextDirection.set(newKey, nd);
            }
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
