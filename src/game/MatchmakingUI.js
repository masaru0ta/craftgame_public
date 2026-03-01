/**
 * MatchmakingUI.js
 * マッチング状態表示・参加ボタン（ゲーム内オーバーレイ）
 * ロビー画面は作らず、ゲームプレイ中に画面端で表示される
 */
class MatchmakingUI {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.container - マッチングUIコンテナ
     * @param {Function} options.onJoinWorld - ワールド参加コールバック (peerId) => void
     * @param {Function} options.onRegister - 登録コールバック (name, passphrase) => void
     */
    constructor(options) {
        this._container = options.container;
        this._onJoinWorld = options.onJoinWorld || (() => {});
        this._onRegister = options.onRegister || (() => {});

        this._statusEl = null;
        this._joinBtnEl = null;
        this._currentPeerId = null;

        this._init();
    }

    /**
     * UI要素を初期化
     */
    _init() {
        if (!this._container) return;

        // ステータス表示
        this._statusEl = document.getElementById('matchmaking-status');

        // 参加ボタン
        this._joinBtnEl = document.getElementById('matchmaking-join-btn');
        if (this._joinBtnEl) {
            this._joinBtnEl.addEventListener('click', () => {
                if (this._currentPeerId) {
                    this._onJoinWorld(this._currentPeerId);
                    this.hideJoinButton();
                }
            });
        }

        // デバッグパネル内の登録ボタン
        const registerBtn = document.getElementById('mp-register-btn');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                const nameEl = document.getElementById('mp-name');
                const passphraseEl = document.getElementById('mp-passphrase');
                const name = nameEl ? nameEl.value.trim() : '';
                const passphrase = passphraseEl ? passphraseEl.value.trim() : '';

                if (!name || !passphrase) {
                    alert('名前とあいことばを入力してください');
                    return;
                }

                // localStorageに保存
                localStorage.setItem('mp_name', name);
                localStorage.setItem('mp_passphrase', passphrase);

                this._onRegister(name, passphrase);
            });
        }

        // localStorageから復元
        const savedName = localStorage.getItem('mp_name');
        const savedPassphrase = localStorage.getItem('mp_passphrase');
        if (savedName) {
            const nameEl = document.getElementById('mp-name');
            if (nameEl) nameEl.value = savedName;
        }
        if (savedPassphrase) {
            const passphraseEl = document.getElementById('mp-passphrase');
            if (passphraseEl) passphraseEl.value = savedPassphrase;
        }
    }

    /**
     * ステータステキストを更新
     * @param {string} status - ステータス文字列
     */
    setStatus(status) {
        if (this._statusEl) {
            this._statusEl.textContent = status;
            this._statusEl.style.display = status ? 'block' : 'none';
        }
    }

    /**
     * 「○○のワールドに行く」ボタンを表示
     * @param {string} peerId - ピアID
     * @param {string} peerName - ピア名
     */
    showJoinButton(peerId, peerName) {
        this._currentPeerId = peerId;
        if (this._joinBtnEl) {
            this._joinBtnEl.textContent = `${peerName} のワールドに行く`;
            this._joinBtnEl.style.display = 'block';
        }
    }

    /**
     * 参加ボタンを非表示
     */
    hideJoinButton() {
        this._currentPeerId = null;
        if (this._joinBtnEl) {
            this._joinBtnEl.style.display = 'none';
        }
    }

    /**
     * UI全体を表示
     */
    show() {
        if (this._container) {
            this._container.style.display = 'block';
        }
    }

    /**
     * UI全体を非表示
     */
    hide() {
        if (this._container) {
            this._container.style.display = 'none';
        }
    }

    /**
     * リソースを解放
     */
    dispose() {
        this._currentPeerId = null;
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.MatchmakingUI = MatchmakingUI;
}
