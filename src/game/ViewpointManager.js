/**
 * ViewpointManager.js
 * 1人称/3人称視点モードの管理
 */
class ViewpointManager {
    static MODE_FIRST_PERSON = 'first_person';
    static MODE_THIRD_PERSON = 'third_person';

    /**
     * @param {Object} options
     * @param {FirstPersonCamera} options.firstPersonCamera
     * @param {ThirdPersonCamera} options.thirdPersonCamera
     * @param {CharacterRenderer} options.characterRenderer
     */
    constructor(options) {
        this._firstPersonCamera = options.firstPersonCamera;
        this._thirdPersonCamera = options.thirdPersonCamera;
        this._characterRenderer = options.characterRenderer;
        this._mode = ViewpointManager.MODE_FIRST_PERSON;

        // 初期状態: キャラクター非表示
        this._characterRenderer.setVisible(false);
    }

    /**
     * 1人称↔3人称を切り替え
     */
    toggleMode() {
        if (this._mode === ViewpointManager.MODE_FIRST_PERSON) {
            this._mode = ViewpointManager.MODE_THIRD_PERSON;
            this._characterRenderer.setVisible(true);
        } else {
            this._mode = ViewpointManager.MODE_FIRST_PERSON;
            this._characterRenderer.setVisible(false);
        }
    }

    /**
     * @returns {string} 現在のモード文字列
     */
    getMode() {
        return this._mode;
    }

    /**
     * 毎フレーム呼出
     * @param {number} dt - 経過秒数
     */
    update(dt) {
        // アクティブカメラを更新
        if (this._mode === ViewpointManager.MODE_FIRST_PERSON) {
            this._firstPersonCamera.update();
        } else {
            this._thirdPersonCamera.update();
        }

        // キャラクターレンダラーを更新（3人称時のみ実行される：内部でvisibleチェック）
        this._characterRenderer.update(dt);
    }

    /**
     * 現在のモードに応じたカメラコントローラーを返す
     */
    getActiveCamera() {
        if (this._mode === ViewpointManager.MODE_FIRST_PERSON) {
            return this._firstPersonCamera;
        }
        return this._thirdPersonCamera;
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.ViewpointManager = ViewpointManager;
}
