/**
 * grass ブロックのランダムティックハンドラ（仕様書 2-18）
 *
 * 動作:
 * - 真上が不透過ブロック かつ ライト < 4 → grass を dirt に逆変換
 * - それ以外 → 周囲（X/Z±3・Y±1）の dirt をスキャンし、
 *   上ブロックが air かつ ライト >= 4 の候補をランダムに 1 つ grass に変換
 *
 * 依存: tickHelpers.js（TickHelpers）
 */

/**
 * grass ティックハンドラ
 * @param {Object} cm - chunkManager
 * @param {number} wx wy wz - grass のワールド座標
 * @param {Set} dirty - 再構築対象チャンクキーのセット
 */
function grassTickHandler(cm, wx, wy, wz, dirty) {
    const blockAbove = TickHelpers.getBlock(cm, wx, wy + 1, wz);
    const lightAbove = TickHelpers.getLight(cm, wx, wy + 1, wz);

    // 逆変換: 真上が非-air かつ ライト < 4 → dirt に戻す
    if (blockAbove !== null && blockAbove !== 'air' && lightAbove < 4) {
        TickHelpers.setBlock(cm, wx, wy, wz, 'dirt', dirty);
        return;
    }

    // 周囲の dirt 候補を収集（X/Z±3・Y±1）
    const candidates = [];
    for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                const tx = wx + dx;
                const ty = wy + dy;
                const tz = wz + dz;
                if (TickHelpers.getBlock(cm, tx, ty, tz) !== 'dirt') continue;
                // dirt の真上が air であること
                const above = TickHelpers.getBlock(cm, tx, ty + 1, tz);
                if (above !== null && above !== 'air') continue;
                // ライトレベルが 4 以上であること
                if (TickHelpers.getLight(cm, tx, ty + 1, tz) < 4) continue;
                candidates.push({ tx, ty, tz });
            }
        }
    }

    if (candidates.length === 0) return;

    // ランダムに 1 つ選んで grass に変換
    const c = candidates[(Math.random() * candidates.length) | 0];
    TickHelpers.setBlock(cm, c.tx, c.ty, c.tz, 'grass', dirty);
}
