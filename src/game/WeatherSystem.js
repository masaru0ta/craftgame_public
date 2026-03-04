/**
 * 天候システム（仕様書 2-20）
 * 晴れ↔雨のランダム遷移・コールバック通知。
 * ゲームティックカウントを使った自動遷移に対応。
 */
class WeatherSystem {
    constructor() {
        /** @type {'clear'|'rain'} */
        this._state = 'clear';
        /** @type {Function[]} */
        this._callbacks = [];
        this._nextTransitionTick = 0;
        this._scheduled = false;

        /**
         * 外部から scheduleTickEngine を設定する。
         * SetWeather() 内でのティックカウント取得に使用。
         * @type {{currentTick: number}|null}
         */
        this.scheduleTickEngine = null;
    }

    /** 現在の天候状態 @returns {'clear'|'rain'} */
    get State() { return this._state; }

    /** 雨天中かどうか @returns {boolean} */
    get IsRaining() { return this._state === 'rain'; }

    /**
     * 天候を手動設定（デバッグ・テスト用）
     * @param {'clear'|'rain'} state
     */
    SetWeather(state) {
        if (this._state === state) return;
        this._state = state;
        // 現在ティックから次の自動遷移タイミングを再設定
        const currentTick = this.scheduleTickEngine?.currentTick ?? 0;
        this._nextTransitionTick = currentTick + this._getDuration(state);
        this._scheduled = true;
        this._notify(state);
    }

    /**
     * 天候変化コールバックを登録する
     * @param {Function} callback - (newState: 'clear'|'rain') => void
     */
    OnWeatherChange(callback) {
        this._callbacks.push(callback);
    }

    /**
     * 毎ゲームティックで呼び出す
     * @param {number} currentTick - scheduleTickEngine.currentTick
     */
    Update(currentTick) {
        if (!this._scheduled) {
            this._nextTransitionTick = currentTick + this._getDuration(this._state);
            this._scheduled = true;
        }
        if (currentTick >= this._nextTransitionTick) {
            this._transit(currentTick);
        }
    }

    /**
     * 自動遷移処理
     * @param {number} currentTick
     */
    _transit(currentTick) {
        // 雨 → 必ず晴れ / 晴れ → 50% で雨
        const next = this._state === 'rain'
            ? 'clear'
            : (Math.random() < 0.5 ? 'rain' : 'clear');
        this._state = next;
        this._nextTransitionTick = currentTick + this._getDuration(next);
        this._notify(next);
    }

    /**
     * 天候の持続ゲームティック数をランダムに返す
     * @param {'clear'|'rain'} state
     * @returns {number}
     */
    _getDuration(state) {
        return state === 'clear'
            ? 1200 + Math.floor(Math.random() * 2400) // 1200〜3600 (60〜180秒)
            : 600  + Math.floor(Math.random() * 1200); // 600〜1800 (30〜90秒)
    }

    _notify(state) {
        for (const cb of this._callbacks) cb(state);
    }
}
