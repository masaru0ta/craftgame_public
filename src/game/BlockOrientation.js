/**
 * BlockOrientation - ブロック方向・回転ユーティリティ
 * orient(0〜23) に関する全ての計算を集約する単一責任クラス
 *
 * orient = topDir × 4 + rotation
 * - topDir(0〜5): ブロックのtop面がどの方角を向いているか
 * - rotation(0〜3): top面の法線軸まわりの回転（0°, 90°, 180°, 270°）
 */
class BlockOrientation {
    // ========================================
    // 定数
    // ========================================

    /** テクスチャ空間の面名一覧 */
    static FaceNames = ['top', 'bottom', 'front', 'back', 'right', 'left'];

    /** 面法線ベクトル（テクスチャ空間: front=Z-南, back=Z+北） */
    static FaceNormals = {
        top:    [0, 1, 0],
        bottom: [0, -1, 0],
        front:  [0, 0, -1],
        back:   [0, 0, 1],
        right:  [1, 0, 0],
        left:   [-1, 0, 0]
    };

    /** レイキャスト用面法線（north/south形式） */
    static RaycastFaceNormals = {
        top:    [0, 1, 0],
        bottom: [0, -1, 0],
        south:  [0, 0, -1],
        north:  [0, 0, 1],
        east:   [1, 0, 0],
        west:   [-1, 0, 0]
    };

    /** 面名 → topDir 変換 */
    static FaceToTopDir = { top: 0, bottom: 1, north: 2, south: 3, east: 4, west: 5 };

    /** topDir → 面名 変換 */
    static TopDirToFace = ['top', 'bottom', 'north', 'south', 'east', 'west'];

    static TopDirCount = 6;
    static RotationCount = 4;
    static MaxOrient = 24;

    // ========================================
    // Encode / Decode
    // ========================================

    /**
     * topDir と rotation から orient 格納値を計算
     * @param {number} topDir - 0〜5
     * @param {number} rotation - 0〜3
     * @returns {number} orient (0〜23)
     */
    static Encode(topDir, rotation) {
        return topDir * 4 + rotation;
    }

    /**
     * orient 格納値から topDir を取得
     * @param {number} orient - 0〜23
     * @returns {number} topDir (0〜5)
     */
    static GetTopDir(orient) {
        return Math.floor(orient / 4);
    }

    /**
     * orient 格納値から rotation を取得
     * @param {number} orient - 0〜23
     * @returns {number} rotation (0〜3)
     */
    static GetRotation(orient) {
        return orient % 4;
    }

    // ========================================
    // 回転行列テーブル
    // ========================================

    /**
     * 24パターンの3×3回転行列
     * orient = topDir × 4 + rotation
     * 行列は [m00,m01,m02, m10,m11,m12, m20,m21,m22] のフラット配列
     */
    static Matrices = (() => {
        const matrices = new Array(24);
        const PI = Math.PI;
        const HP = PI / 2;

        // 軸-角度から3x3回転行列を生成
        const fromAxisAngle = (ax, ay, az, angle) => {
            const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
            return [
                t*ax*ax + c,    t*ax*ay - s*az, t*ax*az + s*ay,
                t*ax*ay + s*az, t*ay*ay + c,    t*ay*az - s*ax,
                t*ax*az - s*ay, t*ay*az + s*ax, t*az*az + c
            ];
        };

        // 3x3行列の積
        const mul = (a, b) => [
            a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
            a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
            a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8]
        ];

        const identity = [1,0,0, 0,1,0, 0,0,1];

        // topDir ごとの基底回転行列
        // topDir=0: +Y（デフォルト、単位行列）
        // topDir=1: -Y（X軸π回転）
        // topDir=2: +Z（X軸+π/2回転）
        // topDir=3: -Z（X軸-π/2回転）
        // topDir=4: +X（Z軸-π/2回転）
        // topDir=5: -X（Z軸+π/2回転）
        const faceMatrices = [
            identity,
            fromAxisAngle(1, 0, 0, PI),
            fromAxisAngle(1, 0, 0, HP),
            fromAxisAngle(1, 0, 0, -HP),
            fromAxisAngle(0, 0, 1, -HP),
            fromAxisAngle(0, 0, 1, HP)
        ];

        for (let face = 0; face < 6; face++) {
            for (let rot = 0; rot < 4; rot++) {
                const rotM = (rot === 0) ? identity : fromAxisAngle(0, 1, 0, rot * HP);
                // 合成: faceMatrix × rotationMatrix
                matrices[face * 4 + rot] = mul(faceMatrices[face], rotM);
            }
        }

        // 浮動小数点誤差を除去（-1, 0, 1 にスナップ）
        for (let i = 0; i < 24; i++) {
            for (let j = 0; j < 9; j++) {
                const v = matrices[i][j];
                if (Math.abs(v) < 1e-10) matrices[i][j] = 0;
                else if (Math.abs(v - 1) < 1e-10) matrices[i][j] = 1;
                else if (Math.abs(v + 1) < 1e-10) matrices[i][j] = -1;
            }
        }

        return matrices;
    })();

    // ========================================
    // テクスチャ面リマップテーブル
    // ========================================

    /**
     * orient(0〜23) に応じた物理面 → テクスチャ面のリマップテーブル
     * orient=0 は null（リマップ不要）
     */
    static TexRemap = (() => {
        const faceNames = BlockOrientation.FaceNames;
        const faceNormals = BlockOrientation.FaceNormals;
        const remap = {};
        const matrices = BlockOrientation.Matrices;

        for (let orient = 1; orient < 24; orient++) {
            const m = matrices[orient];
            const mapping = {};
            for (const origFace of faceNames) {
                const n = faceNormals[origFace];
                // 正回転: M × 法線
                const rx = Math.round(m[0] * n[0] + m[1] * n[1] + m[2] * n[2]);
                const ry = Math.round(m[3] * n[0] + m[4] * n[1] + m[5] * n[2]);
                const rz = Math.round(m[6] * n[0] + m[7] * n[1] + m[8] * n[2]);
                // 変換後の法線に一致する物理面を探す
                for (const physFace of faceNames) {
                    const pn = faceNormals[physFace];
                    if (pn[0] === rx && pn[1] === ry && pn[2] === rz) {
                        mapping[physFace] = origFace;
                        break;
                    }
                }
            }
            remap[orient] = mapping;
        }
        return remap;
    })();

    // ========================================
    // UV回転テーブル
    // ========================================

    /**
     * orient(0〜23) × 物理面 → UV回転量(0〜3) のテーブル
     * ソース面のUV座標系が物理面のUV座標系にどう回転するかを算出
     */
    static UVRot = (() => {
        // 各面のUV座標系: tangent(u+方向), bitangent(v+方向)
        const T = {
            top: [1,0,0], bottom: [1,0,0],
            front: [1,0,0], back: [-1,0,0],
            right: [0,0,1], left: [0,0,-1]
        };
        const B = {
            top: [0,0,1], bottom: [0,0,-1],
            front: [0,1,0], back: [0,1,0],
            right: [0,1,0], left: [0,1,0]
        };
        const faceNames = BlockOrientation.FaceNames;
        const result = {};
        const matrices = BlockOrientation.Matrices;
        const texRemap = BlockOrientation.TexRemap;

        for (let ori = 0; ori < 24; ori++) {
            const m = matrices[ori];
            const remap = texRemap[ori] || null;
            const rots = {};
            for (const pf of faceNames) {
                const sf = remap ? remap[pf] : pf;
                const st = T[sf];
                // M × src_tangent
                const rx = Math.round(m[0]*st[0] + m[1]*st[1] + m[2]*st[2]);
                const ry = Math.round(m[3]*st[0] + m[4]*st[1] + m[5]*st[2]);
                const rz = Math.round(m[6]*st[0] + m[7]*st[1] + m[8]*st[2]);
                // 物理面のtangent/bitangentに射影
                const pt = T[pf], pb = B[pf];
                const uu = rx*pt[0] + ry*pt[1] + rz*pt[2];
                const uv = rx*pb[0] + ry*pb[1] + rz*pb[2];
                // (uu,uv): (1,0)→0, (0,1)→1, (-1,0)→2, (0,-1)→3
                rots[pf] = uu === 0 ? (uv > 0 ? 1 : 3) : (uu > 0 ? 0 : 2);
            }
            result[ori] = rots;
        }
        return result;
    })();

    // ========================================
    // 配列インデックスベースのテーブル（パフォーマンス最適化）
    // ========================================

    /** 面名 → インデックス変換（FaceNames の並び順と一致） */
    static FaceIdx = { top: 0, bottom: 1, front: 2, back: 3, right: 4, left: 5 };

    /**
     * TexRemap の配列インデックス版
     * アクセス: TexRemapIdx[orient * 6 + faceIdx] → textureFaceIdx (0〜5)
     * orient=0 は恒等写像
     */
    static TexRemapIdx = (() => {
        const arr = new Uint8Array(144);
        const faceNames = BlockOrientation.FaceNames;
        const faceIdx = BlockOrientation.FaceIdx;
        const texRemap = BlockOrientation.TexRemap;
        for (let ori = 0; ori < 24; ori++) {
            const remap = texRemap[ori] || null;
            const base = ori * 6;
            for (let fi = 0; fi < 6; fi++) {
                const faceName = faceNames[fi];
                const texFace = remap ? remap[faceName] : faceName;
                arr[base + fi] = faceIdx[texFace];
            }
        }
        return arr;
    })();

    /**
     * UVRot の配列インデックス版
     * アクセス: UVRotIdx[orient * 6 + faceIdx] → rotation (0〜3)
     */
    static UVRotIdx = (() => {
        const arr = new Uint8Array(144);
        const faceNames = BlockOrientation.FaceNames;
        const uvRot = BlockOrientation.UVRot;
        for (let ori = 0; ori < 24; ori++) {
            const rots = uvRot[ori];
            const base = ori * 6;
            for (let fi = 0; fi < 6; fi++) {
                arr[base + fi] = rots ? (rots[faceNames[fi]] || 0) : 0;
            }
        }
        return arr;
    })();

    // ========================================
    // 面変換
    // ========================================

    /**
     * 法線ベクトルを回転行列で変換する内部ヘルパー
     * @private
     * @param {number[]} m - 3x3回転行列
     * @param {number[]} n - 法線ベクトル [x,y,z]
     * @returns {number[]} 回転後の法線 [rx,ry,rz]
     */
    static _rotateNormal(m, n) {
        return [
            Math.round(m[0]*n[0] + m[1]*n[1] + m[2]*n[2]),
            Math.round(m[3]*n[0] + m[4]*n[1] + m[5]*n[2]),
            Math.round(m[6]*n[0] + m[7]*n[1] + m[8]*n[2])
        ];
    }

    /**
     * テクスチャ面名(front/back形式)をorientに基づいて回転変換
     * @param {string} face - 面名 (top/bottom/front/back/right/left)
     * @param {number} orient - orient (0〜23)
     * @returns {string} 回転後の面名
     */
    static RotateFace(face, orient) {
        if (orient === 0) return face;
        const n = BlockOrientation.FaceNormals[face];
        if (!n) return face;
        const [rx, ry, rz] = BlockOrientation._rotateNormal(BlockOrientation.Matrices[orient], n);
        const faceNormals = BlockOrientation.FaceNormals;
        for (const fname of BlockOrientation.FaceNames) {
            const fn = faceNormals[fname];
            if (fn[0] === rx && fn[1] === ry && fn[2] === rz) return fname;
        }
        return face;
    }

    /**
     * レイキャスト面名(north/south形式)をorientに基づいて回転変換
     * @param {string} face - 面名 (top/bottom/north/south/east/west)
     * @param {number} orient - orient (0〜23)
     * @returns {string} 回転後の面名
     */
    static RotateRaycastFace(face, orient) {
        if (orient === 0) return face;
        const n = BlockOrientation.RaycastFaceNormals[face];
        if (!n) return face;
        const [rx, ry, rz] = BlockOrientation._rotateNormal(BlockOrientation.Matrices[orient], n);
        const ax = Math.abs(rx), ay = Math.abs(ry), az = Math.abs(rz);
        if (ay >= ax && ay >= az) return ry > 0 ? 'top' : 'bottom';
        if (ax >= az) return rx > 0 ? 'east' : 'west';
        return rz > 0 ? 'north' : 'south';
    }

    // ========================================
    // rotation 計算
    // ========================================

    /**
     * プレイヤーのyawからrotation(0〜3)を算出
     * front=Z-基準: rotation=0で南向き
     *
     * @param {number} playerYaw - Yaw角（ラジアン、0=北/Z+方向）
     * @param {number} topDir - 0=上面, 1=下面
     * @returns {number} rotation (0〜3)
     */
    static RotationFromYaw(playerYaw, topDir) {
        const camDirX = -Math.sin(playerYaw);
        const camDirZ = Math.cos(playerYaw);
        const angle = Math.atan2(camDirX, camDirZ) * 180 / Math.PI;

        let rotation;
        if (angle >= -45 && angle < 45) rotation = 0;
        else if (angle >= 45 && angle < 135) rotation = 1;
        else if (angle >= -135 && angle < -45) rotation = 3;
        else rotation = 2;

        // topDir=0（上面設置）: base rotationがそのまま正しい方向
        // topDir=1（下面設置）: Rx(π)でZ反転 → front=Z-がZ+になるため、+2で補正
        if (topDir === 1) {
            rotation = (rotation + 2) % 4;
        }

        return rotation;
    }

    /**
     * 側面ヒット位置からrotation(0〜3)を算出
     * 面の中心からの上下/左右の偏りが大きい方向に正面を向ける
     *
     * @param {number} face - topDir値（2〜5）
     * @param {Object} target - { hitX, hitY, hitZ, adjacentX, adjacentY, adjacentZ }
     * @returns {number} rotation (0〜3)
     */
    static SideRotationFromHit(face, target) {
        const dy = target.hitY - (target.adjacentY + 0.5);
        const dh = (face <= 3)
            ? target.hitX - (target.adjacentX + 0.5)   // north/south: 水平軸=X
            : target.hitZ - (target.adjacentZ + 0.5);  // east/west:   水平軸=Z
        const rots = BlockOrientation._SideRotations[face - 2];
        if (Math.abs(dy) >= Math.abs(dh)) {
            return dy > 0 ? rots[0] : rots[1];
        }
        return dh > 0 ? rots[2] : rots[3];
    }

    // 側面の rotation 対応表
    // [face-2] → [上ヒット, 下ヒット, +水平軸ヒット, -水平軸ヒット]
    // ヒット方向と逆側に正面を向ける
    static _SideRotations = [
        [2, 0, 1, 3], // face=2 north: 上→DOWN, 下→UP, +X→-X, -X→+X
        [0, 2, 1, 3], // face=3 south: 上→DOWN, 下→UP, +X→-X, -X→+X
        [3, 1, 0, 2], // face=4 east:  上→DOWN, 下→UP, +Z→-Z, -Z→+Z
        [1, 3, 0, 2], // face=5 west:  上→DOWN, 下→UP, +Z→-Z, -Z→+Z
    ];

    // ========================================
    // orient 回転合成
    // ========================================

    /**
     * orient に外部回転行列を合成し、新しい orient を返す
     * 回転軸ブロックの復元時に使用
     *
     * @param {number} orient - 元の orient (0〜23)
     * @param {number[]} rotationMatrix - 合成する3x3回転行列 [m00..m22]
     * @returns {number} 新しい orient (0〜23)、一致なしの場合 -1
     */
    static ComposeOrient(orient, rotationMatrix) {
        const matrices = BlockOrientation.Matrices;
        const orig = matrices[orient];
        const rm = rotationMatrix;

        // 行列積: rotationMatrix × orig
        const composed = [
            rm[0]*orig[0]+rm[1]*orig[3]+rm[2]*orig[6], rm[0]*orig[1]+rm[1]*orig[4]+rm[2]*orig[7], rm[0]*orig[2]+rm[1]*orig[5]+rm[2]*orig[8],
            rm[3]*orig[0]+rm[4]*orig[3]+rm[5]*orig[6], rm[3]*orig[1]+rm[4]*orig[4]+rm[5]*orig[7], rm[3]*orig[2]+rm[4]*orig[5]+rm[5]*orig[8],
            rm[6]*orig[0]+rm[7]*orig[3]+rm[8]*orig[6], rm[6]*orig[1]+rm[7]*orig[4]+rm[8]*orig[7], rm[6]*orig[2]+rm[7]*orig[5]+rm[8]*orig[8]
        ];

        // 誤差スナップ
        for (let j = 0; j < 9; j++) {
            const v = composed[j];
            if (Math.abs(v) < 1e-6) composed[j] = 0;
            else if (Math.abs(v - 1) < 1e-6) composed[j] = 1;
            else if (Math.abs(v + 1) < 1e-6) composed[j] = -1;
        }

        // 24パターンから一致するものを探す
        for (let i = 0; i < 24; i++) {
            const m = matrices[i];
            let match = true;
            for (let j = 0; j < 9; j++) {
                if (m[j] !== composed[j]) { match = false; break; }
            }
            if (match) return i;
        }

        return -1;
    }
}
