/**
 * MultiplayerSync.js
 * メッセージプロトコル管理、ブロック/チャンク同期
 * ホスト/ゲスト双方で動作し、type分岐でメッセージを処理
 */
class MultiplayerSync {
    static PLAYER_SYNC_INTERVAL = 100; // プレイヤー位置送信間隔（ms）

    /**
     * @param {Object} options
     * @param {MultiplayerManager} options.multiplayerManager - マルチプレイマネージャー
     * @param {BlockInteraction} options.blockInteraction - ブロック操作
     * @param {ChunkManager} options.chunkManager - チャンクマネージャー
     * @param {ChunkStorage} options.chunkStorage - チャンクストレージ
     * @param {PeerPlayerRenderer} options.peerPlayerRenderer - ピアプレイヤーレンダラー
     * @param {Player} options.player - ローカルプレイヤー
     * @param {Object} options.characterData - ローカルキャラクターデータ
     */
    constructor(options) {
        this._manager = options.multiplayerManager;
        this._blockInteraction = options.blockInteraction;
        this._chunkManager = options.chunkManager;
        this._chunkStorage = options.chunkStorage;
        this._peerPlayerRenderer = options.peerPlayerRenderer;
        this._player = options.player;
        this._characterData = options.characterData;

        // リモート変更済みチャンクキーセット（ゲスト用）
        this._remoteModifiedChunks = new Set();

        // 未ロードチャンクへの保留ブロック変更
        this._pendingBlockChanges = new Map(); // Map<chunkKey, Array<{x,y,z,blockId,isDestroy}>>

        // 元のonChunkGeneratedコールバックを保存
        this._originalOnChunkGenerated = null;

        // ブロック操作の元のコールバックを保存
        this._originalOnBlockDestroyed = null;
        this._originalOnBlockPlacedAt = null;
    }

    /**
     * 同期を開始
     * キャラクター交換 → 変更チャンクリスト送信 → 位置定期送信 → ブロック操作フック
     */
    startSync() {
        const peerId = this._manager.getPeerIds()[0];
        if (!peerId) return;

        // ピアプレイヤーを追加
        this._peerPlayerRenderer.addPeer(peerId);

        // キャラクターデータを送信
        if (this._characterData) {
            this._manager.send({
                type: 'characterData',
                data: this._characterData
            });
        }

        // ホストの場合: 変更済みチャンクリストを送信
        if (this._manager.isHost()) {
            this._sendModifiedChunkList();
        }

        // プレイヤー位置の定期送信を開始
        this._manager.startPeriodicSync(() => {
            return this._buildPlayerState();
        }, MultiplayerSync.PLAYER_SYNC_INTERVAL);

        // ブロック操作のフックを設定
        this._hookBlockInteraction();

        // チャンクロードフックを設定（ゲスト用）
        this._hookChunkGenerated();
    }

    /**
     * メッセージ受信ハンドラ
     * @param {string} peerId - 送信元ピアID
     * @param {Object} data - メッセージデータ
     */
    handleMessage(peerId, data) {
        switch (data.type) {
            case 'playerState':
                this._handlePlayerState(peerId, data);
                break;
            case 'blockDestroy':
                this._handleBlockDestroy(peerId, data);
                break;
            case 'blockPlace':
                this._handleBlockPlace(peerId, data);
                break;
            case 'modifiedChunkList':
                this._handleModifiedChunkList(data);
                break;
            case 'chunkRequest':
                this._handleChunkRequest(peerId, data);
                break;
            case 'chunkResponse':
                this._handleChunkResponse(data);
                break;
            case 'characterData':
                this._handleCharacterData(peerId, data);
                break;
            default:
                console.warn('[MultiplayerSync] 不明なメッセージタイプ:', data.type);
        }
    }

    // --- メッセージ送信 ---

    /**
     * プレイヤー状態メッセージを構築
     * @returns {Object}
     */
    _buildPlayerState() {
        const pos = this._player.getPosition();
        const vel = this._player.getVelocity();
        return {
            type: 'playerState',
            x: pos.x,
            y: pos.y,
            z: pos.z,
            yaw: this._player.getYaw(),
            pitch: this._player.getPitch(),
            vx: vel.x,
            vy: vel.y,
            vz: vel.z,
            sneaking: this._player.isSneaking(),
            flying: this._player.isFlying()
        };
    }

    /**
     * ホストが変更済みチャンクのキーリストを送信
     */
    async _sendModifiedChunkList() {
        // メモリキャッシュからキーリストを取得
        const keys = Array.from(this._chunkManager.modifiedChunkCache.keys());

        // IndexedDBからも取得して統合
        try {
            const storedChunks = await this._chunkStorage.loadAll(this._chunkManager.worldName);
            for (const key of storedChunks.keys()) {
                if (!keys.includes(key)) {
                    keys.push(key);
                }
            }
        } catch (e) {
            console.warn('[MultiplayerSync] IndexedDBからのキーリスト取得失敗:', e);
        }

        this._manager.send({
            type: 'modifiedChunkList',
            keys: keys
        });
    }

    /**
     * ブロック破壊を送信
     * @param {number} x - ワールドX座標
     * @param {number} y - ワールドY座標
     * @param {number} z - ワールドZ座標
     * @param {string} blockId - 破壊されたブロックID
     */
    _sendBlockDestroy(x, y, z, blockId) {
        const msg = {
            type: 'blockDestroy',
            x: x, y: y, z: z,
            blockId: blockId,
            senderId: this._manager.getLocalId()
        };

        this._manager.send(msg);
    }

    /**
     * ブロック設置を送信
     * @param {number} x - ワールドX座標
     * @param {number} y - ワールドY座標
     * @param {number} z - ワールドZ座標
     * @param {string} blockId - 設置されたブロックID
     */
    _sendBlockPlace(x, y, z, blockId) {
        const msg = {
            type: 'blockPlace',
            x: x, y: y, z: z,
            blockId: blockId,
            senderId: this._manager.getLocalId()
        };

        this._manager.send(msg);
    }

    // --- メッセージ受信ハンドラ ---

    /**
     * プレイヤー位置を受信
     */
    _handlePlayerState(peerId, data) {
        this._peerPlayerRenderer.updatePeerState(peerId, data);
    }

    /**
     * ブロック破壊を受信
     */
    _handleBlockDestroy(peerId, data) {
        const { x, y, z, blockId, senderId } = data;

        // チャンクがロード済みか確認
        const chunkX = Math.floor(x / 16);
        const chunkZ = Math.floor(z / 16);
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = this._chunkManager.chunks.get(chunkKey);

        if (chunk && chunk.chunkData) {
            // チャンクロード済み → 即時適用
            this._applyBlockDestroy(x, y, z, chunk, chunkX, chunkZ);
        } else {
            // 未ロード → pending に保留
            this._addPendingChange(chunkKey, { x, y, z, blockId: 'air', isDestroy: true });
        }

        // ホストの場合: 他のゲストにブロードキャスト
        if (this._manager.isHost()) {
            this._manager.broadcast(data, senderId);
        }
    }

    /**
     * ブロック設置を受信
     */
    _handleBlockPlace(peerId, data) {
        const { x, y, z, blockId, senderId } = data;

        // チャンクがロード済みか確認
        const chunkX = Math.floor(x / 16);
        const chunkZ = Math.floor(z / 16);
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = this._chunkManager.chunks.get(chunkKey);

        if (chunk && chunk.chunkData) {
            // チャンクロード済み → 即時適用
            this._applyBlockPlace(x, y, z, blockId, chunk, chunkX, chunkZ);
        } else {
            // 未ロード → pending に保留
            this._addPendingChange(chunkKey, { x, y, z, blockId, isDestroy: false });
        }

        // ホストの場合: 他のゲストにブロードキャスト
        if (this._manager.isHost()) {
            this._manager.broadcast(data, senderId);
        }
    }

    /**
     * 変更済みチャンクリストを受信（ゲスト側）
     */
    _handleModifiedChunkList(data) {
        this._remoteModifiedChunks = new Set(data.keys || []);
        console.log(`[MultiplayerSync] 変更済みチャンクリスト受信: ${this._remoteModifiedChunks.size}件`);
    }

    /**
     * チャンクリクエストを受信（ホスト側）
     */
    async _handleChunkRequest(peerId, data) {
        const { chunkX, chunkZ } = data;
        const chunkKey = `${chunkX},${chunkZ}`;

        // メモリキャッシュから取得を試みる
        let serialized = this._chunkManager.modifiedChunkCache.get(chunkKey);

        // メモリになければIndexedDBから取得
        if (!serialized) {
            try {
                const chunkData = await this._chunkStorage.load(
                    this._chunkManager.worldName, chunkX, chunkZ
                );
                if (chunkData) {
                    serialized = chunkData.getSerializedData();
                }
            } catch (e) {
                console.warn('[MultiplayerSync] チャンクデータ取得失敗:', chunkKey, e);
            }
        }

        if (serialized) {
            this._manager.sendTo(peerId, {
                type: 'chunkResponse',
                chunkX: chunkX,
                chunkZ: chunkZ,
                palette: serialized.palette,
                bitsPerBlock: serialized.bitsPerBlock,
                data: Array.from(serialized.data), // Uint8Arrayを配列に変換（JSON送信用）
                baseY: serialized.baseY
            });
        }
    }

    /**
     * チャンクレスポンスを受信（ゲスト側）
     */
    _handleChunkResponse(data) {
        const { chunkX, chunkZ, palette, bitsPerBlock, data: blockData, baseY } = data;
        const chunkKey = `${chunkX},${chunkZ}`;

        const chunk = this._chunkManager.chunks.get(chunkKey);
        if (!chunk) return;

        // シリアライズデータからChunkDataを復元
        const serialized = {
            palette: palette,
            bitsPerBlock: bitsPerBlock,
            data: new Uint8Array(blockData),
            baseY: baseY
        };
        const newChunkData = ChunkData.fromSerializedData(chunkX, chunkZ, serialized);

        // チャンクデータを置換
        chunk.chunkData = newChunkData;

        // ライトマップ再計算
        if (this._chunkManager.lightCalculator) {
            const neighborChunks = this._chunkManager._getNeighborChunks(chunkX, chunkZ);
            this._chunkManager.lightCalculator.calculate(newChunkData, neighborChunks);
        }

        // メッシュ再構築
        this._chunkManager.rebuildChunkMesh(chunkX, chunkZ);

        // pendingのブロック変更を適用
        this._applyPendingChanges(chunkKey);

        console.log(`[MultiplayerSync] チャンクデータ受信・適用: ${chunkKey}`);
    }

    /**
     * キャラクターデータを受信
     * WebRTC経由のJSONからCharacterDataインスタンスに復元
     */
    _handleCharacterData(peerId, data) {
        const charData = CharacterData.fromJSON(data.data);
        this._peerPlayerRenderer.setCharacterData(peerId, charData);
    }

    // --- ブロック操作の即時適用 ---

    /**
     * ブロック破壊を適用
     */
    _applyBlockDestroy(x, y, z, chunk, chunkX, chunkZ) {
        const localX = ((x % 16) + 16) % 16;
        const localZ = ((z % 16) + 16) % 16;
        const localY = y - chunk.chunkData.baseY;
        if (localY < 0) return;

        chunk.chunkData.setBlock(localX, localY, localZ, 'air');

        // ライトマップ更新
        let affectedNeighbors = new Set();
        if (this._chunkManager.lightCalculator) {
            const neighborChunks = this._chunkManager._getNeighborChunks(chunkX, chunkZ);
            affectedNeighbors = this._chunkManager.lightCalculator.onBlockRemoved(
                chunk.chunkData, localX, localY, localZ, neighborChunks
            ) || new Set();
        }

        // メッシュ再構築
        this._chunkManager.rebuildChunkMesh(chunkX, chunkZ);
        for (const key of affectedNeighbors) {
            const [nx, nz] = key.split(',').map(Number);
            this._chunkManager.rebuildChunkMesh(nx, nz);
        }
    }

    /**
     * ブロック設置を適用
     */
    _applyBlockPlace(x, y, z, blockId, chunk, chunkX, chunkZ) {
        const localX = ((x % 16) + 16) % 16;
        const localZ = ((z % 16) + 16) % 16;
        const localY = y - chunk.chunkData.baseY;
        if (localY < 0 || localY >= 128) return;

        chunk.chunkData.setBlock(localX, localY, localZ, blockId);

        // ライトマップ更新
        let affectedNeighbors = new Set();
        if (this._chunkManager.lightCalculator) {
            const neighborChunks = this._chunkManager._getNeighborChunks(chunkX, chunkZ);
            affectedNeighbors = this._chunkManager.lightCalculator.onBlockPlaced(
                chunk.chunkData, localX, localY, localZ, neighborChunks
            ) || new Set();
        }

        // メッシュ再構築
        this._chunkManager.rebuildChunkMesh(chunkX, chunkZ);
        for (const key of affectedNeighbors) {
            const [nx, nz] = key.split(',').map(Number);
            this._chunkManager.rebuildChunkMesh(nx, nz);
        }
    }

    // --- Pending変更管理 ---

    /**
     * 保留ブロック変更を追加
     */
    _addPendingChange(chunkKey, change) {
        if (!this._pendingBlockChanges.has(chunkKey)) {
            this._pendingBlockChanges.set(chunkKey, []);
        }
        this._pendingBlockChanges.get(chunkKey).push(change);
    }

    /**
     * 保留ブロック変更を適用
     */
    _applyPendingChanges(chunkKey) {
        const changes = this._pendingBlockChanges.get(chunkKey);
        if (!changes || changes.length === 0) return;

        const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
        const chunk = this._chunkManager.chunks.get(chunkKey);
        if (!chunk || !chunk.chunkData) return;

        for (const change of changes) {
            if (change.isDestroy) {
                this._applyBlockDestroy(change.x, change.y, change.z, chunk, chunkX, chunkZ);
            } else {
                this._applyBlockPlace(change.x, change.y, change.z, change.blockId, chunk, chunkX, chunkZ);
            }
        }

        this._pendingBlockChanges.delete(chunkKey);
    }

    // --- フック設定 ---

    /**
     * BlockInteractionにフックを設定して、ローカル操作を送信
     */
    _hookBlockInteraction() {
        // 破壊コールバック: 既存のコールバックを保存してラップ
        this._originalOnBlockDestroyed = this._blockInteraction._onBlockDestroyed;
        this._blockInteraction.onBlockDestroyed((blockId, x, y, z) => {
            // 元のコールバックを呼ぶ
            if (this._originalOnBlockDestroyed) {
                this._originalOnBlockDestroyed(blockId, x, y, z);
            }
            // マルチプレイ送信
            if (this._manager.isConnected()) {
                this._sendBlockDestroy(x, y, z, blockId);
            }
        });

        // 設置コールバック（座標付き）
        this._originalOnBlockPlacedAt = this._blockInteraction._onBlockPlacedAt;
        this._blockInteraction.onBlockPlacedAt((x, y, z, blockId) => {
            // 元のコールバックを呼ぶ
            if (this._originalOnBlockPlacedAt) {
                this._originalOnBlockPlacedAt(x, y, z, blockId);
            }
            // マルチプレイ送信
            if (this._manager.isConnected()) {
                this._sendBlockPlace(x, y, z, blockId);
            }
        });
    }

    /**
     * ChunkManagerのonChunkGeneratedにフックを設定
     * ゲスト側: 変更済みチャンクのデータをホストにリクエスト
     */
    _hookChunkGenerated() {
        this._originalOnChunkGenerated = this._chunkManager.onChunkGenerated;

        this._chunkManager.onChunkGenerated = (chunkX, chunkZ, chunkData, isFromStorage) => {
            // 元のコールバックを呼ぶ
            if (this._originalOnChunkGenerated) {
                this._originalOnChunkGenerated(chunkX, chunkZ, chunkData, isFromStorage);
            }

            // ゲスト側: 変更リストに含まれるチャンクはホストにリクエスト
            if (!this._manager.isHost() && this._manager.isConnected()) {
                const chunkKey = `${chunkX},${chunkZ}`;
                if (this._remoteModifiedChunks.has(chunkKey)) {
                    this._manager.send({
                        type: 'chunkRequest',
                        chunkX: chunkX,
                        chunkZ: chunkZ
                    });
                }
            }

            // pendingのブロック変更を適用
            const chunkKey = `${chunkX},${chunkZ}`;
            this._applyPendingChanges(chunkKey);
        };
    }

    /**
     * リソースを解放
     */
    dispose() {
        // 定期送信停止
        this._manager.stopPeriodicSync();

        // フックを元に戻す
        if (this._blockInteraction) {
            this._blockInteraction._onBlockDestroyed = this._originalOnBlockDestroyed;
            this._blockInteraction._onBlockPlacedAt = this._originalOnBlockPlacedAt;
        }
        if (this._chunkManager) {
            this._chunkManager.onChunkGenerated = this._originalOnChunkGenerated;
        }

        this._remoteModifiedChunks.clear();
        this._pendingBlockChanges.clear();
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.MultiplayerSync = MultiplayerSync;
}
