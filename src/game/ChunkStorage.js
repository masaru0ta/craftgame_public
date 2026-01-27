/**
 * ChunkStorage - IndexedDB を使用したチャンクストレージクラス
 * ChunkData のパレット形式をそのまま保存/読込
 */
class ChunkStorage {
    constructor() {
        this.dbName = 'craftgame5';
        this.storeName = 'chunks';
        this.dbVersion = 1;
        this.db = null;
    }

    /**
     * データベースを開く
     */
    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    /**
     * ストレージキーを生成
     */
    _getKey(worldName, chunkX, chunkZ) {
        return `${worldName}_chunk_${chunkX}_${chunkZ}`;
    }

    /**
     * パレットサイズからビット数を計算（テスト互換用）
     */
    calculateBitsPerBlock(paletteSize) {
        if (paletteSize <= 2) return 1;
        if (paletteSize <= 4) return 2;
        if (paletteSize <= 16) return 4;
        return 8;
    }

    /**
     * ChunkData をシリアライズ
     * ChunkData が既にパレット形式なので、そのまま取得
     */
    serialize(chunkData) {
        return chunkData.getSerializedData();
    }

    /**
     * シリアライズされたデータから ChunkData を復元
     */
    deserialize(serialized, chunkX, chunkZ) {
        return ChunkData.fromSerializedData(chunkX, chunkZ, serialized);
    }

    /**
     * チャンクを保存
     */
    async save(worldName, chunkX, chunkZ, chunkData) {
        await this.open();

        const key = this._getKey(worldName, chunkX, chunkZ);
        const serialized = this.serialize(chunkData);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(serialized, key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * 複数チャンクをバッチ保存（1つのトランザクションで処理）
     * @param {Array<{worldName, chunkX, chunkZ, chunkData}>} chunks
     */
    async saveBatch(chunks) {
        if (chunks.length === 0) return;

        await this.open();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            // トランザクション完了時に resolve
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);

            // 全チャンクを1つのトランザクションで保存
            for (const chunk of chunks) {
                const key = this._getKey(chunk.worldName, chunk.chunkX, chunk.chunkZ);
                const serialized = this.serialize(chunk.chunkData);
                store.put(serialized, key);
            }
        });
    }

    /**
     * チャンクを読み込む
     */
    async load(worldName, chunkX, chunkZ) {
        await this.open();

        const key = this._getKey(worldName, chunkX, chunkZ);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    resolve(this.deserialize(result, chunkX, chunkZ));
                } else {
                    resolve(null);
                }
            };
        });
    }

    /**
     * チャンクが存在するか確認
     */
    async exists(worldName, chunkX, chunkZ) {
        await this.open();

        const key = this._getKey(worldName, chunkX, chunkZ);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getKey(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                resolve(request.result !== undefined);
            };
        });
    }

    /**
     * 指定ワールドの全チャンクを削除
     */
    async clear(worldName) {
        await this.open();

        const prefix = `${worldName}_chunk_`;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const request = store.openCursor();
            const keysToDelete = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.key.startsWith(prefix)) {
                        keysToDelete.push(cursor.key);
                    }
                    cursor.continue();
                } else {
                    // 全てのキーを取得したので削除
                    let deleted = 0;
                    if (keysToDelete.length === 0) {
                        resolve();
                        return;
                    }

                    keysToDelete.forEach(key => {
                        const deleteRequest = store.delete(key);
                        deleteRequest.onsuccess = () => {
                            deleted++;
                            if (deleted === keysToDelete.length) {
                                resolve();
                            }
                        };
                        deleteRequest.onerror = () => reject(deleteRequest.error);
                    });
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 保存済みチャンク数を取得
     */
    async getStoredChunkCount(worldName) {
        await this.open();

        const prefix = `${worldName}_chunk_`;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);

            const request = store.openCursor();
            let count = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.key.startsWith(prefix)) {
                        count++;
                    }
                    cursor.continue();
                } else {
                    resolve(count);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.ChunkStorage = ChunkStorage;
}
