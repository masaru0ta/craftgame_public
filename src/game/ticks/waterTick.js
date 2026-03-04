/**
 * 水の流体シミュレーションハンドラ（仕様書 2-19）
 * ScheduleTickEngine に登録するハンドラ関数。
 * 水ブロックがスケジュールティックを受け取ると、隣接する air へ流れる。
 */

/** 横方向への最大流れ距離（Minecraft準拠） */
const MaxFlowDistance = 7;

/**
 * orientation の特殊値
 * 0          : WaterSource  - プレイヤー設置の水源。汲み取り可能、自然消滅しない
 * 1〜7       : 横フロー距離。汲み取り不可、サポートが無くなると消える
 * WaterFalling: 落下水。高さは満水と同じ（1.0）、上の水が無くなると消える
 */
const WaterFalling = 8;

/** 隣接方向テーブル（横4方向: ±X, ±Z） */
const _WaterFlowDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * 水ティックハンドラ（フロー・decay 共用）
 * @param {Object} chunkManager
 * @param {number} wx
 * @param {number} wy
 * @param {number} wz
 * @param {Function} schedule
 * @param {Set} dirty
 * @param {Object} meta - { dist: number } または { decay: true }
 */
function waterTickHandler(chunkManager, wx, wy, wz, schedule, dirty, meta) {
    if (meta && meta.decay) {
        return _waterDecay(chunkManager, wx, wy, wz, schedule, dirty);
    }

    const dist = (meta && typeof meta.dist === 'number') ? meta.dist : 0;

    // 下方向（-Y）を優先チェック（距離制限なし）
    if (wy > 0) {
        const below = TickHelpers.getBlock(chunkManager, wx, wy - 1, wz);
        if (below === 'air' && _isInLod0(chunkManager, wx, wz)) {
            TickHelpers.setBlock(chunkManager, wx, wy - 1, wz, 'water', dirty, WaterFalling);
            schedule(wx, wy - 1, wz, 'water', 2, { dist });
            return;
        }
    }

    // 横方向（MaxFlowDistance 制限あり）
    if (dist >= MaxFlowDistance) return;

    // 有効な横方向（air かつ LoD0 内）を収集
    const validDirs = [];
    for (const [dx, dz] of _WaterFlowDirs) {
        const nx = wx + dx;
        const nz = wz + dz;
        if (!_isInLod0(chunkManager, nx, nz)) continue;
        if (TickHelpers.getBlock(chunkManager, nx, wy, nz) !== 'air') continue;
        validDirs.push([dx, dz]);
    }

    if (validDirs.length === 0) return;

    // 落差あり方向（有効方向の中で、その下も air）を優先
    const dropDirs = validDirs.filter(([dx, dz]) =>
        wy > 0 && TickHelpers.getBlock(chunkManager, wx + dx, wy - 1, wz + dz) === 'air'
    );

    for (const [dx, dz] of (dropDirs.length > 0 ? dropDirs : validDirs)) {
        const nx = wx + dx;
        const nz = wz + dz;
        TickHelpers.setBlock(chunkManager, nx, wy, nz, 'water', dirty, dist + 1);
        schedule(nx, wy, nz, 'water', 2, { dist: dist + 1 });
    }
}

/**
 * 水ブロックの decay チェック。
 * サポートが無くなっていれば air に置き換え、周囲にも decay を伝播する。
 */
function _waterDecay(chunkManager, wx, wy, wz, schedule, dirty) {
    const orientation = TickHelpers.getOrientation(chunkManager, wx, wy, wz);
    if (orientation === 0) return; // WaterSource は自然消滅しない

    if (_isWaterSupported(chunkManager, wx, wy, wz, orientation)) return;

    // WaterFalling(8) は最低水位(7)へ、それ以外は +1 ずつ下げていく
    const nextLevel = orientation === WaterFalling ? MaxFlowDistance : orientation + 1;

    if (nextLevel > MaxFlowDistance) {
        // 最低水位を超えたら消滅
        TickHelpers.setBlock(chunkManager, wx, wy, wz, 'air', dirty);
    } else {
        // 水位を下げて次の drain をリスケジュール
        TickHelpers.setBlock(chunkManager, wx, wy, wz, 'water', dirty, nextLevel);
        schedule(wx, wy, wz, 'water', 2, { decay: true });
    }

    // 隣接ブロックに decay チェックを伝播（このブロックの水位が下がったので）
    _scheduleDecay(chunkManager, wx, wy, wz, schedule);
}

/**
 * 水ブロックがまだサポートされているか判定する。
 */
function _isWaterSupported(chunkManager, wx, wy, wz, orientation) {
    if (orientation === WaterFalling) {
        // 落下水: 真上に水があれば有効
        return TickHelpers.getBlock(chunkManager, wx, wy + 1, wz) === 'water';
    }
    // 横フロー（1〜7）: 横に自分より orientation が小さい水（源に近い）があれば有効
    for (const [dx, dz] of _WaterFlowDirs) {
        if (TickHelpers.getBlock(chunkManager, wx + dx, wy, wz + dz) === 'water') {
            const n = TickHelpers.getOrientation(chunkManager, wx + dx, wy, wz + dz);
            if (n < orientation) return true; // WaterSource(0) も含む
        }
    }
    return false;
}

/**
 * 周囲の水ブロックに decay をスケジュールする。
 */
function _scheduleDecay(chunkManager, wx, wy, wz, schedule) {
    const decayMeta = { decay: true };
    for (const [dx, dz] of _WaterFlowDirs) {
        if (TickHelpers.getBlock(chunkManager, wx + dx, wy, wz + dz) === 'water')
            schedule(wx + dx, wy, wz + dz, 'water', 2, decayMeta);
    }
    // 真下（落下水の連鎖消滅）
    if (TickHelpers.getBlock(chunkManager, wx, wy - 1, wz) === 'water')
        schedule(wx, wy - 1, wz, 'water', 2, decayMeta);
}

/**
 * 指定ワールド座標が LoD0 範囲内かどうかを確認する
 */
function _isInLod0(chunkManager, wx, wz) {
    const cx = Math.floor(wx / 16);
    const cz = Math.floor(wz / 16);
    const centerCX = chunkManager.lastChunkX;
    const centerCZ = chunkManager.lastChunkZ;
    if (centerCX === null || centerCZ === null) return true;
    const lod0Range = chunkManager.lod0Range;
    const d = Math.max(Math.abs(cx - centerCX), Math.abs(cz - centerCZ));
    return d <= lod0Range;
}
