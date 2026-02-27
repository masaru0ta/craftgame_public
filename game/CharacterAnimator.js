/**
 * CharacterAnimator
 * パーツ回転によるアニメーション再生
 */
class CharacterAnimator {
    /**
     * @param {Object} partMeshes - パーツID → THREE.Group のマップ
     */
    constructor(partMeshes) {
        this.partMeshes = partMeshes;
        this.isPlaying = false;
        this.currentAnimation = null;
        this.elapsedTime = 0;

        // アニメーション定義
        this.animations = {
            walk: {
                name: 'walk',
                duration: 0.5,
                loop: true,
                keyframes: {
                    arm_r:  [{ time: 0, rx: 30 },  { time: 0.5, rx: -30 }, { time: 1, rx: 30 }],
                    arm_l:  [{ time: 0, rx: -30 }, { time: 0.5, rx: 30 },  { time: 1, rx: -30 }],
                    leg_r:  [{ time: 0, rx: -30 }, { time: 0.5, rx: 30 },  { time: 1, rx: -30 }],
                    leg_l:  [{ time: 0, rx: 30 },  { time: 0.5, rx: -30 }, { time: 1, rx: 30 }]
                }
            },
            attack: {
                name: 'attack',
                duration: 1.0,
                loop: false,
                keyframes: {
                    arm_r: [{ time: 0, rx: 0 }, { time: 0.4, rx: -90 }, { time: 1, rx: 0 }]
                }
            }
        };
    }

    /**
     * アニメーション再生開始
     * @param {string} animationName - アニメーション名
     */
    play(animationName) {
        if (!this.animations[animationName]) return;
        this.currentAnimation = this.animations[animationName];
        this.elapsedTime = 0;
        this.isPlaying = true;
    }

    /**
     * 停止してTポーズに戻す
     */
    stop() {
        this.isPlaying = false;
        this.currentAnimation = null;
        this.elapsedTime = 0;
        // 全パーツの回転をリセット
        for (const partId of Object.keys(this.partMeshes)) {
            const group = this.partMeshes[partId];
            if (group) {
                group.rotation.set(0, 0, 0);
            }
        }
    }

    /**
     * 毎フレーム呼び出し
     * @param {number} deltaTime - 経過秒数
     */
    update(deltaTime) {
        if (!this.isPlaying || !this.currentAnimation) return;

        this.elapsedTime += deltaTime;
        const anim = this.currentAnimation;
        let t = this.elapsedTime / anim.duration;

        if (anim.loop) {
            t = t % 1;
        } else {
            if (t >= 1) {
                t = 1;
                this.isPlaying = false;
            }
        }

        // キーフレーム補間を適用
        const keyframes = anim.keyframes;
        for (const partId of Object.keys(keyframes)) {
            const group = this.partMeshes[partId];
            if (!group) continue;

            const frames = keyframes[partId];
            const rx = this._interpolate(frames, t);
            group.rotation.x = rx * Math.PI / 180;
        }
    }

    /**
     * キーフレーム間の線形補間
     */
    _interpolate(frames, t) {
        // tより前の最後のフレームと次のフレームを探す
        let prev = frames[0];
        let next = frames[frames.length - 1];

        for (let i = 0; i < frames.length - 1; i++) {
            if (t >= frames[i].time && t <= frames[i + 1].time) {
                prev = frames[i];
                next = frames[i + 1];
                break;
            }
        }

        if (prev.time === next.time) return prev.rx;

        const localT = (t - prev.time) / (next.time - prev.time);
        return prev.rx + (next.rx - prev.rx) * localT;
    }

    /**
     * 利用可能なアニメーション名の配列
     * @returns {string[]}
     */
    getAnimationList() {
        return Object.keys(this.animations);
    }

    /**
     * 指定パーツの現在の回転角度（度数）
     * @param {string} partId
     * @returns {{x: number, y: number, z: number}}
     */
    getPartRotation(partId) {
        const group = this.partMeshes[partId];
        if (!group) return { x: 0, y: 0, z: 0 };
        return {
            x: Math.round(group.rotation.x * 180 / Math.PI * 1000) / 1000,
            y: Math.round(group.rotation.y * 180 / Math.PI * 1000) / 1000,
            z: Math.round(group.rotation.z * 180 / Math.PI * 1000) / 1000
        };
    }
}

if (typeof window !== 'undefined') {
    window.CharacterAnimator = CharacterAnimator;
}
