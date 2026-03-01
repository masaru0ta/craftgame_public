/**
 * CharacterRenderer.js
 * ワールド用キャラクターメッシュ生成・プレイヤー位置同期
 * CharacterEditorのメッシュ構築を簡略化（グリッド線なし、レイキャストなし）
 */
class CharacterRenderer {
    static CELL_SIZE = 1 / 8; // 1セル = 1/8ブロック

    // Three.js BoxGeometry面順序 → 仕様面ID（CharacterEditorと同じ）
    static THREE_FACE_TO_SPEC = [2, 3, 0, 1, 4, 5];

    // スケーリング係数: Player.HEIGHT_NORMAL(1.8) / キャラ全高(32セル * 1/8 = 4ブロック)
    static SCALE = 1.8 / (32 * CharacterRenderer.CELL_SIZE);

    // 歩行アニメ開始の水平速度閾値（ブロック/秒）
    static WALK_SPEED_THRESHOLD = 0.5;

    // 体の回転速度（rad/s）
    static BODY_TURN_SPEED = 10;

    // 頭の左右首振り最大角度（ラジアン）
    static HEAD_YAW_LIMIT = Math.PI * 75 / 180; // ±75度

    /**
     * @param {Object} options
     * @param {THREE.Object3D} options.worldContainer - ワールドコンテナ
     * @param {Player} options.player - プレイヤーインスタンス
     * @param {Object} options.THREE - Three.jsライブラリ
     */
    constructor(options) {
        this._worldContainer = options.worldContainer;
        this._player = options.player;
        this._THREE = options.THREE;

        this._characterGroup = new options.THREE.Group();
        this._characterGroup.scale.set(
            CharacterRenderer.SCALE,
            CharacterRenderer.SCALE,
            CharacterRenderer.SCALE
        );
        this._worldContainer.add(this._characterGroup);

        this._partMeshes = {};   // partId → THREE.Group
        this._partFaceTextures = {}; // partId → { faceId: DataTexture }
        this._animator = null;
        this._characterData = null;
        this._visible = false;
        this._characterGroup.visible = false;
        this._bodyYaw = options.player.getYaw();
    }

    /**
     * CharacterDataからメッシュを構築
     * @param {CharacterData} characterData
     */
    loadCharacterData(characterData) {
        this._characterData = characterData;

        // 既存メッシュを除去
        this._clearMeshes();

        const THREE = this._THREE;
        const CELL = CharacterRenderer.CELL_SIZE;
        const partMeshesForAnimator = {};

        for (const [partId, partDef] of Object.entries(CharacterData.PARTS)) {
            const w = partDef.width * CELL;
            const h = partDef.height * CELL;
            const d = partDef.depth * CELL;

            // 面ごとのDataTextureとマテリアルを生成
            const faceTextures = {};
            const materials = [];

            for (let threeIdx = 0; threeIdx < 6; threeIdx++) {
                const specFace = CharacterRenderer.THREE_FACE_TO_SPEC[threeIdx];
                const faceSize = characterData.getFaceSize(partId, specFace);
                const texW = faceSize.cols;
                const texH = faceSize.rows;

                const data = new Uint8Array(texW * texH * 4);
                // デフォルトグレー
                for (let i = 0; i < texW * texH; i++) {
                    data[i * 4 + 0] = 0xCC;
                    data[i * 4 + 1] = 0xCC;
                    data[i * 4 + 2] = 0xCC;
                    data[i * 4 + 3] = 0xFF;
                }

                const texture = new THREE.DataTexture(data, texW, texH, THREE.RGBAFormat);
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                texture.needsUpdate = true;

                faceTextures[specFace] = texture;
                materials.push(new THREE.MeshLambertMaterial({ map: texture }));
            }

            this._partFaceTextures[partId] = faceTextures;

            // Boxジオメトリ
            const geometry = new THREE.BoxGeometry(w, h, d);
            const mesh = new THREE.Mesh(geometry, materials);

            // ピボット用Group
            const pivot = partDef.pivot;
            mesh.position.set(
                w / 2 - pivot[0] * CELL,
                h / 2 - pivot[1] * CELL,
                d / 2 - pivot[2] * CELL
            );

            const group = new THREE.Group();
            group.add(mesh);

            // オフセット（足元基準、centerCharacterなし）
            const offset = partDef.offset;
            group.position.set(
                offset[0] * CELL + pivot[0] * CELL,
                offset[1] * CELL + pivot[1] * CELL,
                offset[2] * CELL + pivot[2] * CELL
            );

            this._characterGroup.add(group);
            this._partMeshes[partId] = group;
            partMeshesForAnimator[partId] = group;
        }

        // X方向の中央揃え（足元Y=0は維持）
        const centerX = 4 * CELL;
        for (const group of Object.values(this._partMeshes)) {
            group.position.x -= centerX;
        }

        // テクスチャにCharacterDataの色を反映
        this._updateAllTextures();

        // アニメーター初期化
        this._animator = new CharacterAnimator(partMeshesForAnimator);
    }

    /**
     * 全面のテクスチャを更新
     */
    _updateAllTextures() {
        if (!this._characterData) return;
        for (const partId of Object.keys(CharacterData.PARTS)) {
            for (let faceId = 0; faceId < 6; faceId++) {
                this._updateFaceTexture(partId, faceId);
            }
        }
    }

    /**
     * 特定面のDataTextureを更新
     */
    _updateFaceTexture(partId, faceId) {
        const textures = this._partFaceTextures[partId];
        if (!textures) return;
        const texture = textures[faceId];
        if (!texture) return;

        const faceSize = this._characterData.getFaceSize(partId, faceId);
        const data = texture.image.data;

        for (let row = 0; row < faceSize.rows; row++) {
            for (let col = 0; col < faceSize.cols; col++) {
                const color = this._characterData.getCell(partId, faceId, row, col);
                let r, g, b;
                if (color === 0) { r = 0xCC; g = 0xCC; b = 0xCC; }
                else { r = (color >> 16) & 0xFF; g = (color >> 8) & 0xFF; b = color & 0xFF; }
                // DataTextureは左下原点なのでrow反転
                const texRow = faceSize.rows - 1 - row;
                const px = (texRow * faceSize.cols + col) * 4;
                data[px + 0] = r;
                data[px + 1] = g;
                data[px + 2] = b;
                data[px + 3] = 0xFF;
            }
        }
        texture.needsUpdate = true;
    }

    /**
     * 既存メッシュを除去
     */
    _clearMeshes() {
        for (const group of Object.values(this._partMeshes)) {
            this._characterGroup.remove(group);
        }
        this._partMeshes = {};
        this._partFaceTextures = {};
        this._animator = null;
    }

    /**
     * 毎フレーム呼出: 位置・向き同期とアニメーション更新
     * @param {number} dt - 経過秒数
     */
    update(dt) {
        if (!this._visible) return;

        const pos = this._player.getPosition();
        this._characterGroup.position.set(pos.x, pos.y, pos.z);

        // bodyYaw更新: 移動中は速度ベクトルから向きを算出、停止時は維持
        const vel = this._player.getVelocity();
        const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

        if (horizontalSpeed > CharacterRenderer.WALK_SPEED_THRESHOLD) {
            // 速度ベクトルから体の向きを算出（前面は+Z面）
            const targetYaw = Math.atan2(vel.x, vel.z);
            // 角度差を -π〜π に正規化して最短経路で回転
            let diff = targetYaw - this._bodyYaw;
            diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
            this._bodyYaw += diff * Math.min(1, CharacterRenderer.BODY_TURN_SPEED * dt);
        }

        this._characterGroup.rotation.y = this._bodyYaw;

        // 頭の向き: ピッチ（上下）とヨー差分（左右首振り）
        const headGroup = this._partMeshes['head'];
        if (headGroup) {
            // ピッチ → 頭のX軸回転（上を向く=負のpitch→正のrotation.x）
            headGroup.rotation.x = -this._player.getPitch();

            // ヨー差分 → 頭のY軸回転（視線方向と体の向きの差）
            let headYawDiff = this._player.getYaw() - this._bodyYaw;
            // -π〜πに正規化
            while (headYawDiff > Math.PI) headYawDiff -= Math.PI * 2;
            while (headYawDiff < -Math.PI) headYawDiff += Math.PI * 2;
            // 首振り範囲を制限
            headYawDiff = Math.max(-CharacterRenderer.HEAD_YAW_LIMIT,
                Math.min(CharacterRenderer.HEAD_YAW_LIMIT, headYawDiff));
            headGroup.rotation.y = -headYawDiff;
        }

        // 歩行アニメ自動制御
        if (this._animator) {
            if (horizontalSpeed > CharacterRenderer.WALK_SPEED_THRESHOLD && !this._animator.isPlaying) {
                this._animator.play('walk');
            } else if (horizontalSpeed <= CharacterRenderer.WALK_SPEED_THRESHOLD && this._animator.isPlaying) {
                this._animator.stop();
            }

            this._animator.update(dt);
        }
    }

    /** @param {boolean} visible */
    setVisible(visible) {
        this._visible = visible;
        this._characterGroup.visible = visible;
    }

    /** @returns {boolean} */
    isVisible() {
        return this._visible;
    }

    // ============================
    // 公開API（テスト用含む）
    // ============================

    /** @returns {number} 構築済みパーツ数 */
    getPartCount() {
        return Object.keys(this._partMeshes).length;
    }

    /** @returns {number} characterGroupのスケール値 */
    getScale() {
        return this._characterGroup.scale.y;
    }

    /** @returns {{x: number, y: number, z: number}} */
    getCharacterPosition() {
        const p = this._characterGroup.position;
        return { x: p.x, y: p.y, z: p.z };
    }

    /** @returns {number} Y軸回転値（ラジアン） */
    getCharacterRotationY() {
        return this._characterGroup.rotation.y;
    }

    /** @returns {number} キャラクターの体の向き（ラジアン） */
    getBodyYaw() {
        return this._bodyYaw;
    }

    /** @returns {{isPlaying: boolean, currentAnimation: string|null}} */
    getAnimatorState() {
        if (!this._animator) return { isPlaying: false, currentAnimation: null };
        return {
            isPlaying: this._animator.isPlaying,
            currentAnimation: this._animator.currentAnimation ? this._animator.currentAnimation.name : null
        };
    }

    /**
     * リソース破棄
     */
    dispose() {
        this._clearMeshes();
        if (this._characterGroup.parent) {
            this._characterGroup.parent.remove(this._characterGroup);
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.CharacterRenderer = CharacterRenderer;
}
