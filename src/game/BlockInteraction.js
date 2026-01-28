/**
 * BlockInteraction.js
 * ブロック操作統合クラス - レイキャスト、ハイライト、破壊・設置を管理
 */
class BlockInteraction {
    static MAX_REACH = 10;  // 最大到達距離（ブロック）

    /**
     * コンストラクタ
     * @param {Player} player - プレイヤー
     * @param {PhysicsWorld} physicsWorld - 物理演算
     * @param {ChunkManager} chunkManager - チャンクマネージャー
     * @param {ChunkStorage} chunkStorage - チャンクストレージ
     * @param {THREE.Scene} scene - Three.jsシーン
     */
    constructor(player, physicsWorld, chunkManager, chunkStorage, scene) {
        this.player = player;
        this.physicsWorld = physicsWorld;
        this.chunkManager = chunkManager;
        this.chunkStorage = chunkStorage;
        this.scene = scene;

        this.highlight = null;
        this.hotbar = null;
        this.currentTarget = null;
    }

    /**
     * 初期化
     * @param {Array} blocks - ブロック定義の配列
     * @param {HTMLElement} hotbarContainer - ホットバーのコンテナ要素
     */
    init(blocks, hotbarContainer) {
        // ホットバー初期化
        this.hotbar = new Hotbar(hotbarContainer, blocks);

        // ハイライト初期化
        this.highlight = new BlockHighlight(this.scene);
    }

    /**
     * 毎フレーム更新
     */
    update() {
        // レイキャスト実行
        const origin = this.player.getEyePosition();
        const direction = this.player.getLookDirection();
        this.currentTarget = this.physicsWorld.raycast(origin, direction, BlockInteraction.MAX_REACH);

        // ハイライト更新
        this.highlight.update(this.currentTarget);
    }

    /**
     * 現在のターゲットブロック情報を取得
     * @returns {Object|null}
     */
    getTargetBlock() {
        return this.currentTarget;
    }

    /**
     * マウスダウンイベント処理
     * @param {MouseEvent} event
     * @returns {boolean} 処理が実行されたか
     */
    handleMouseDown(event) {
        event.preventDefault();

        if (!this.currentTarget) {
            return false;
        }

        if (event.button === 0) {
            // 左クリック - 破壊
            return this.destroyBlock(
                this.currentTarget.blockX,
                this.currentTarget.blockY,
                this.currentTarget.blockZ
            );
        } else if (event.button === 2) {
            // 右クリック - 設置
            const selectedBlock = this.hotbar.getSelectedBlock();
            if (!selectedBlock) return false;

            return this.placeBlock(
                this.currentTarget.adjacentX,
                this.currentTarget.adjacentY,
                this.currentTarget.adjacentZ,
                selectedBlock.block_str_id
            );
        }

        return false;
    }

    /**
     * マウスホイールイベント処理
     * @param {WheelEvent} event
     */
    handleWheel(event) {
        this.hotbar.handleWheel(event);
    }

    /**
     * ブロックを破壊
     * @param {number} x - ワールドX座標
     * @param {number} y - ワールドY座標
     * @param {number} z - ワールドZ座標
     * @returns {boolean} 成功したか
     */
    destroyBlock(x, y, z) {
        // Y=0は破壊不可
        if (y <= 0) {
            return false;
        }

        // 現在のブロックを取得
        const currentBlock = this.physicsWorld.getBlockAt(x, y, z);
        if (!currentBlock || currentBlock === 'air') {
            return false;
        }

        // チャンク座標を計算
        const chunkX = Math.floor(x / 16);
        const chunkZ = Math.floor(z / 16);
        const localX = ((x % 16) + 16) % 16;
        const localZ = ((z % 16) + 16) % 16;

        // チャンクデータを取得
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = this.chunkManager.chunks.get(chunkKey);
        if (!chunk || !chunk.chunkData) {
            return false;
        }

        // ブロックをairに置換
        chunk.chunkData.setBlock(localX, y, localZ, 'air');

        // メッシュを再構築
        this.chunkManager.rebuildChunkMesh(chunkX, chunkZ);

        // IndexedDBに保存（非同期）
        this._saveChunk(chunkX, chunkZ, chunk.chunkData);

        return true;
    }

    /**
     * ブロックを設置
     * @param {number} x - ワールドX座標
     * @param {number} y - ワールドY座標
     * @param {number} z - ワールドZ座標
     * @param {string} blockStrId - 設置するブロックID
     * @returns {boolean} 成功したか
     */
    placeBlock(x, y, z, blockStrId) {
        // Y範囲チェック
        if (y < 0 || y >= 128) {
            return false;
        }

        // 現在のブロックをチェック（airでなければ設置不可）
        const currentBlock = this.physicsWorld.getBlockAt(x, y, z);
        if (currentBlock && currentBlock !== 'air') {
            return false;
        }

        // プレイヤーとの重複チェック
        if (this._intersectsPlayer(x, y, z)) {
            return false;
        }

        // チャンク座標を計算
        const chunkX = Math.floor(x / 16);
        const chunkZ = Math.floor(z / 16);
        const localX = ((x % 16) + 16) % 16;
        const localZ = ((z % 16) + 16) % 16;

        // チャンクデータを取得
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = this.chunkManager.chunks.get(chunkKey);
        if (!chunk || !chunk.chunkData) {
            return false;
        }

        // ブロックを設置
        chunk.chunkData.setBlock(localX, y, localZ, blockStrId);

        // メッシュを再構築
        this.chunkManager.rebuildChunkMesh(chunkX, chunkZ);

        // IndexedDBに保存（非同期）
        this._saveChunk(chunkX, chunkZ, chunk.chunkData);

        return true;
    }

    /**
     * プレイヤーとの重複をチェック
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    _intersectsPlayer(x, y, z) {
        const blockAABB = {
            minX: x,
            minY: y,
            minZ: z,
            maxX: x + 1,
            maxY: y + 1,
            maxZ: z + 1
        };

        const playerAABB = this.player.getAABB();

        return blockAABB.minX < playerAABB.maxX && blockAABB.maxX > playerAABB.minX &&
               blockAABB.minY < playerAABB.maxY && blockAABB.maxY > playerAABB.minY &&
               blockAABB.minZ < playerAABB.maxZ && blockAABB.maxZ > playerAABB.minZ;
    }

    /**
     * チャンクを保存（非同期）
     * @param {number} chunkX
     * @param {number} chunkZ
     * @param {ChunkData} chunkData
     */
    async _saveChunk(chunkX, chunkZ, chunkData) {
        try {
            await this.chunkStorage.saveChunk(chunkX, chunkZ, chunkData);
        } catch (error) {
            console.error('Failed to save chunk:', error);
        }
    }

    /**
     * リソースを解放
     */
    dispose() {
        if (this.highlight) {
            this.highlight.dispose();
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.BlockInteraction = BlockInteraction;
}
