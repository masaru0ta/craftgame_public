/**
 * MultiplayerManager.js
 * WebRTC接続管理、メッセージルーティング
 * WebRTCGAS.Clientのラッパー。複数ピア対応（内部はMap管理）
 */
class MultiplayerManager {
    static GAS_API_URL = 'https://script.google.com/macros/s/AKfycbz9RbzxrYV8QbsclJcwNYhO4JoE9qQZlD-aWX5Z5U9jICPBEiBbEznf3scgQx8GONZa1A/exec';

    /**
     * @param {Object} options
     * @param {Function} options.onMessage - メッセージ受信コールバック (peerId, data) => void
     * @param {Function} options.onConnected - 接続確立コールバック (peerId, peerName) => void
     * @param {Function} options.onDisconnected - 切断コールバック (peerId, reason) => void
     * @param {Function} options.onMatchFound - マッチング成立コールバック (matchList) => void
     * @param {Function} options.onRegistered - 登録完了コールバック (id) => void
     * @param {Function} options.onError - エラーコールバック (error) => void
     * @param {Function} options.onStatusChange - ステータス変更コールバック (status) => void
     */
    constructor(options = {}) {
        this._onMessage = options.onMessage || (() => {});
        this._onConnected = options.onConnected || (() => {});
        this._onDisconnected = options.onDisconnected || (() => {});
        this._onMatchFound = options.onMatchFound || (() => {});
        this._onRegistered = options.onRegistered || (() => {});
        this._onError = options.onError || (() => {});
        this._onStatusChange = options.onStatusChange || (() => {});

        // ピア管理（将来4人対応のためMap）
        this._peers = new Map(); // Map<peerId, {client, name}>

        // メインクライアント（登録・マッチング用）
        this._client = null;
        this._localId = null;
        this._localName = null;
        this._isHost = false;
        this._connected = false;

        // 定期送信用タイマー
        this._periodicSyncTimer = null;
    }

    /**
     * GASに登録してマッチング開始
     * @param {string} name - プレイヤー名
     * @param {string} passphrase - あいことば
     */
    async register(name, passphrase) {
        this._localName = name;

        // 既存のクライアントがあれば破棄
        if (this._client) {
            this._client.disconnect();
        }

        // localStorageから前回のIDを復元
        const savedId = localStorage.getItem('mp_client_id') || null;

        this._client = new WebRTCGAS.Client({
            apiUrl: MultiplayerManager.GAS_API_URL,
            name: name,
            id: savedId,
            passphrase: passphrase,
            pollingInterval: 2000
        });

        // イベントハンドラ登録
        this._client.on('registered', (data) => {
            this._localId = data.id;
            localStorage.setItem('mp_client_id', data.id);
            this._onRegistered(data.id);
            this._onStatusChange('waiting');
        });

        this._client.on('matchFound', (data) => {
            this._onMatchFound(data.matchList);
        });

        this._client.on('connected', (data) => {
            this._connected = true;
            const peerId = data.peerId;
            const peerName = data.peerName;

            // ホスト判定: connect()を呼んだ側（_isOfferer）がゲスト
            // → connect()を呼ばれた側がホスト
            this._isHost = !this._client._isOfferer;

            this._peers.set(peerId, { client: this._client, name: peerName });
            this._onConnected(peerId, peerName);
            this._onStatusChange('connected');
        });

        this._client.on('disconnected', (data) => {
            this._connected = false;
            const peerId = this._client.peerId;
            this._peers.delete(peerId);
            this._onDisconnected(peerId, data.reason);
            this._onStatusChange('disconnected');
        });

        this._client.on('message', (data) => {
            const peerId = this._client.peerId;
            this._onMessage(peerId, data.data);
        });

        this._client.on('error', (data) => {
            this._onError(data.error);
        });

        // 登録実行
        this._onStatusChange('registering');
        await this._client.register();
    }

    /**
     * 特定ピアに接続（ゲストが呼ぶ）
     * @param {string} peerId - 接続先のID
     */
    async connectToPeer(peerId) {
        if (!this._client) {
            throw new Error('未登録です。先にregister()を呼んでください');
        }
        this._onStatusChange('connecting');
        await this._client.connect(peerId);
    }

    /**
     * 切断
     */
    disconnect() {
        this.stopPeriodicSync();

        if (this._client) {
            this._client.disconnect();
        }

        this._peers.clear();
        this._connected = false;
        this._isHost = false;
        this._onStatusChange('disconnected');
    }

    /**
     * 全ピアにデータ送信
     * @param {Object} data - 送信データ
     */
    send(data) {
        if (!this._client || !this._connected) return;
        try {
            this._client.send(data);
        } catch (e) {
            console.warn('[MultiplayerManager] send error:', e);
        }
    }

    /**
     * 特定ピアにデータ送信
     * @param {string} peerId - 送信先ピアID
     * @param {Object} data - 送信データ
     */
    sendTo(peerId, data) {
        // 現在は2人P2Pなので全ピアに送信と同じ
        this.send(data);
    }

    /**
     * 特定ピア以外に送信（ブロック操作のリレー用）
     * @param {Object} data - 送信データ
     * @param {string} excludeId - 除外するピアID
     */
    broadcast(data, excludeId) {
        // 現在は2人P2Pなので、excludeIdが唯一のピアなら送信不要
        for (const [peerId] of this._peers) {
            if (peerId !== excludeId) {
                this.sendTo(peerId, data);
            }
        }
    }

    /**
     * プレイヤー位置の定期送信を開始
     * @param {Function} callback - 送信データ生成コールバック () => Object
     * @param {number} intervalMs - 送信間隔（ミリ秒）
     */
    startPeriodicSync(callback, intervalMs = 100) {
        this.stopPeriodicSync();
        this._periodicSyncTimer = setInterval(() => {
            if (this._connected) {
                const data = callback();
                if (data) this.send(data);
            }
        }, intervalMs);
    }

    /**
     * 定期送信を停止
     */
    stopPeriodicSync() {
        if (this._periodicSyncTimer) {
            clearInterval(this._periodicSyncTimer);
            this._periodicSyncTimer = null;
        }
    }

    /**
     * ホストかどうか
     * @returns {boolean}
     */
    isHost() {
        return this._isHost;
    }

    /**
     * 接続中かどうか
     * @returns {boolean}
     */
    isConnected() {
        return this._connected;
    }

    /**
     * 自分のIDを取得
     * @returns {string|null}
     */
    getLocalId() {
        return this._localId;
    }

    /**
     * 自分の名前を取得
     * @returns {string|null}
     */
    getLocalName() {
        return this._localName;
    }

    /**
     * 接続中のピアIDリストを取得
     * @returns {string[]}
     */
    getPeerIds() {
        return Array.from(this._peers.keys());
    }

    /**
     * マッチングリストを取得
     * @returns {Array}
     */
    getMatchList() {
        return this._client ? this._client.matchList : [];
    }

    /**
     * リソースを解放
     */
    dispose() {
        this.disconnect();
        this._client = null;
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.MultiplayerManager = MultiplayerManager;
}
