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
        this._onBlockDestroyed = null;
        this._onBlockPlaced = null;
        this._onBlockPlacedAt = null;
        this._onWorkbenchInteract = null;
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
     * スクリーン座標からレイキャストを実行
     * @param {number} screenX - スクリーンX座標（clientX）
     * @param {number} screenY - スクリーンY座標（clientY）
     * @param {THREE.Camera} camera - Three.jsカメラ
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @returns {Object|null} レイキャスト結果
     */
    raycastFromScreen(screenX, screenY, camera, canvas) {
        const rect = canvas.getBoundingClientRect();
        // スクリーン座標をNDC（-1〜+1）に変換
        const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

        // NDCからワールド座標への逆投影でレイ方向を算出
        const near = new THREE.Vector3(ndcX, ndcY, 0.5);
        near.unproject(camera);
        const rayDir = new THREE.Vector3().subVectors(near, camera.position).normalize();

        // Three.js座標系 → ゲーム座標系（Z反転）
        const origin = { x: camera.position.x, y: camera.position.y, z: -camera.position.z };
        const direction = { x: rayDir.x, y: rayDir.y, z: -rayDir.z };

        return this.physicsWorld.raycast(origin, direction, BlockInteraction.MAX_REACH);
    }

    /**
     * 指定ターゲットのブロックを破壊
     * @param {Object} target - レイキャスト結果
     * @returns {boolean}
     */
    destroyBlockAt(target) {
        if (!target || !target.hit) return false;
        return this.destroyBlock(target.blockX, target.blockY, target.blockZ);
    }

    /**
     * 指定ターゲットの隣接位置にブロックを設置
     * @param {Object} target - レイキャスト結果
     * @returns {boolean}
     */
    placeBlockAt(target) {
        if (!target || !target.hit) return false;

        // 作業台チェック
        const targetBlockId = this.physicsWorld.getBlockAt(target.blockX, target.blockY, target.blockZ);
        if (targetBlockId === 'workbench') {
            if (this._onWorkbenchInteract) this._onWorkbenchInteract();
            return true;
        }

        const selectedBlock = this.hotbar.getSelectedBlock();
        if (!selectedBlock) return false;

        const placed = this.placeBlock(target.adjacentX, target.adjacentY, target.adjacentZ, selectedBlock.block_str_id);
        if (placed && this._onBlockPlaced) {
            this._onBlockPlaced(selectedBlock.block_str_id);
        }
        return placed;
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
            // 右クリック - 作業台チェック
            const targetBlockId = this.physicsWorld.getBlockAt(
                this.currentTarget.blockX,
                this.currentTarget.blockY,
                this.currentTarget.blockZ
            );
            if (targetBlockId === 'workbench') {
                if (this._onWorkbenchInteract) {
                    this._onWorkbenchInteract();
                }
                return true;
            }

            // 右クリック - 設置
            const selectedBlock = this.hotbar.getSelectedBlock();
            if (!selectedBlock) return false;

            const placed = this.placeBlock(
                this.currentTarget.adjacentX,
                this.currentTarget.adjacentY,
                this.currentTarget.adjacentZ,
                selectedBlock.block_str_id
            );
            if (placed && this._onBlockPlaced) {
                this._onBlockPlaced(selectedBlock.block_str_id);
            }
            return placed;
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

        // ワールドY → ローカルY変換
        const localY = y - chunk.chunkData.baseY;

        // ローカルY範囲外チェック
        if (localY < 0) {
            return false;
        }

        // ブロックをairに置換
        chunk.chunkData.setBlock(localX, localY, localZ, 'air');

        // 破壊コールバック発火（座標も渡す）
        if (this._onBlockDestroyed) {
            this._onBlockDestroyed(currentBlock, x, y, z);
        }

        // ライトマップ更新（クロスチャンク対応）
        let affectedNeighbors = new Set();
        if (this.chunkManager.lightCalculator) {
            const neighborChunks = this.chunkManager._getNeighborChunks(chunkX, chunkZ);
            affectedNeighbors = this.chunkManager.lightCalculator.onBlockRemoved(
                chunk.chunkData, localX, localY, localZ, neighborChunks
            ) || new Set();
        }

        // メッシュを再構築
        this.chunkManager.rebuildChunkMesh(chunkX, chunkZ);

        // 影響のあった隣接チャンクのメッシュも再構築
        for (const key of affectedNeighbors) {
            const [nx, nz] = key.split(',').map(Number);
            this.chunkManager.rebuildChunkMesh(nx, nz);
        }

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

        // ワールドY → ローカルY変換
        const localY = y - chunk.chunkData.baseY;

        // ローカルY範囲チェック
        if (localY < 0 || localY >= 128) {
            return false;
        }

        // ブロックを設置
        chunk.chunkData.setBlock(localX, localY, localZ, blockStrId);

        // 設置コールバック発火（座標付き）
        if (this._onBlockPlacedAt) {
            this._onBlockPlacedAt(x, y, z, blockStrId);
        }

        // ライトマップ更新（クロスチャンク対応）
        let affectedNeighbors = new Set();
        if (this.chunkManager.lightCalculator) {
            const neighborChunks = this.chunkManager._getNeighborChunks(chunkX, chunkZ);
            affectedNeighbors = this.chunkManager.lightCalculator.onBlockPlaced(
                chunk.chunkData, localX, localY, localZ, neighborChunks
            ) || new Set();
        }

        // メッシュを再構築
        this.chunkManager.rebuildChunkMesh(chunkX, chunkZ);

        // 影響のあった隣接チャンクのメッシュも再構築
        for (const key of affectedNeighbors) {
            const [nx, nz] = key.split(',').map(Number);
            this.chunkManager.rebuildChunkMesh(nx, nz);
        }

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
        // メモリキャッシュに即座に保存（同期リロード用）
        const key = `${chunkX},${chunkZ}`;
        this.chunkManager.modifiedChunkCache.set(key, chunkData.getSerializedData());

        // IndexedDBにも非同期で保存（ページリロード用）
        try {
            const worldName = this.chunkManager.worldName;
            await this.chunkStorage.save(worldName, chunkX, chunkZ, chunkData);
        } catch (error) {
            console.error('Failed to save chunk:', error);
        }
    }

    /**
     * ブロック破壊時コールバックを設定
     * @param {Function} callback - (blockStrId: string, x: number, y: number, z: number) => void
     */
    onBlockDestroyed(callback) {
        this._onBlockDestroyed = callback;
    }

    /**
     * ブロック設置時コールバックを設定
     * @param {Function} callback - (blockStrId: string) => void
     */
    onBlockPlaced(callback) {
        this._onBlockPlaced = callback;
    }

    /**
     * ブロック設置時コールバックを設定（座標付き）
     * @param {Function} callback - (x: number, y: number, z: number, blockStrId: string) => void
     */
    onBlockPlacedAt(callback) {
        this._onBlockPlacedAt = callback;
    }

    /**
     * 作業台右クリック時コールバックを設定
     * @param {Function} callback - () => void
     */
    onWorkbenchInteract(callback) {
        this._onWorkbenchInteract = callback;
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
