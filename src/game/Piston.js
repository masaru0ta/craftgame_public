/**
 * Piston.js
 * 粘着ピストン管理クラス - 伸長・収縮ロジック
 */
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
     * @param {ChunkManager} chunkManager
     */
    constructor(chunkManager) {
        this._chunkManager = chunkManager;
    }

    /**
     * 指定座標のブロックIDを取得
     */
    _getBlock(wx, wy, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.chunkData) return null;
        const lx = ((wx % 16) + 16) % 16;
        const lz = ((wz % 16) + 16) % 16;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return null;
        return chunk.chunkData.getBlock(lx, ly, lz);
    }

    /**
     * 指定座標のorientationを取得
     */
    _getOrientation(wx, wy, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.chunkData) return 0;
        const lx = ((wx % 16) + 16) % 16;
        const lz = ((wz % 16) + 16) % 16;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return 0;
        return chunk.chunkData.getOrientation(lx, ly, lz);
    }

    /**
     * 指定座標にブロックを設置
     */
    _setBlock(wx, wy, wz, blockId, orientation = 0) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.chunkData) return false;
        const lx = ((wx % 16) + 16) % 16;
        const lz = ((wz % 16) + 16) % 16;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return false;
        chunk.chunkData.setBlock(lx, ly, lz, blockId, orientation);
        return true;
    }

    /**
     * チャンクメッシュを再構築
     */
    _rebuildMesh(wx, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        this._chunkManager.rebuildChunkMesh(cx, cz);
    }

    /**
     * 影響範囲のチャンクメッシュをすべて再構築
     */
    _rebuildAffectedChunks(positions) {
        const rebuilt = new Set();
        for (const p of positions) {
            const key = `${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`;
            if (!rebuilt.has(key)) {
                rebuilt.add(key);
                this._rebuildMesh(p.x, p.z);
            }
        }
    }

    /**
     * orientation から方向ベクトルを取得
     */
    _getDirection(orientation) {
        const topDir = Math.floor(orientation / 4);
        return PistonManager._DIRECTION_FROM_TOPDIR[topDir] || PistonManager._DIRECTION_FROM_TOPDIR[0];
    }

    /**
     * BFS で粘着面に接続されたブロック群を検出
     * @param {number} startX - 起点X
     * @param {number} startY - 起点Y
     * @param {number} startZ - 起点Z
     * @returns {Array<{x:number, y:number, z:number, blockId:string, orientation:number}>}
     */
    _bfsConnectedBlocks(startX, startY, startZ) {
        const startBlock = this._getBlock(startX, startY, startZ);
        if (!startBlock || startBlock === 'air' || PistonManager._NON_PUSHABLE.has(startBlock)) {
            return [];
        }

        const result = [];
        const visited = new Set();
        const queue = [{ x: startX, y: startY, z: startZ }];
        visited.add(`${startX},${startY},${startZ}`);

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

    /**
     * 粘着ピストンを伸長する
     * @param {number} wx - sticky_piston のワールドX
     * @param {number} wy - sticky_piston のワールドY
     * @param {number} wz - sticky_piston のワールドZ
     * @returns {boolean} 成功したか
     */
    Extend(wx, wy, wz) {
        const blockId = this._getBlock(wx, wy, wz);
        if (blockId !== 'sticky_piston') return false;

        const orientation = this._getOrientation(wx, wy, wz);
        const d = this._getDirection(orientation);
        const dist = PistonManager._EXTEND_DISTANCE;

        // 経路上（P+D 〜 P+5*D）のブロックチェック
        for (let i = 1; i <= dist; i++) {
            const bx = wx + d.x * i;
            const by = wy + d.y * i;
            const bz = wz + d.z * i;
            const b = this._getBlock(bx, by, bz);
            if (b && b !== 'air' && PistonManager._NON_PUSHABLE.has(b)) {
                return false; // 非可動ブロックが経路上にある
            }
        }

        // 粘着面のブロック群を検出（BFS）
        const stickyX = wx + d.x;
        const stickyY = wy + d.y;
        const stickyZ = wz + d.z;
        const connectedBlocks = this._bfsConnectedBlocks(stickyX, stickyY, stickyZ);

        // 経路上のブロックも押し出し対象に追加
        const allBlocks = [...connectedBlocks];
        const connectedSet = new Set(connectedBlocks.map(b => `${b.x},${b.y},${b.z}`));

        for (let i = 1; i <= dist; i++) {
            const bx = wx + d.x * i;
            const by = wy + d.y * i;
            const bz = wz + d.z * i;
            const key = `${bx},${by},${bz}`;
            if (connectedSet.has(key)) continue;
            const b = this._getBlock(bx, by, bz);
            if (b && b !== 'air') {
                if (PistonManager._NON_PUSHABLE.has(b)) return false;
                const ori = this._getOrientation(bx, by, bz);
                allBlocks.push({ x: bx, y: by, z: bz, blockId: b, orientation: ori });
                connectedSet.add(key);
            }
        }

        // 総数チェック
        if (allBlocks.length > PistonManager._MAX_PUSH_COUNT) return false;

        // 移動先の空きチェック
        for (const block of allBlocks) {
            const destX = block.x + d.x * dist;
            const destY = block.y + d.y * dist;
            const destZ = block.z + d.z * dist;
            const destKey = `${destX},${destY},${destZ}`;

            // 移動先が他の移動ブロックの移動先でない限り空きか確認
            const destBlock = this._getBlock(destX, destY, destZ);
            if (destBlock && destBlock !== 'air') {
                // 移動先にあるブロックが移動対象に含まれていれば OK
                if (!connectedSet.has(`${destX},${destY},${destZ}`)) {
                    return false;
                }
            }
            // ワールド範囲チェック
            if (destY < 0 || destY >= 128) return false;
        }

        // ブロック移動を実行（遠い側から順に）
        // D方向のドット積でソート（遠い方が先）
        allBlocks.sort((a, b) => {
            const dotA = a.x * d.x + a.y * d.y + a.z * d.z;
            const dotB = b.x * d.x + b.y * d.y + b.z * d.z;
            return dotB - dotA; // 遠い方を先に
        });

        // 移動先にコピー
        for (const block of allBlocks) {
            const destX = block.x + d.x * dist;
            const destY = block.y + d.y * dist;
            const destZ = block.z + d.z * dist;
            this._setBlock(destX, destY, destZ, block.blockId, block.orientation);
        }

        // 元の位置を air に
        for (const block of allBlocks) {
            this._setBlock(block.x, block.y, block.z, 'air', 0);
        }

        // ピストン状態変更
        this._setBlock(wx, wy, wz, 'piston_base', orientation);
        this._setBlock(wx + d.x * dist, wy + d.y * dist, wz + d.z * dist, 'sticky_piston_head', orientation);

        // チャンクメッシュ再構築
        const positions = [{ x: wx, z: wz }];
        for (const block of allBlocks) {
            positions.push({ x: block.x, z: block.z });
            positions.push({ x: block.x + d.x * dist, z: block.z + d.z * dist });
        }
        positions.push({ x: wx + d.x * dist, z: wz + d.z * dist });
        this._rebuildAffectedChunks(positions);

        return true;
    }

    /**
     * ピストンを収縮する
     * @param {number} wx - piston_base のワールドX
     * @param {number} wy - piston_base のワールドY
     * @param {number} wz - piston_base のワールドZ
     * @returns {boolean} 成功したか
     */
    Retract(wx, wy, wz) {
        const blockId = this._getBlock(wx, wy, wz);
        if (blockId !== 'piston_base') return false;

        const orientation = this._getOrientation(wx, wy, wz);
        const d = this._getDirection(orientation);
        const dist = PistonManager._EXTEND_DISTANCE;

        // sticky_piston_head の位置確認
        const headX = wx + d.x * dist;
        const headY = wy + d.y * dist;
        const headZ = wz + d.z * dist;
        const headBlock = this._getBlock(headX, headY, headZ);
        if (headBlock !== 'sticky_piston_head') return false;

        // 粘着面のブロック群を検出（BFS）: ヘッドの先（P + 6*D）
        const stickyX = headX + d.x;
        const stickyY = headY + d.y;
        const stickyZ = headZ + d.z;
        const connectedBlocks = this._bfsConnectedBlocks(stickyX, stickyY, stickyZ);

        // 引き戻し先の空きチェック
        for (const block of connectedBlocks) {
            const destX = block.x - d.x * dist;
            const destY = block.y - d.y * dist;
            const destZ = block.z - d.z * dist;
            const destBlock = this._getBlock(destX, destY, destZ);
            // 引き戻し先がピストンの経路上（P+1〜P+5）はヘッド削除後に空くのでOK
            // ただしそれ以外に別のブロックがある場合は失敗
            if (destBlock && destBlock !== 'air'
                && destBlock !== 'piston_base' && destBlock !== 'sticky_piston_head') {
                // 自分自身の移動元でない限り失敗
                const isOwnBlock = connectedBlocks.some(
                    b => b.x === destX && b.y === destY && b.z === destZ
                );
                if (!isOwnBlock) return false;
            }
            if (destY < 0 || destY >= 128) return false;
        }

        // ブロック移動を実行（近い側から順に）
        connectedBlocks.sort((a, b) => {
            const dotA = a.x * d.x + a.y * d.y + a.z * d.z;
            const dotB = b.x * d.x + b.y * d.y + b.z * d.z;
            return dotA - dotB; // 近い方を先に
        });

        // 移動先にコピー
        for (const block of connectedBlocks) {
            const destX = block.x - d.x * dist;
            const destY = block.y - d.y * dist;
            const destZ = block.z - d.z * dist;
            this._setBlock(destX, destY, destZ, block.blockId, block.orientation);
        }

        // 元の位置を air に
        for (const block of connectedBlocks) {
            this._setBlock(block.x, block.y, block.z, 'air', 0);
        }

        // ピストン状態変更
        this._setBlock(headX, headY, headZ, 'air', 0); // ヘッド削除
        this._setBlock(wx, wy, wz, 'sticky_piston', orientation); // ベース → ピストンに戻す

        // チャンクメッシュ再構築
        const positions = [{ x: wx, z: wz }, { x: headX, z: headZ }];
        for (const block of connectedBlocks) {
            positions.push({ x: block.x, z: block.z });
            positions.push({ x: block.x - d.x * dist, z: block.z - d.z * dist });
        }
        this._rebuildAffectedChunks(positions);

        return true;
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.PistonManager = PistonManager;
}
