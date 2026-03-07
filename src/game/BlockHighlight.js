/**
 * BlockHighlight.js
 * ブロックハイライト表示 - 視線が当たっているブロックを強調表示
 */
class BlockHighlight {
    // 表示パラメータ
    static WIREFRAME_COLOR = 0x000000;       // 黒
    static FACE_COLOR = 0xffffff;            // 白
    static FACE_OPACITY = 0.3;               // 透明度
    static OFFSET = 0.001;                   // Zファイティング防止オフセット

    /**
     * コンストラクタ
     * @param {THREE.Scene} scene - Three.jsシーン
     */
    constructor(scene) {
        this.scene = scene;
        this.wireframe = null;
        this.faceHighlight = null;
        this.currentTarget = null;
        this._actionLabel = null;

        this._createMeshes();
        this._createActionLabel();
    }

    /**
     * メッシュを作成
     */
    _createMeshes() {
        // ワイヤーフレーム用ジオメトリ（1x1x1のボックス）
        const boxGeometry = new THREE.BoxGeometry(
            1 + BlockHighlight.OFFSET * 2,
            1 + BlockHighlight.OFFSET * 2,
            1 + BlockHighlight.OFFSET * 2
        );

        // ワイヤーフレーム
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: BlockHighlight.WIREFRAME_COLOR,
            linewidth: 2
        });
        const wireframeGeometry = new THREE.EdgesGeometry(boxGeometry);
        this.wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        this.wireframe.visible = false;
        this.scene.add(this.wireframe);

        // 面ハイライト用（各面のジオメトリを事前作成）
        const faceMaterial = new THREE.MeshBasicMaterial({
            color: BlockHighlight.FACE_COLOR,
            transparent: true,
            opacity: BlockHighlight.FACE_OPACITY,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false
        });

        // 面ハイライト用のプレーン
        const planeGeometry = new THREE.PlaneGeometry(1, 1);
        this.faceHighlight = new THREE.Mesh(planeGeometry, faceMaterial);
        this.faceHighlight.visible = false;
        this.scene.add(this.faceHighlight);

        // バウンディングボックスを計算（テスト用）
        boxGeometry.computeBoundingBox();
    }

    /**
     * ハイライトを更新
     * @param {Object|null} raycastResult - レイキャスト結果
     */
    update(raycastResult) {
        if (!raycastResult || !raycastResult.hit) {
            this.hide();
            this.currentTarget = null;
            return;
        }

        this.currentTarget = raycastResult;
        this.show();

        // ワイヤーフレームの位置を更新
        // ブロックの中心に配置（左手座標系→Three.js座標系変換）
        const blockCenterX = raycastResult.blockX + 0.5;
        const blockCenterY = raycastResult.blockY + 0.5;
        const blockCenterZ = raycastResult.blockZ + 0.5;

        this.wireframe.position.set(blockCenterX, blockCenterY, -blockCenterZ);

        // 面ハイライトの位置と向きを更新
        this._updateFaceHighlight(raycastResult);
    }

    /**
     * 面ハイライトを更新
     * @param {Object} result - レイキャスト結果
     */
    _updateFaceHighlight(result) {
        const offset = BlockHighlight.OFFSET * 2;
        const x = result.blockX;
        const y = result.blockY;
        const z = result.blockZ;

        // 面の位置と回転を設定
        switch (result.face) {
            case 'top':
                this.faceHighlight.position.set(x + 0.5, y + 1 + offset, -(z + 0.5));
                this.faceHighlight.rotation.set(-Math.PI / 2, 0, 0);
                break;
            case 'bottom':
                this.faceHighlight.position.set(x + 0.5, y - offset, -(z + 0.5));
                this.faceHighlight.rotation.set(Math.PI / 2, 0, 0);
                break;
            case 'north':
                this.faceHighlight.position.set(x + 0.5, y + 0.5, -(z + 1 + offset));
                this.faceHighlight.rotation.set(0, 0, 0);
                break;
            case 'south':
                this.faceHighlight.position.set(x + 0.5, y + 0.5, -(z - offset));
                this.faceHighlight.rotation.set(0, Math.PI, 0);
                break;
            case 'east':
                this.faceHighlight.position.set(x + 1 + offset, y + 0.5, -(z + 0.5));
                this.faceHighlight.rotation.set(0, Math.PI / 2, 0);
                break;
            case 'west':
                this.faceHighlight.position.set(x - offset, y + 0.5, -(z + 0.5));
                this.faceHighlight.rotation.set(0, -Math.PI / 2, 0);
                break;
        }
    }

    /**
     * アクションラベル用HTML要素を作成
     */
    _createActionLabel() {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;top:45%;left:50%;transform:translate(-50%,-50%);' +
            'background:rgba(0,0,0,0.7);color:#fff;padding:4px 12px;border-radius:4px;' +
            'font-size:14px;pointer-events:none;z-index:100;display:none;white-space:nowrap;';
        document.body.appendChild(el);
        this._actionLabel = el;
    }

    /**
     * アクションラベルを表示（ハイライト・ワイヤーフレームは非表示）
     * @param {string} text - 表示テキスト
     */
    showActionLabel(text) {
        this.wireframe.visible = false;
        this.faceHighlight.visible = false;
        if (this._actionLabel) {
            this._actionLabel.textContent = text;
            this._actionLabel.style.display = 'block';
        }
    }

    /**
     * アクションラベルを非表示
     */
    hideActionLabel() {
        if (this._actionLabel) {
            this._actionLabel.style.display = 'none';
        }
    }

    /**
     * ハイライトを表示
     */
    show() {
        this.wireframe.visible = true;
        this.faceHighlight.visible = true;
        this.hideActionLabel();
    }

    /**
     * ハイライトを非表示
     */
    hide() {
        this.wireframe.visible = false;
        this.faceHighlight.visible = false;
        this.hideActionLabel();
    }

    /**
     * リソースを解放
     */
    dispose() {
        if (this.wireframe) {
            this.scene.remove(this.wireframe);
            this.wireframe.geometry.dispose();
            this.wireframe.material.dispose();
        }
        if (this.faceHighlight) {
            this.scene.remove(this.faceHighlight);
            this.faceHighlight.geometry.dispose();
            this.faceHighlight.material.dispose();
        }
        if (this._actionLabel && this._actionLabel.parentNode) {
            this._actionLabel.parentNode.removeChild(this._actionLabel);
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.BlockHighlight = BlockHighlight;
}
