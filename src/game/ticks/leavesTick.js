/**
 * leaf_block のランダムティックハンドラ（仕様書 2-18）
 *
 * 動作:
 * - BFS で 6 ブロック以内に wood ブロックへの接続があるか確認する
 * - wood が見つかった → 何もしない（健全な葉）
 * - wood が見つからなかった → leaf_block を air に変換（腐敗）
 *
 * BFS の通過可能ブロック: leaf_block, wood, air
 * 依存: tickHelpers.js（TickHelpers）
 */

const _LEAVES_DIRS = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
];

const _LEAVES_MAX_DIST = 6;

/**
 * leaf_block ティックハンドラ
 * @param {Object} cm - chunkManager
 * @param {number} wx wy wz - leaf_block のワールド座標
 * @param {Set} dirty - 再構築対象チャンクキーのセット
 * @param {Object} effects - { onDecay } コールバック群
 */
function leavesTickHandler(cm, wx, wy, wz, dirty, effects) {
    const visited = new Set();
    visited.add(`${wx},${wy},${wz}`);
    const queue = [[wx, wy, wz, 0]];
    let head = 0;

    while (head < queue.length) {
        const item = queue[head++];
        const x = item[0], y = item[1], z = item[2], dist = item[3];

        // 開始ブロック以外はブロック種別を確認
        if (dist > 0) {
            const b = TickHelpers.getBlock(cm, x, y, z);
            if (b === 'wood') return;                              // 木材発見 → 腐敗しない
            if (b !== 'leaf_block' && b !== 'air') continue;      // 通過不可
        }

        if (dist >= _LEAVES_MAX_DIST) continue;

        for (let i = 0; i < _LEAVES_DIRS.length; i++) {
            const d = _LEAVES_DIRS[i];
            const nx = x + d[0], ny = y + d[1], nz = z + d[2];
            const nk = `${nx},${ny},${nz}`;
            if (visited.has(nk)) continue;
            visited.add(nk);
            queue.push([nx, ny, nz, dist + 1]);
        }
    }

    // wood が見つからなかった → 腐敗して air に変換
    TickHelpers.setBlock(cm, wx, wy, wz, 'air', dirty);
    if (effects && effects.onDecay) effects.onDecay(wx, wy, wz, 'leaf_block');
}
