/**
 * StructurePlacer
 * 構造物の座標変換・設置可否チェック・一括設置を担当するクラス
 */
class StructurePlacer {
    /**
     * @param {Object} options
     * @param {Object} [options.chunkManager]  - ChunkManager インスタンス
     * @param {Object} [options.physicsWorld]  - PhysicsWorld インスタンス
     * @param {Object} [options.player]        - Player インスタンス
     * @param {Object} [options.chunkStorage]  - ChunkStorage インスタンス
     */
    constructor(options = {}) {
        this._chunkManager  = options.chunkManager  || null;
        this._physicsWorld  = options.physicsWorld  || null;
        this._player        = options.player        || null;
        this._chunkStorage  = options.chunkStorage  || null;
    }

    // ============================================================
    // Y軸回転: ブロック座標変換
    // ============================================================

    /**
     * Y軸 +90° を1回適用する
     * (dx, dy, dz) → (-dz, dy, dx)
     * @param {number} dx
     * @param {number} dy
     * @param {number} dz
     * @returns {{ dx: number, dy: number, dz: number }}
     */
    RotateBlockPos(dx, dy, dz) {
        return { dx: -dz + 0, dy: dy, dz: dx };
    }

    /**
     * Y軸回転を rotY 回分まとめて適用する
     * @param {number} dx
     * @param {number} dy
     * @param {number} dz
     * @param {number} rotY - 0|1|2|3
     * @returns {{ dx: number, dy: number, dz: number }}
     */
    ApplyRotation(dx, dy, dz, rotY) {
        const n = ((rotY % 4) + 4) % 4;
        let cur = { dx, dy, dz };
        for (let i = 0; i < n; i++) {
            cur = this.RotateBlockPos(cur.dx, cur.dy, cur.dz);
        }
        return cur;
    }

    // ============================================================
    // Y軸回転: orientation 変換
    // ============================================================

    /**
     * orientation = topDir * 4 + rotation に対して Y軸 +90° を1回適用する
     *
     * topDir マッピング（+90° 1回）:
     *   0(+Y) → 0   1(-Y) → 1   2(+Z) → 5   3(-Z) → 4   4(+X) → 2   5(-X) → 3
     *
     * rotation 変化:
     *   topDir=1(-Y): (rotation + 3) % 4  （逆方向）
     *   それ以外:     (rotation + 1) % 4
     *
     * @param {number} orientation - 0〜23
     * @returns {number}
     */
    RotateOrientation(orientation) {
        const topDir  = Math.floor(orientation / 4);
        const rotation = orientation % 4;

        // topDir の Y軸回転マッピング（+90°）
        const topDirMap = [0, 1, 5, 4, 2, 3];
        const newTopDir = topDirMap[topDir];

        // rotation 変化: -Y のみ逆方向
        const newRotation = (topDir === 1)
            ? (rotation + 3) % 4
            : (rotation + 1) % 4;

        return newTopDir * 4 + newRotation;
    }

    /**
     * orientation に Y軸回転を rotY 回分まとめて適用する
     * @param {number} orientation - 0〜23
     * @param {number} rotY - 0|1|2|3（4以上は mod 4）
     * @returns {number}
     */
    ApplyOrientationRotation(orientation, rotY) {
        const n = ((rotY % 4) + 4) % 4;
        let cur = orientation;
        for (let i = 0; i < n; i++) {
            cur = this.RotateOrientation(cur);
        }
        return cur;
    }

    // ============================================================
    // 設置可否チェック
    // ============================================================

    /**
     * 構造物を設置できるか判定する（全非airブロックに対して確認）
     *
     * チェック項目:
     *   1. 設置先が air であること
     *   2. Y座標が 0 ≤ Y ≤ 127 であること
     *   3. プレイヤーAABBと交差しないこと
     *
     * @param {{ x: number, y: number, z: number }} adjacentPos - 設置基点（原点マーカーの位置）
     * @param {Object} structureData - GAS から取得した構造物オブジェクト
     * @param {number} rotY - 0|1|2|3
     * @returns {boolean}
     */
    CanPlace(adjacentPos, structureData, rotY) {
        if (!this._physicsWorld) return false;
        const blocks = this._iterateBlocks(adjacentPos, structureData, rotY);
        for (const { wx, wy, wz } of blocks) {
            // Y範囲チェック
            if (wy < 0 || wy > 127) return false;
            // 設置先が air かチェック
            const existing = this._physicsWorld.getBlockAt(wx, wy, wz);
            if (existing && existing !== 'air') return false;
            // プレイヤーAABB重複チェック
            if (this._intersectsPlayer(wx, wy, wz)) return false;
        }
        return true;
    }

    // ============================================================
    // 一括設置実行
    // ============================================================

    /**
     * 構造物を設置する（内部で CanPlace を呼ぶ）
     * @param {{ x: number, y: number, z: number }} adjacentPos
     * @param {Object} structureData
     * @param {number} rotY
     * @returns {boolean} 設置成功なら true
     */
    Place(adjacentPos, structureData, rotY) {
        if (!this.CanPlace(adjacentPos, structureData, rotY)) return false;

        const positions = [];
        const blocks = this._iterateBlocks(adjacentPos, structureData, rotY);
        const chunksToSave = new Map();

        for (const { wx, wy, wz, blockStrId, orientation } of blocks) {
            const chunkX = Math.floor(wx / 16);
            const chunkZ = Math.floor(wz / 16);
            const localX = ((wx % 16) + 16) % 16;
            const localZ = ((wz % 16) + 16) % 16;

            const chunkKey = `${chunkX},${chunkZ}`;
            const chunk = this._chunkManager.chunks.get(chunkKey);
            if (!chunk || !chunk.chunkData) continue;

            const localY = wy - chunk.chunkData.baseY;
            if (localY < 0 || localY >= 128) continue;

            chunk.chunkData.setBlock(localX, localY, localZ, blockStrId, orientation);
            positions.push([wx, wy, wz]);
            chunksToSave.set(chunkKey, { chunkX, chunkZ, chunkData: chunk.chunkData });
        }

        if (positions.length === 0) return false;

        // メッシュ再構築
        this._chunkManager.rebuildChunksAtPositions(positions, new Set());

        // IndexedDB 保存
        for (const { chunkX, chunkZ, chunkData } of chunksToSave.values()) {
            this._saveChunk(chunkX, chunkZ, chunkData);
        }

        return true;
    }

    // ============================================================
    // プライベートヘルパー
    // ============================================================

    /**
     * 構造物の全非airブロックを回転・オフセット適用してイテレートする
     * @private
     * @yields {{ wx, wy, wz, blockStrId, orientation }}
     */
    *_iterateBlocks(adjacentPos, structureData, rotY) {
        // palette と voxel_data を StructureData に復元
        const sd = this._decodeStructureData(structureData);
        if (!sd) return;

        // bb_min（エディタ上の原点相対オフセット）
        // bb_min が個別フィールドにある場合はそれを使用、
        // なければ palette JSON 内の offset フィールドから取得
        let offsetX = 0, offsetY = 0, offsetZ = 0;
        if (structureData.bb_min_x !== undefined) {
            offsetX = structureData.bb_min_x - 16;
            offsetY = structureData.bb_min_y || 0;
            offsetZ = structureData.bb_min_z - 16;
        } else {
            // palette.offset = [bb_min_x - ORIGIN_X, bb_min_y, bb_min_z - ORIGIN_Z]
            const rawPalette = structureData.palette;
            let paletteOffset = null;
            if (typeof rawPalette === 'string') {
                try {
                    const parsed = JSON.parse(rawPalette);
                    if (parsed && Array.isArray(parsed.offset)) paletteOffset = parsed.offset;
                } catch (_) {}
            } else if (rawPalette && Array.isArray(rawPalette.offset)) {
                paletteOffset = rawPalette.offset;
            }
            if (paletteOffset) {
                offsetX = paletteOffset[0] || 0;
                offsetY = paletteOffset[1] || 0;
                offsetZ = paletteOffset[2] || 0;
            }
        }

        const sizeX = structureData.size_x || 0;
        const sizeY = structureData.size_y || 0;
        const sizeZ = structureData.size_z || 0;

        for (let iy = 0; iy < sizeY; iy++) {
            for (let iz = 0; iz < sizeZ; iz++) {
                for (let ix = 0; ix < sizeX; ix++) {
                    const { blockStrId, orientation: origOrientation } = sd.getBlock(ix, iy, iz);
                    if (blockStrId === 'air') continue;

                    const dx = offsetX + ix;
                    const dy = offsetY + iy;
                    const dz = offsetZ + iz;

                    const rotated = this.ApplyRotation(dx, dy, dz, rotY);
                    // orientation 回転は位置回転と逆方向（RotateBlockPos は CCW、orientation は CW 相当）
                    const rotatedOrientation = this.ApplyOrientationRotation(origOrientation, (4 - rotY) % 4);

                    yield {
                        wx: adjacentPos.x + rotated.dx,
                        wy: adjacentPos.y + rotated.dy,
                        wz: adjacentPos.z + rotated.dz,
                        blockStrId,
                        orientation: rotatedOrientation,
                    };
                }
            }
        }
    }

    /**
     * GAS 構造物オブジェクトから StructureData を復元する
     * @private
     */
    _decodeStructureData(structureData) {
        if (typeof StructureData === 'undefined') return null;

        const palette = this._parsePalette(structureData.palette);
        const voxelData = structureData.voxel_data || '';
        const orientData = structureData.orientation_data || '';
        const sx = structureData.size_x || 0;
        const sy = structureData.size_y || 0;
        const sz = structureData.size_z || 0;

        if (!voxelData || sx === 0) return null;

        return StructureData.decode(voxelData, orientData, palette, sx, sy, sz);
    }

    /**
     * palette フィールドをパース（文字列または配列）
     * @private
     */
    _parsePalette(palette) {
        if (Array.isArray(palette)) return palette;
        if (typeof palette === 'string') {
            if (palette === '') return ['air'];
            try {
                const parsed = JSON.parse(palette);
                if (Array.isArray(parsed)) return parsed;
                // {"blocks": [...], "offset": [...]} 形式
                if (parsed && Array.isArray(parsed.blocks)) return parsed.blocks;
            } catch (_) {}
            return ['air'];
        }
        // オブジェクト形式（文字列化前）
        if (palette && Array.isArray(palette.blocks)) return palette.blocks;
        return ['air'];
    }

    /**
     * ブロックとプレイヤーAABBの交差判定
     * @private
     */
    _intersectsPlayer(x, y, z) {
        if (!this._player) return false;
        const blockAABB = { minX: x, minY: y, minZ: z, maxX: x + 1, maxY: y + 1, maxZ: z + 1 };
        const playerAABB = this._player.getAABB();
        return blockAABB.minX < playerAABB.maxX && blockAABB.maxX > playerAABB.minX &&
               blockAABB.minY < playerAABB.maxY && blockAABB.maxY > playerAABB.minY &&
               blockAABB.minZ < playerAABB.maxZ && blockAABB.maxZ > playerAABB.minZ;
    }

    /**
     * チャンクを IndexedDB に保存（非同期）
     * @private
     */
    async _saveChunk(chunkX, chunkZ, chunkData) {
        const key = `${chunkX},${chunkZ}`;
        this._chunkManager.modifiedChunkCache.set(key, chunkData.getSerializedData());
        if (this._chunkStorage) {
            try {
                await this._chunkStorage.save(this._chunkManager.worldName, chunkX, chunkZ, chunkData);
            } catch (e) {
                console.error('StructurePlacer: チャンク保存失敗', e);
            }
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.StructurePlacer = StructurePlacer;
}
