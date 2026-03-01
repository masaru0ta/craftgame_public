/**
 * PeerPlayerRenderer.js
 * 相手プレイヤーのキャラクター表示・位置補間
 * 複数ピア対応（Map管理）
 */
class PeerPlayerRenderer {
    static INTERPOLATION_SPEED = 10; // 補間速度（値が大きいほど速く追従）

    /**
     * @param {THREE.Object3D} worldContainer - ワールドシーンコンテナ
     * @param {Array} blocks - ブロック定義の配列（CharacterRenderer用）
     */
    constructor(worldContainer, blocks) {
        this._worldContainer = worldContainer;
        this._blocks = blocks;

        // ピアごとの表示管理
        // Map<peerId, {player, characterRenderer, target, lastUpdateTime}>
        this._peers = new Map();
    }

    /**
     * ピアを追加
     * @param {string} peerId - ピアID
     */
    addPeer(peerId) {
        if (this._peers.has(peerId)) return;

        // ピア専用のPlayerインスタンスを作成
        const player = new Player(0, 100, 0);

        // CharacterRendererを作成
        const characterRenderer = new CharacterRenderer({
            worldContainer: this._worldContainer,
            player: player,
            THREE: THREE
        });

        this._peers.set(peerId, {
            player: player,
            characterRenderer: characterRenderer,
            target: null, // 補間先の目標状態
            lastUpdateTime: 0
        });
    }

    /**
     * ピアを削除
     * @param {string} peerId - ピアID
     */
    removePeer(peerId) {
        const peer = this._peers.get(peerId);
        if (!peer) return;

        peer.characterRenderer.setVisible(false);
        peer.characterRenderer.dispose();
        this._peers.delete(peerId);
    }

    /**
     * ピアの状態を更新（受信データから目標位置を設定）
     * @param {string} peerId - ピアID
     * @param {Object} state - playerStateメッセージ
     */
    updatePeerState(peerId, state) {
        const peer = this._peers.get(peerId);
        if (!peer) return;

        peer.target = {
            x: state.x,
            y: state.y,
            z: state.z,
            yaw: state.yaw,
            pitch: state.pitch,
            vx: state.vx || 0,
            vy: state.vy || 0,
            vz: state.vz || 0,
            sneaking: state.sneaking || false,
            flying: state.flying || false
        };
        peer.lastUpdateTime = performance.now();
    }

    /**
     * キャラクターデータを設定
     * @param {string} peerId - ピアID
     * @param {Object} charData - キャラクターデータ
     */
    setCharacterData(peerId, charData) {
        const peer = this._peers.get(peerId);
        if (!peer) return;

        peer.characterRenderer.loadCharacterData(charData);
        peer.characterRenderer.setVisible(true);
    }

    /**
     * 毎フレーム更新（補間 + アニメーション）
     * @param {number} dt - デルタタイム（秒）
     */
    update(dt) {
        for (const [peerId, peer] of this._peers) {
            if (!peer.target) continue;

            const t = peer.target;
            const p = peer.player;
            const alpha = Math.min(1, PeerPlayerRenderer.INTERPOLATION_SPEED * dt);

            // 位置の線形補間
            const pos = p.getPosition();
            p.setPosition(
                pos.x + (t.x - pos.x) * alpha,
                pos.y + (t.y - pos.y) * alpha,
                pos.z + (t.z - pos.z) * alpha
            );

            // 角度の補間（最短経路）
            p.setYaw(this._lerpAngle(p.getYaw(), t.yaw, alpha));
            p.setPitch(p.getPitch() + (t.pitch - p.getPitch()) * alpha);

            // 速度を設定（歩行アニメーション制御用）
            p.setVelocity(t.vx, t.vy, t.vz);

            // スニーク・飛行状態
            p.setSneaking(t.sneaking);
            if (t.flying !== p.isFlying()) {
                p.toggleFlying();
            }

            // CharacterRenderer更新
            peer.characterRenderer.update(dt);
        }
    }

    /**
     * 角度の最短経路補間
     * @param {number} current - 現在の角度
     * @param {number} target - 目標の角度
     * @param {number} alpha - 補間率
     * @returns {number}
     */
    _lerpAngle(current, target, alpha) {
        let diff = target - current;
        // -π〜πの範囲に正規化
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return current + diff * alpha;
    }

    /**
     * リソースを解放
     */
    dispose() {
        for (const [peerId, peer] of this._peers) {
            peer.characterRenderer.setVisible(false);
            peer.characterRenderer.dispose();
        }
        this._peers.clear();
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.PeerPlayerRenderer = PeerPlayerRenderer;
}
