/**
 * LightCalculator - ライトマップ計算クラス
 * 太陽光の伝播をBFSで計算し、ChunkDataのライトマップを更新する
 *
 * ルール:
 * - 不透過ブロック: 明るさ0
 * - 空気 + 空が見える: 明るさ15
 * - 空気 + 空が見えない: max(隣接6方向) - 1、最大10、最小0
 * - 水ブロック: max(隣接6方向) - 1、最大14、最小0
 */
class LightCalculator {
    constructor() {
        // 光を通すカスタムブロックのIDセット
        this._customBlockIds = new Set();
    }

    /**
     * カスタムブロックIDを設定（光透過対象）
     * @param {string[]} ids - カスタムブロックIDの配列
     */
    setCustomBlockIds(ids) {
        this._customBlockIds = new Set(ids);
    }

    /** 太陽光の最大明るさ */
    static MAX_LIGHT = 15;
    /** 空気中の光の減衰量 */
    static AIR_DECAY = 1;
    /** 水中の光の減衰量 */
    static WATER_DECAY = 2;
    /** 日陰（非sky-visible空気）の最大明るさ */
    static SHADOW_MAX_LIGHT = 10;
    /** 水中の最大明るさ */
    static WATER_MAX_LIGHT = 14;

    /** 6方向オフセット */
    static DIRS = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1]
    ];

    /**
     * ブロック種別に応じた明るさキャップを適用
     * @param {string} block - ブロックID
     * @param {number} rawLight - 減衰後の明るさ
     * @returns {number} キャップ適用後の明るさ
     */
    static _capLight(block, rawLight) {
        const cap = block === 'air'
            ? LightCalculator.SHADOW_MAX_LIGHT
            : LightCalculator.WATER_MAX_LIGHT;
        return Math.min(rawLight, cap);
    }

    /**
     * BFS伝播先として有効かチェックし、減衰・キャップ適用後の明るさを返す
     * @param {ChunkData} chunk - 対象チャンク
     * @param {number} x - ローカルX
     * @param {number} y - Y
     * @param {number} z - ローカルZ
     * @param {number} sourceLight - 伝播元の明るさ
     * @returns {number} 新しい明るさ（0以下なら伝播不要）
     */
    _calcPropagatedLight(chunk, x, y, z, sourceLight) {
        const block = chunk.getBlock(x, y, z);
        const isCustom = this._customBlockIds.has(block);
        // 不透過ブロック（air, water, カスタム以外）は光を通さない
        if (block !== 'air' && block !== 'water' && !isCustom) return 0;
        // sky-visible な air/カスタムブロックは既にlight=15が設定済み
        if ((block === 'air' || isCustom) && chunk.isSkyVisible(x, y, z)) return 0;

        // カスタムブロックはairと同じ減衰・キャップを適用
        const effectiveBlock = isCustom ? 'air' : block;
        const newLight = LightCalculator._capLight(effectiveBlock, sourceLight - LightCalculator.AIR_DECAY);
        return newLight > chunk.getLight(x, y, z) ? newLight : 0;
    }

    /**
     * チャンクのライトマップを計算（初期計算）
     * @param {ChunkData} chunkData - 対象チャンク
     * @param {Map<string, ChunkData>} [neighborChunks] - 隣接チャンク
     */
    calculate(chunkData, neighborChunks) {
        const SX = ChunkData.SIZE_X;
        const SY = ChunkData.SIZE_Y;
        const SZ = ChunkData.SIZE_Z;

        chunkData._lightMap.fill(0);
        chunkData.buildHeightMap(this._customBlockIds);

        const queue = [];

        // sky-visible空気・光透過ブロックにlight=15を設定
        for (let x = 0; x < SX; x++) {
            for (let z = 0; z < SZ; z++) {
                const heightY = chunkData.getHeight(x, z);
                for (let y = heightY + 1; y < SY; y++) {
                    const block = chunkData.getBlock(x, y, z);
                    if (block === 'air' || this._customBlockIds.has(block)) {
                        chunkData.setLight(x, y, z, LightCalculator.MAX_LIGHT);
                        queue.push(x, y, z, LightCalculator.MAX_LIGHT);
                    }
                }
            }
        }

        if (neighborChunks) {
            this._addBorderLightSources(chunkData, neighborChunks, queue);
        }

        this._propagateBFS(chunkData, queue);
    }

    /**
     * 隣接チャンクの境界から光源を収集
     */
    _addBorderLightSources(chunkData, neighborChunks, queue) {
        const SX = ChunkData.SIZE_X;
        const SY = ChunkData.SIZE_Y;
        const SZ = ChunkData.SIZE_Z;

        // [チャンクキー, 隣接チャンク側の固定座標取得関数, 自チャンク側の座標取得関数]
        const borders = [
            { key: `${chunkData.chunkX - 1},${chunkData.chunkZ}`, getNeighborPos: (i) => [SX - 1, i], getLocalPos: (i) => [0, i] },
            { key: `${chunkData.chunkX + 1},${chunkData.chunkZ}`, getNeighborPos: (i) => [0, i], getLocalPos: (i) => [SX - 1, i] },
            { key: `${chunkData.chunkX},${chunkData.chunkZ - 1}`, getNeighborPos: (i) => [i, SZ - 1], getLocalPos: (i) => [i, 0] },
            { key: `${chunkData.chunkX},${chunkData.chunkZ + 1}`, getNeighborPos: (i) => [i, 0], getLocalPos: (i) => [i, SZ - 1] },
        ];

        for (const border of borders) {
            const neighbor = neighborChunks.get(border.key);
            if (!neighbor) continue;

            // baseY差分: 隣接チャンクのローカルY → 自チャンクのローカルYへの変換量
            const baseYDiff = neighbor.baseY - chunkData.baseY;

            const iterMax = border.getNeighborPos(0)[0] === border.getLocalPos(0)[0] ? SZ : SX;
            for (let ny = 0; ny < SY; ny++) {
                // 隣接チャンクのローカルY(ny) → 自チャンクのローカルY
                const localY = ny + baseYDiff;
                if (localY < 0 || localY >= SY) continue;

                for (let i = 0; i < iterMax; i++) {
                    const [nPosX, nPosZ] = border.getNeighborPos(i);
                    const neighborLight = neighbor.getLight(nPosX, ny, nPosZ);
                    if (neighborLight <= 1) continue;

                    const [lx, lz] = border.getLocalPos(i);
                    const newLight = this._calcPropagatedLight(chunkData, lx, localY, lz, neighborLight);
                    if (newLight > 0) {
                        chunkData.setLight(lx, localY, lz, newLight);
                        queue.push(lx, localY, lz, newLight);
                    }
                }
            }
        }
    }

    /**
     * BFSで光を伝播（クロスチャンク対応）
     * @param {ChunkData} chunkData
     * @param {number[]} queue - [x, y, z, light, ...]
     * @param {Map<string, ChunkData>} [neighborChunks]
     * @returns {Set<string>} 変更のあった隣接チャンクキーのSet
     */
    _propagateBFS(chunkData, queue, neighborChunks = null) {
        const SX = ChunkData.SIZE_X;
        const SY = ChunkData.SIZE_Y;
        const SZ = ChunkData.SIZE_Z;
        const spillQueues = neighborChunks ? new Map() : null;

        let head = 0;
        while (head < queue.length) {
            const x = queue[head++];
            const y = queue[head++];
            const z = queue[head++];
            const light = queue[head++];

            for (const [dx, dy, dz] of LightCalculator.DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                const nz = z + dz;

                if (ny < 0 || ny >= SY) continue;

                if (nx >= 0 && nx < SX && nz >= 0 && nz < SZ) {
                    const newLight = this._calcPropagatedLight(chunkData, nx, ny, nz, light);
                    if (newLight > 0) {
                        chunkData.setLight(nx, ny, nz, newLight);
                        queue.push(nx, ny, nz, newLight);
                    }
                } else if (neighborChunks) {
                    const resolved = this._resolveNeighborPosition(chunkData, nx, ny, nz, neighborChunks);
                    if (!resolved) continue;

                    // baseY差分を考慮したY座標変換
                    const neighborNy = ny + (chunkData.baseY - resolved.chunk.baseY);
                    if (neighborNy < 0 || neighborNy >= SY) continue;

                    const newLight = this._calcPropagatedLight(resolved.chunk, resolved.x, neighborNy, resolved.z, light);
                    if (newLight > 0) {
                        resolved.chunk.setLight(resolved.x, neighborNy, resolved.z, newLight);
                        const key = `${resolved.chunk.chunkX},${resolved.chunk.chunkZ}`;
                        if (!spillQueues.has(key)) spillQueues.set(key, []);
                        spillQueues.get(key).push(resolved.x, neighborNy, resolved.z, newLight);
                    }
                }
            }
        }

        // スピルBFS実行（隣接チャンク内のみ）
        const modifiedNeighbors = new Set();
        if (spillQueues) {
            for (const [key, spillQueue] of spillQueues) {
                if (spillQueue.length > 0) {
                    const neighbor = neighborChunks.get(key);
                    if (neighbor) {
                        this._propagateBFS(neighbor, spillQueue);
                        modifiedNeighbors.add(key);
                    }
                }
            }
        }

        return modifiedNeighbors;
    }

    /**
     * ブロック種別に応じた新しい明るさを計算（onBlockRemoved用）
     * @param {ChunkData} chunkData
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {Map<string, ChunkData>} [neighborChunks]
     * @returns {number} 新しい明るさ
     */
    _calcLightForPosition(chunkData, x, y, z, neighborChunks) {
        const block = chunkData.getBlock(x, y, z);
        const isCustom = this._customBlockIds.has(block);
        if ((block === 'air' || isCustom) && chunkData.isSkyVisible(x, y, z)) {
            return LightCalculator.MAX_LIGHT;
        }
        if (block === 'air' || block === 'water' || isCustom) {
            const effectiveBlock = isCustom ? 'air' : block;
            const maxN = this._getMaxNeighborLight(chunkData, x, y, z, neighborChunks);
            return LightCalculator._capLight(effectiveBlock, Math.max(0, maxN - 1));
        }
        return 0;
    }

    /**
     * ブロック破壊時のライト更新
     * @param {ChunkData} chunkData
     * @param {number} x - ローカルX座標
     * @param {number} y - Y座標
     * @param {number} z - ローカルZ座標
     * @param {Map<string, ChunkData>} [neighborChunks]
     * @returns {Set<string>} 変更のあった隣接チャンクキーのSet
     */
    onBlockRemoved(chunkData, x, y, z, neighborChunks) {
        chunkData.buildHeightMap(this._customBlockIds);

        const propagateQueue = [];

        // 除去位置の明るさ決定
        const newLight = this._calcLightForPosition(chunkData, x, y, z, neighborChunks);
        chunkData.setLight(x, y, z, newLight);
        if (newLight > 0) {
            propagateQueue.push(x, y, z, newLight);
        }

        // 列下で新たにsky-visibleになった空気の更新
        for (let below = y - 1; below >= 0; below--) {
            const belowBlock = chunkData.getBlock(x, below, z);
            if (belowBlock === 'air') {
                if (chunkData.isSkyVisible(x, below, z)) {
                    chunkData.setLight(x, below, z, LightCalculator.MAX_LIGHT);
                    propagateQueue.push(x, below, z, LightCalculator.MAX_LIGHT);
                } else {
                    break;
                }
            } else if (belowBlock === 'water') {
                continue;
            } else {
                break;
            }
        }

        // BFS伝播
        let modifiedNeighbors = new Set();
        if (propagateQueue.length > 0) {
            const modified = this._propagateBFS(chunkData, propagateQueue, neighborChunks);
            for (const k of modified) modifiedNeighbors.add(k);
        }

        return modifiedNeighbors;
    }

    /**
     * ブロック設置時のライト更新
     * @param {ChunkData} chunkData
     * @param {number} x - ローカルX座標
     * @param {number} y - Y座標
     * @param {number} z - ローカルZ座標
     * @param {Map<string, ChunkData>} [neighborChunks]
     * @returns {Set<string>} 変更のあった隣接チャンクキーのSet
     */
    onBlockPlaced(chunkData, x, y, z, neighborChunks) {
        const block = chunkData.getBlock(x, y, z);
        // カスタムブロックは光を通すため、airと同様にライト計算
        if (this._customBlockIds.has(block)) {
            chunkData.buildHeightMap(this._customBlockIds);
            const newLight = this._calcLightForPosition(chunkData, x, y, z, neighborChunks);
            chunkData.setLight(x, y, z, newLight);
            if (newLight > 0) {
                const queue = [x, y, z, newLight];
                this._propagateBFS(chunkData, queue, neighborChunks);
            }
            return new Set();
        }

        const oldLight = chunkData.getLight(x, y, z);
        chunkData.setLight(x, y, z, 0);
        chunkData.buildHeightMap(this._customBlockIds);

        const removalQueue = [];

        if (oldLight > 0) {
            removalQueue.push(x, y, z, oldLight);
        }

        // 列下で非sky-visibleになった位置を更新
        for (let below = y - 1; below >= 0; below--) {
            const block = chunkData.getBlock(x, below, z);
            if (block === 'air' || block === 'water') {
                if (!chunkData.isSkyVisible(x, below, z)) {
                    const belowOldLight = chunkData.getLight(x, below, z);
                    chunkData.setLight(x, below, z, 0);
                    if (belowOldLight > 0) {
                        removalQueue.push(x, below, z, belowOldLight);
                    }
                }
            } else {
                break;
            }
        }

        // Light Removal BFS
        let modifiedNeighbors = new Set();
        if (removalQueue.length > 0) {
            const modified = this._lightRemovalBFS(chunkData, removalQueue, neighborChunks);
            for (const k of modified) modifiedNeighbors.add(k);
        }

        return modifiedNeighbors;
    }

    /**
     * Light Removal BFS: 遮られた光を除去し再伝播（クロスチャンク対応）
     * @param {ChunkData} chunkData
     * @param {number[]} initialRemoveQueue - [x, y, z, oldLight, ...]
     * @param {Map<string, ChunkData>} [neighborChunks]
     * @returns {Set<string>} 変更のあった隣接チャンクキーのSet
     */
    _lightRemovalBFS(chunkData, initialRemoveQueue, neighborChunks = null) {
        const SX = ChunkData.SIZE_X;
        const SY = ChunkData.SIZE_Y;
        const SZ = ChunkData.SIZE_Z;

        const removeQueue = initialRemoveQueue.slice();
        const repropagate = [];

        const neighborRemoveQueues = neighborChunks ? new Map() : null;
        const neighborRepropagate = neighborChunks ? new Map() : null;

        let head = 0;
        while (head < removeQueue.length) {
            const x = removeQueue[head++];
            const y = removeQueue[head++];
            const z = removeQueue[head++];
            const oldLight = removeQueue[head++];

            for (const [dx, dy, dz] of LightCalculator.DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                const nz = z + dz;

                if (ny < 0 || ny >= SY) continue;

                if (nx >= 0 && nx < SX && nz >= 0 && nz < SZ) {
                    const nLight = chunkData.getLight(nx, ny, nz);
                    if (nLight > 0 && nLight < oldLight) {
                        chunkData.setLight(nx, ny, nz, 0);
                        removeQueue.push(nx, ny, nz, nLight);
                    } else if (nLight >= oldLight) {
                        repropagate.push(nx, ny, nz, nLight);
                    }
                } else if (neighborChunks) {
                    const resolved = this._resolveNeighborPosition(chunkData, nx, ny, nz, neighborChunks);
                    if (!resolved) continue;

                    // baseY差分を考慮したY座標変換
                    const neighborNy = ny + (chunkData.baseY - resolved.chunk.baseY);
                    if (neighborNy < 0 || neighborNy >= SY) continue;

                    const key = `${resolved.chunk.chunkX},${resolved.chunk.chunkZ}`;
                    const nLight = resolved.chunk.getLight(resolved.x, neighborNy, resolved.z);
                    if (nLight > 0 && nLight < oldLight) {
                        resolved.chunk.setLight(resolved.x, neighborNy, resolved.z, 0);
                        if (!neighborRemoveQueues.has(key)) neighborRemoveQueues.set(key, []);
                        neighborRemoveQueues.get(key).push(resolved.x, neighborNy, resolved.z, nLight);
                    } else if (nLight >= oldLight) {
                        if (!neighborRepropagate.has(key)) neighborRepropagate.set(key, []);
                        neighborRepropagate.get(key).push(resolved.x, neighborNy, resolved.z, nLight);
                    }
                }
            }
        }

        // メインチャンクの再伝播
        const modifiedNeighbors = new Set();
        if (repropagate.length > 0) {
            const modified = this._propagateBFS(chunkData, repropagate, neighborChunks);
            for (const k of modified) modifiedNeighbors.add(k);
        }

        // 隣接チャンクのremoval BFS + 再伝播
        if (neighborChunks) {
            const allNeighborKeys = new Set([
                ...(neighborRemoveQueues ? neighborRemoveQueues.keys() : []),
                ...(neighborRepropagate ? neighborRepropagate.keys() : [])
            ]);

            for (const key of allNeighborKeys) {
                const neighbor = neighborChunks.get(key);
                if (!neighbor) continue;

                const remQueue = neighborRemoveQueues.get(key);
                if (remQueue && remQueue.length > 0) {
                    this._lightRemovalBFS(neighbor, remQueue);
                    modifiedNeighbors.add(key);
                }

                const repropQueue = neighborRepropagate.get(key);
                if (repropQueue && repropQueue.length > 0) {
                    this._propagateBFS(neighbor, repropQueue);
                    modifiedNeighbors.add(key);
                }
            }
        }

        return modifiedNeighbors;
    }

    /**
     * 隣接6方向の最大明るさを取得（クロスチャンク対応）
     */
    _getMaxNeighborLight(chunkData, x, y, z, neighborChunks = null) {
        const SX = ChunkData.SIZE_X;
        const SY = ChunkData.SIZE_Y;
        const SZ = ChunkData.SIZE_Z;
        let maxLight = 0;
        for (const [dx, dy, dz] of LightCalculator.DIRS) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            let light = 0;
            if (nx >= 0 && nx < SX && ny >= 0 && ny < SY && nz >= 0 && nz < SZ) {
                light = chunkData.getLight(nx, ny, nz);
            } else if (ny >= 0 && ny < SY && neighborChunks) {
                const resolved = this._resolveNeighborPosition(chunkData, nx, ny, nz, neighborChunks);
                if (resolved) {
                    // baseY差分を考慮したY座標変換
                    const neighborNy = ny + (chunkData.baseY - resolved.chunk.baseY);
                    if (neighborNy >= 0 && neighborNy < SY) {
                        light = resolved.chunk.getLight(resolved.x, neighborNy, resolved.z);
                    }
                }
            }
            if (light > maxLight) maxLight = light;
        }
        return maxLight;
    }

    /**
     * チャンク境界外の座標を隣接チャンクのローカル座標に変換
     */
    _resolveNeighborPosition(chunkData, nx, ny, nz, neighborChunks) {
        const SX = ChunkData.SIZE_X;
        const SZ = ChunkData.SIZE_Z;
        let targetChunk = null;
        let localX = nx;
        let localZ = nz;

        if (nx < 0) {
            targetChunk = neighborChunks.get(`${chunkData.chunkX - 1},${chunkData.chunkZ}`);
            localX = SX + nx;
        } else if (nx >= SX) {
            targetChunk = neighborChunks.get(`${chunkData.chunkX + 1},${chunkData.chunkZ}`);
            localX = nx - SX;
        } else if (nz < 0) {
            targetChunk = neighborChunks.get(`${chunkData.chunkX},${chunkData.chunkZ - 1}`);
            localZ = SZ + nz;
        } else if (nz >= SZ) {
            targetChunk = neighborChunks.get(`${chunkData.chunkX},${chunkData.chunkZ + 1}`);
            localZ = nz - SZ;
        }

        if (!targetChunk) return null;
        return { chunk: targetChunk, x: localX, z: localZ };
    }
}

// グローバルスコープに公開
window.LightCalculator = LightCalculator;
