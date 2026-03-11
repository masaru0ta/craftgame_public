/**
 * Piston.js
 * 粘着ピストン管理クラス - アニメーション付き伸長・収縮ロジック
 */

class PistonBody {
    /**
     * @param {number} pistonX - ピストン基部のワールドX
     * @param {number} pistonY - ピストン基部のワールドY
     * @param {number} pistonZ - ピストン基部のワールドZ
     * @param {{x:number,y:number,z:number}} moveVector - 移動ベクトル（D * N）
     * @param {number} totalDistance - 移動距離（N）
     * @param {Array<{rx:number,ry:number,rz:number,blockId:string,orientation:number}>} blocks
     * @param {boolean} isExtending - 伸長中か収縮中か
     * @param {number} orientation - ピストンの orientation
     * @param {Array<{fromX:number,fromY:number,fromZ:number,toX:number,toY:number,toZ:number,blockId:string,orientation:number}>} [pushedBlocks] - 押し出されたブロック（伸長時のみ）
     */
    constructor(pistonX, pistonY, pistonZ, moveVector, totalDistance, blocks, isExtending, orientation, pushedBlocks) {
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
        this._pushedBlocks = pushedBlocks || [];
    }
}

class PistonManager {
    /** 最大伸長距離 */
    static _MAX_EXTEND_DISTANCE = 5;

    /** BFS最大ブロック数 */
    static _MAX_CONNECTED_COUNT = 12;

    /** 押し出しチェーン上限 */
    static _MAX_PUSH_CHAIN = 5;

    /** 非連結ブロック（BFS対象外だが押し出し可能） */
    static _NON_CONNECTABLE = new Set(['stone', 'dirt', 'grass', 'sand', 'water',
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
        /** @type {Map<string, THREE.Mesh>} アーム（棒）メッシュ */
        this._armMeshes = new Map();
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
     * 連結ブロックをBFSで検出
     * @param {number} startX - BFS起点X
     * @param {number} startY - BFS起点Y
     * @param {number} startZ - BFS起点Z
     * @param {number} [excludeX] - 除外座標X（ピストン自身）
     * @param {number} [excludeY] - 除外座標Y
     * @param {number} [excludeZ] - 除外座標Z
     */
    _bfsConnectedBlocks(startX, startY, startZ, excludeX, excludeY, excludeZ) {
        const startBlock = this._getBlock(startX, startY, startZ);
        if (!startBlock || startBlock === 'air' || PistonManager._NON_CONNECTABLE.has(startBlock)) {
            return [];
        }

        const result = [];
        const visited = new Set();
        const queue = [{ x: startX, y: startY, z: startZ }];
        visited.add(`${startX},${startY},${startZ}`);
        if (excludeX !== undefined) {
            visited.add(`${excludeX},${excludeY},${excludeZ}`);
        }

        while (queue.length > 0) {
            if (result.length >= PistonManager._MAX_CONNECTED_COUNT) break;
            const pos = queue.shift();
            const blockId = this._getBlock(pos.x, pos.y, pos.z);
            if (!blockId || blockId === 'air' || PistonManager._NON_CONNECTABLE.has(blockId)) continue;

            const orientation = this._getOrientation(pos.x, pos.y, pos.z);
            result.push({ x: pos.x, y: pos.y, z: pos.z, blockId, orientation });

            if (result.length >= PistonManager._MAX_CONNECTED_COUNT) break;

            for (const dir of PistonManager._SIX_DIRS) {
                const nx = pos.x + dir.x;
                const ny = pos.y + dir.y;
                const nz = pos.z + dir.z;
                const key = `${nx},${ny},${nz}`;
                if (visited.has(key)) continue;
                visited.add(key);
                const nb = this._getBlock(nx, ny, nz);
                if (nb && nb !== 'air' && !PistonManager._NON_CONNECTABLE.has(nb)) {
                    queue.push({ x: nx, y: ny, z: nz });
                }
            }
        }

        return result;
    }

    // === 押し出しチェーン解決 ===

    /**
     * 指定位置から D 方向に連続するブロックの押し出しチェーンを解決
     * @param {number} startX
     * @param {number} startY
     * @param {number} startZ
     * @param {{x:number,y:number,z:number}} d - 方向ベクトル
     * @param {Map<string,string>} virtualWorld - 仮想ワールドオーバーライド
     * @returns {Array|null} 押し出し対象ブロックリスト、失敗時null
     */
    _resolvePushChain(startX, startY, startZ, d, virtualWorld) {
        const chain = [];
        let x = startX, y = startY, z = startZ;
        const maxChain = PistonManager._MAX_PUSH_CHAIN;

        while (true) {
            const key = `${x},${y},${z}`;
            const block = virtualWorld.has(key) ? virtualWorld.get(key) : this._getBlock(x, y, z);
            if (!block || block === 'air') break;
            chain.push({ x, y, z, blockId: block, orientation: this._getOrientation(x, y, z) });
            if (chain.length > maxChain) return null; // チェーン上限超過
            x += d.x; y += d.y; z += d.z;
        }

        // 最終押し出し先がワールド範囲内か
        if (chain.length > 0) {
            const lastY = chain[chain.length - 1].y + d.y;
            if (lastY < 0 || lastY >= 128) return null;
        }

        return chain;
    }

    // === 伸長シミュレーション ===

    /**
     * ステップバイステップで伸長可能距離と押し出しブロックを計算
     * @returns {{actualDist, connectedBlocks, pushedMoves}} or null
     */
    _simulateExtension(wx, wy, wz, d) {
        const maxDist = PistonManager._MAX_EXTEND_DISTANCE;
        let connectedBlocks = null;
        let connectedPositionSet = new Set(); // 連結ブロックの現在位置（スキップ用）
        let contactStep = -1;
        let actualDist = 0;
        const virtualWorld = new Map(); // key → blockId（オーバーライド）
        const allPushedMoves = []; // {fromX,fromY,fromZ,toX,toY,toZ,blockId,orientation}

        for (let step = 1; step <= maxDist; step++) {
            const headX = wx + d.x * step;
            const headY = wy + d.y * step;
            const headZ = wz + d.z * step;

            // ワールド範囲チェック
            if (headY < 0 || headY >= 128) break;

            // 移動体の現在位置を計算
            const entityPositions = new Set();
            entityPositions.add(`${headX},${headY},${headZ}`);

            if (connectedBlocks) {
                const moveOffset = step - contactStep;
                connectedPositionSet = new Set();
                for (const cb of connectedBlocks) {
                    const nx = cb.x + d.x * moveOffset;
                    const ny = cb.y + d.y * moveOffset;
                    const nz = cb.z + d.z * moveOffset;
                    const key = `${nx},${ny},${nz}`;
                    entityPositions.add(key);
                    connectedPositionSet.add(key);
                }
            }

            // 移動体の前ステップ位置（空けられる位置）
            const vacatedPositions = new Set();
            if (step > 1) {
                vacatedPositions.add(`${wx + d.x * (step - 1)},${wy + d.y * (step - 1)},${wz + d.z * (step - 1)}`);
                if (connectedBlocks) {
                    const prevOffset = step - 1 - contactStep;
                    if (prevOffset >= 0) {
                        for (const cb of connectedBlocks) {
                            vacatedPositions.add(`${cb.x + d.x * prevOffset},${cb.y + d.y * prevOffset},${cb.z + d.z * prevOffset}`);
                        }
                    }
                }
            } else {
                // step=1: ピストン基部位置は空く（piston_baseになるが頭部は通過）
                vacatedPositions.add(`${wx},${wy},${wz}`);
            }

            // 各移動体位置で障害ブロックをチェック
            let stepFailed = false;
            const stepPushMoves = [];

            // D方向の列ごとに押し出しチェーンを解決
            // 移動体が占める位置のうち、D方向の最前面を探す
            const columns = new Map(); // "perpKey" → maxDproject
            for (const posKey of entityPositions) {
                const [px, py, pz] = posKey.split(',').map(Number);
                // D方向の射影値
                const dProject = px * d.x + py * d.y + pz * d.z;
                // D直交方向のキー
                const perpKey = d.x !== 0 ? `${py},${pz}` : d.y !== 0 ? `${px},${pz}` : `${px},${py}`;
                if (!columns.has(perpKey) || dProject > columns.get(perpKey).dProject) {
                    columns.set(perpKey, { dProject, x: px, y: py, z: pz });
                }
            }

            // 各列の最前面の1ブロック先から押し出しチェーン解決
            for (const [, front] of columns) {
                const checkX = front.x + d.x;
                const checkY = front.y + d.y;
                const checkZ = front.z + d.z;
                const checkKey = `${checkX},${checkY},${checkZ}`;

                // 既に移動体の位置なら押す必要なし
                if (entityPositions.has(checkKey)) continue;

                const blockAtCheck = virtualWorld.has(checkKey) ? virtualWorld.get(checkKey) : this._getBlock(checkX, checkY, checkZ);
                if (!blockAtCheck || blockAtCheck === 'air') continue;

                // 押し出しチェーン解決
                const chain = this._resolvePushChain(checkX, checkY, checkZ, d, virtualWorld);
                if (!chain) { stepFailed = true; break; }

                // チェーンの各ブロックを1つ先へ（遠い側から）
                for (let i = chain.length - 1; i >= 0; i--) {
                    const cb = chain[i];
                    const toX = cb.x + d.x, toY = cb.y + d.y, toZ = cb.z + d.z;
                    stepPushMoves.push({
                        fromX: cb.x, fromY: cb.y, fromZ: cb.z,
                        toX, toY, toZ,
                        blockId: cb.blockId, orientation: cb.orientation
                    });
                    virtualWorld.set(`${toX},${toY},${toZ}`, cb.blockId);
                    virtualWorld.set(`${cb.x},${cb.y},${cb.z}`, 'air');
                }
            }

            if (stepFailed) break;

            // 移動体が占める位置にある非移動体ブロックも押す必要がある
            // （頭部位置や接触時の連結ブロック位置）
            for (const posKey of entityPositions) {
                if (vacatedPositions.has(posKey)) continue;
                // 連結ブロック位置はスキップ（移動体の一部）
                if (connectedPositionSet.has(posKey)) continue;
                const [px, py, pz] = posKey.split(',').map(Number);
                const blockHere = virtualWorld.has(posKey) ? virtualWorld.get(posKey) : this._getBlock(px, py, pz);
                if (!blockHere || blockHere === 'air') continue;

                // 最初の接触：BFS検出
                if (!connectedBlocks && posKey === `${headX},${headY},${headZ}`) {
                    // この位置のブロックに接触 → BFS
                    const bfsResult = this._bfsConnectedBlocks(headX, headY, headZ, wx, wy, wz);
                    connectedBlocks = bfsResult;
                    contactStep = step;

                    if (bfsResult.length > 0) {
                        // 連結ブロック位置を記録してentityPositionsに追加
                        connectedPositionSet = new Set(bfsResult.map(b => `${b.x},${b.y},${b.z}`));
                        for (const cb of bfsResult) {
                            entityPositions.add(`${cb.x},${cb.y},${cb.z}`);
                        }

                        // 連結ブロックの前方も押し出しチェーンチェックが必要
                        const newColumns = new Map();
                        for (const posKey2 of entityPositions) {
                            const [px2, py2, pz2] = posKey2.split(',').map(Number);
                            const dProject2 = px2 * d.x + py2 * d.y + pz2 * d.z;
                            const perpKey2 = d.x !== 0 ? `${py2},${pz2}` : d.y !== 0 ? `${px2},${pz2}` : `${px2},${py2}`;
                            if (!newColumns.has(perpKey2) || dProject2 > newColumns.get(perpKey2).dProject) {
                                newColumns.set(perpKey2, { dProject: dProject2, x: px2, y: py2, z: pz2 });
                            }
                        }
                        for (const [perpKey2, front2] of newColumns) {
                            if (columns.has(perpKey2)) continue;
                            const chkX = front2.x + d.x, chkY = front2.y + d.y, chkZ = front2.z + d.z;
                            const chkKey = `${chkX},${chkY},${chkZ}`;
                            if (entityPositions.has(chkKey)) continue;
                            const blk = virtualWorld.has(chkKey) ? virtualWorld.get(chkKey) : this._getBlock(chkX, chkY, chkZ);
                            if (!blk || blk === 'air') continue;
                            const chain2 = this._resolvePushChain(chkX, chkY, chkZ, d, virtualWorld);
                            if (!chain2) { stepFailed = true; break; }
                            for (let i = chain2.length - 1; i >= 0; i--) {
                                const cb2 = chain2[i];
                                const toX = cb2.x + d.x, toY = cb2.y + d.y, toZ = cb2.z + d.z;
                                stepPushMoves.push({
                                    fromX: cb2.x, fromY: cb2.y, fromZ: cb2.z,
                                    toX, toY, toZ,
                                    blockId: cb2.blockId, orientation: cb2.orientation
                                });
                                virtualWorld.set(`${toX},${toY},${toZ}`, cb2.blockId);
                                virtualWorld.set(`${cb2.x},${cb2.y},${cb2.z}`, 'air');
                            }
                        }
                        if (stepFailed) break;
                        continue; // 連結ブロックは移動体の一部
                    }
                    // BFS空（非連結ブロック）→ 下の押し出し処理に流れる
                }

                // 移動体位置に残っているブロック → 押す
                const chain = this._resolvePushChain(px, py, pz, d, virtualWorld);
                if (!chain) { stepFailed = true; break; }
                for (let i = chain.length - 1; i >= 0; i--) {
                    const cb = chain[i];
                    const toX = cb.x + d.x, toY = cb.y + d.y, toZ = cb.z + d.z;
                    stepPushMoves.push({
                        fromX: cb.x, fromY: cb.y, fromZ: cb.z,
                        toX, toY, toZ,
                        blockId: cb.blockId, orientation: cb.orientation
                    });
                    virtualWorld.set(`${toX},${toY},${toZ}`, cb.blockId);
                    virtualWorld.set(`${cb.x},${cb.y},${cb.z}`, 'air');
                }
            }

            if (stepFailed) break;

            // 移動体の旧位置をairに
            for (const posKey of vacatedPositions) {
                if (!entityPositions.has(posKey)) {
                    virtualWorld.set(posKey, 'air');
                }
            }

            allPushedMoves.push(...stepPushMoves);
            actualDist = step;
        }

        if (actualDist === 0) return null;

        return {
            actualDist,
            connectedBlocks: connectedBlocks || [],
            contactStep: contactStep,
            pushedMoves: allPushedMoves
        };
    }

    // === 伸長 ===

    /**
     * 粘着ピストンを伸長する（アニメーション開始）
     * @returns {boolean} 成功したか
     */
    Extend(wx, wy, wz) {
        const blockId = this._getBlock(wx, wy, wz);
        if (blockId !== 'sticky_piston') return false;

        const bodyKey = `${wx},${wy},${wz}`;
        if (this._bodies.has(bodyKey)) return false;

        const orientation = this._getOrientation(wx, wy, wz);
        const d = this._getDirection(orientation);

        // ステップバイステップシミュレーション
        const sim = this._simulateExtension(wx, wy, wz, d);
        if (!sim) return false;

        const { actualDist, connectedBlocks, pushedMoves } = sim;

        // === アニメーション開始 ===

        // ピストン基部を即座に変更
        this._setBlock(wx, wy, wz, 'piston_base', orientation);

        // アニメーション用ブロックリスト（相対座標、origin = P）
        const bodyBlocks = [];

        // 連結ブロックをワールドから除去 + bodyBlocksに追加
        for (const block of connectedBlocks) {
            bodyBlocks.push({
                rx: block.x - wx, ry: block.y - wy, rz: block.z - wz,
                blockId: block.blockId, orientation: block.orientation
            });
            this._setBlock(block.x, block.y, block.z, 'air');
            this._updateLight(block.x, block.y, block.z, true);
        }

        // ピストンヘッドをアニメーション体に含める
        bodyBlocks.push({
            rx: 0, ry: 0, rz: 0,
            blockId: 'sticky_piston_head', orientation: orientation
        });

        // 押し出しブロックを実際にワールドに適用（元位置をair、移動先に配置）
        // dissolve時に最終位置に配置するため、ここでは元位置のairだけ
        // 実際の押し出しはdissolve時にまとめて行う

        // チャンクメッシュ再構築
        this._rebuildAffectedChunks(wx, wz, bodyBlocks);

        // PistonBody 生成
        const moveVector = { x: d.x * actualDist, y: d.y * actualDist, z: d.z * actualDist };
        const body = new PistonBody(wx, wy, wz, moveVector, actualDist, bodyBlocks, true, orientation, pushedMoves);
        this._bodies.set(bodyKey, body);

        // メッシュ生成
        this._createMesh(bodyKey, body);

        return true;
    }

    // === 収縮 ===

    /**
     * ピストンを収縮する（アニメーション開始）
     * @returns {boolean} 成功したか
     */
    Retract(wx, wy, wz) {
        const blockId = this._getBlock(wx, wy, wz);
        if (blockId !== 'piston_base') return false;

        const bodyKey = `${wx},${wy},${wz}`;
        if (this._bodies.has(bodyKey)) return false;

        const orientation = this._getOrientation(wx, wy, wz);
        const d = this._getDirection(orientation);

        // ヘッド位置をスキャンで検出
        let dist = 0;
        for (let i = 1; i <= PistonManager._MAX_EXTEND_DISTANCE; i++) {
            if (this._getBlock(wx + d.x * i, wy + d.y * i, wz + d.z * i) === 'sticky_piston_head') {
                dist = i;
                break;
            }
        }
        if (dist === 0) return false;

        const headX = wx + d.x * dist, headY = wy + d.y * dist, headZ = wz + d.z * dist;

        // BFS: ヘッドの粘着面の先（連結ブロックのみ引き戻し）
        const stickyX = headX + d.x, stickyY = headY + d.y, stickyZ = headZ + d.z;
        const connectedBlocks = this._bfsConnectedBlocks(stickyX, stickyY, stickyZ, wx, wy, wz);

        // 引き戻し先の空きチェック（連結ブロックのみ）
        for (const block of connectedBlocks) {
            const destX = block.x - d.x * dist;
            const destY = block.y - d.y * dist;
            const destZ = block.z - d.z * dist;
            const destBlock = this._getBlock(destX, destY, destZ);
            if (destBlock && destBlock !== 'air'
                && destBlock !== 'piston_base' && destBlock !== 'sticky_piston_head') {
                const isOwnBlock = connectedBlocks.some(
                    b => b.x === destX && b.y === destY && b.z === destZ
                );
                if (!isOwnBlock) return false;
            }
            if (destY < 0 || destY >= 128) return false;
        }

        // === アニメーション開始 ===

        // ヘッドをワールドから削除
        this._setBlock(headX, headY, headZ, 'air');
        this._updateLight(headX, headY, headZ, true);

        // bodyBlocks（連結ブロックのみ、origin = P）
        const bodyBlocks = [];

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

        // 移動ベクトルは逆方向
        const moveVector = { x: -d.x * dist, y: -d.y * dist, z: -d.z * dist };
        const body = new PistonBody(wx, wy, wz, moveVector, dist, bodyBlocks, false, orientation);
        this._bodies.set(bodyKey, body);

        this._createMesh(bodyKey, body);

        return true;
    }

    // === アームメッシュ（ビジュアル専用） ===

    _createArmMesh(key, x1, y1, z1, x2, y2, z2) {
        if (typeof THREE === 'undefined' || !this._scene) return;
        this._removeArmMesh(key);
        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length < 0.01) return;
        const geometry = new THREE.CylinderGeometry(0.1, 0.1, length, 6);
        const material = new THREE.MeshBasicMaterial({ color: 0x888888 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        mesh.quaternion.copy(quat);
        this._scene.add(mesh);
        this._armMeshes.set(key, mesh);
    }

    _updateArmMesh(key, x1, y1, z1, x2, y2, z2) {
        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length < 0.01) return;
        const mesh = this._armMeshes.get(key);
        if (!mesh) {
            this._createArmMesh(key, x1, y1, z1, x2, y2, z2);
            return;
        }
        mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        mesh.quaternion.copy(quat);
        if (mesh.geometry) mesh.geometry.dispose();
        mesh.geometry = new THREE.CylinderGeometry(0.1, 0.1, length, 6);
    }

    _removeArmMesh(key) {
        const mesh = this._armMeshes.get(key);
        if (!mesh) return;
        this._scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        this._armMeshes.delete(key);
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

        // 押し出しブロックの最終位置を算出
        const finalPositions = new Map();
        for (const pm of body._pushedBlocks) {
            const origKey = `${pm.fromX},${pm.fromY},${pm.fromZ}`;
            const toKey = `${pm.toX},${pm.toY},${pm.toZ}`;
            if (finalPositions.has(origKey)) {
                const prev = finalPositions.get(origKey);
                finalPositions.delete(origKey);
                finalPositions.set(toKey, { x: pm.toX, y: pm.toY, z: pm.toZ, blockId: prev.blockId, orientation: prev.orientation });
            } else {
                finalPositions.set(toKey, { x: pm.toX, y: pm.toY, z: pm.toZ, blockId: pm.blockId, orientation: pm.orientation });
            }
        }

        // 押し出しブロック: 元の位置をairに
        const clearedPositions = new Set();
        for (const pm of body._pushedBlocks) {
            const origKey = `${pm.fromX},${pm.fromY},${pm.fromZ}`;
            if (!clearedPositions.has(origKey)) {
                this._setBlock(pm.fromX, pm.fromY, pm.fromZ, 'air');
                this._updateLight(pm.fromX, pm.fromY, pm.fromZ, true);
                clearedPositions.add(origKey);
            }
        }

        // 押し出しブロック: 最終位置に配置
        for (const [, fp] of finalPositions) {
            this._setBlock(fp.x, fp.y, fp.z, fp.blockId, fp.orientation);
            this._updateLight(fp.x, fp.y, fp.z, false);
        }

        // 連結ブロック + ヘッドを移動先に書き戻し（押し出しの後に行うことで上書き防止）
        for (const b of body._blocks) {
            const bx = wx + b.rx + mv.x;
            const by = wy + b.ry + mv.y;
            const bz = wz + b.rz + mv.z;
            this._setBlock(bx, by, bz, b.blockId, b.orientation);
            this._updateLight(bx, by, bz, false);
        }

        // アームメッシュ生成
        const key = `${wx},${wy},${wz}`;
        const headX = wx + mv.x, headY = wy + mv.y, headZ = wz + mv.z;
        this._createArmMesh(key, wx + 0.5, wy + 0.5, wz + 0.5, headX + 0.5, headY + 0.5, headZ + 0.5);

        // チャンクメッシュ再構築
        const allBlocks = body._blocks.map(b => ({
            rx: b.rx + mv.x, ry: b.ry + mv.y, rz: b.rz + mv.z
        }));
        for (const [, fp] of finalPositions) {
            allBlocks.push({ rx: fp.x - wx, ry: fp.y - wy, rz: fp.z - wz });
        }
        for (const pm of body._pushedBlocks) {
            allBlocks.push({ rx: pm.fromX - wx, ry: pm.fromY - wy, rz: pm.fromZ - wz });
        }
        this._rebuildAffectedChunks(wx, wz, allBlocks);
    }

    _dissolveRetract(body) {
        const wx = body._pistonX, wy = body._pistonY, wz = body._pistonZ;
        const mv = body._moveVector;

        // 連結ブロックを引き戻し先に書き戻し（ヘッド以外）
        for (const b of body._blocks) {
            if (b.blockId === 'sticky_piston_head') continue;
            const bx = wx + b.rx + mv.x;
            const by = wy + b.ry + mv.y;
            const bz = wz + b.rz + mv.z;
            this._setBlock(bx, by, bz, b.blockId, b.orientation);
            this._updateLight(bx, by, bz, false);
        }

        // ピストン基部を sticky_piston に戻す
        this._setBlock(wx, wy, wz, 'sticky_piston', body._orientation);

        // アームメッシュ削除
        this._removeArmMesh(`${wx},${wy},${wz}`);

        // チャンクメッシュ再構築
        const destBlocks = body._blocks.map(b => ({
            rx: b.rx + mv.x, ry: b.ry + mv.y, rz: b.rz + mv.z
        }));
        destBlocks.push({ rx: 0, ry: 0, rz: 0 });
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
            const progress = body._displacement / body._totalDistance;
            if (mesh) {
                const group = mesh.GetGroup();
                group.position.x = body._pistonX + 0.5 + body._moveVector.x * progress;
                group.position.y = body._pistonY + 0.5 + body._moveVector.y * progress;
                group.position.z = body._pistonZ + 0.5 + body._moveVector.z * progress;
            }

            // アームメッシュ更新
            const baseX = body._pistonX + 0.5;
            const baseY = body._pistonY + 0.5;
            const baseZ = body._pistonZ + 0.5;
            if (body._isExtending) {
                const headX = baseX + body._moveVector.x * progress;
                const headY = baseY + body._moveVector.y * progress;
                const headZ = baseZ + body._moveVector.z * progress;
                this._updateArmMesh(key, baseX, baseY, baseZ, headX, headY, headZ);
            } else {
                const d = this._getDirection(body._orientation);
                const dist = body._totalDistance;
                const origHeadX = body._pistonX + d.x * dist + 0.5;
                const origHeadY = body._pistonY + d.y * dist + 0.5;
                const origHeadZ = body._pistonZ + d.z * dist + 0.5;
                const curHeadX = origHeadX + body._moveVector.x * progress;
                const curHeadY = origHeadY + body._moveVector.y * progress;
                const curHeadZ = origHeadZ + body._moveVector.z * progress;
                this._updateArmMesh(key, baseX, baseY, baseZ, curHeadX, curHeadY, curHeadZ);
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
