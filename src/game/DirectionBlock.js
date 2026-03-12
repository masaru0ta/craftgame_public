/**
 * DirectionBlock.js
 * 移動ブロック管理 - 移動体の生成・移動・衝突判定・地形復元
 */

/**
 * 相対座標 (rx,ry,rz) を1つの整数キーにパックする（範囲 -128〜127）
 */
function packBlockKeyD(rx, ry, rz) {
    return ((rx + 128) << 16) | ((ry + 128) << 8) | (rz + 128);
}

class MovementBody {
    /**
     * @param {number} dirX - 移動ブロックの初期ワールドX
     * @param {number} dirY - 移動ブロックの初期ワールドY
     * @param {number} dirZ - 移動ブロックの初期ワールドZ
     * @param {number} orientation - 移動ブロックのorientation
     * @param {string} moveAxis - 移動軸 ('x', 'y', 'z')
     * @param {number} moveSign - 移動方向 (+1 or -1)
     * @param {Array<{rx:number, ry:number, rz:number, blockId:string, orientation:number}>} blocks
     */
    constructor(dirX, dirY, dirZ, orientation, moveAxis, moveSign, blocks) {
        this._dirX = dirX;
        this._dirY = dirY;
        this._dirZ = dirZ;
        this._orientation = orientation;
        this._moveAxis = moveAxis;
        this._moveSign = moveSign;
        this._blocks = blocks;
        this._blockSet = new Set(blocks.map(b => packBlockKeyD(b.rx, b.ry, b.rz)));
        this._displacement = 0;
        this._speed = 2.0; // ブロック/秒
        this._isMoving = true;
        this._lastIntDisplacement = 0;
    }

    get displacement() { return this._displacement; }
    get isMoving() { return this._isMoving; }
    get blockCount() { return this._blocks.length; }

    /**
     * 移動体の構成ブロック一覧を返す（相対座標）
     */
    GetBlocks() {
        return this._blocks.map(b => ({
            rx: b.rx, ry: b.ry, rz: b.rz, blockId: b.blockId
        }));
    }
}

class DirectionBlockManager {
    // 移動体に含めないブロック（自然ブロック）
    static _NON_MOVABLE = new Set(['stone', 'dirt', 'grass', 'sand', 'water']);

    static _DIRS_6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

    // orientation(0-5) → 移動軸と正方向のマッピング
    // front面に水平な1軸
    static _MOVE_AXES = [
        { axis: 'x', sign: 1 },   // 0: front=+Y → X軸, +X
        { axis: 'z', sign: 1 },   // 1: front=-Y → Z軸, +Z
        { axis: 'x', sign: 1 },   // 2: front=+Z → X軸, +X
        { axis: 'y', sign: 1 },   // 3: front=-Z → Y軸, +Y
        { axis: 'z', sign: 1 },   // 4: front=+X → Z軸, +Z
        { axis: 'y', sign: 1 },   // 5: front=-X → Y軸, +Y
    ];

    /**
     * @param {ChunkManager} chunkManager
     * @param {THREE.Scene} scene
     * @param {TextureLoader} textureLoader
     */
    constructor(chunkManager, scene, textureLoader) {
        this._chunkManager = chunkManager;
        this._scene = scene;
        this._textureLoader = textureLoader;
        /** @type {Map<string, MovementBody>} key: "x,y,z" */
        this._bodies = new Map();
        /** @type {Map<string, Object>} key: "x,y,z" メッシュ（BlockGroupMesh使用） */
        this._meshes = new Map();
        /** @type {Map<string, number>} 次の移動方向(1 or -1) key: "x,y,z" */
        this._nextDirections = new Map();
        // キャッシュ
        this._bodiesCache = [];
        this._bodiesCacheDirty = true;
    }

    /**
     * 全移動体を返す
     */
    GetAllBodies() {
        if (this._bodiesCacheDirty) {
            this._bodiesCache = Array.from(this._bodies.values());
            this._bodiesCacheDirty = false;
        }
        return this._bodiesCache;
    }

    /**
     * 指定座標の移動ブロックに紐づく移動体を返す
     */
    GetBodyAt(wx, wy, wz) {
        return this._bodies.get(`${wx},${wy},${wz}`) || null;
    }

    /**
     * 移動体の生成/停止をトグル
     */
    ToggleBody(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        if (this._bodies.has(key)) {
            this._dissolveBody(key);
        } else {
            this._createBody(wx, wy, wz);
        }
    }

    /**
     * 移動体を即座に停止・復元（スイッチOFF用）
     */
    StopBody(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        if (this._bodies.has(key)) {
            this._dissolveBody(key);
        }
    }

    /**
     * 移動体を生成
     */
    _createBody(wx, wy, wz) {
        const orientation = this._getOrientation(wx, wy, wz);
        if (orientation === null) return;

        const moveInfo = DirectionBlockManager._MOVE_AXES[orientation];
        if (!moveInfo) return;

        // BFS連結検出（移動ブロック自身を含む全方向）
        const blocks = this._bfsDetect(wx, wy, wz);
        // 移動ブロック単体では生成しない（隣接する移動可能ブロックが必要）
        if (blocks.length <= 1) return;

        const key = `${wx},${wy},${wz}`;

        // 移動方向決定
        let dir = this._nextDirections.get(key) || moveInfo.sign;

        const body = new MovementBody(wx, wy, wz, orientation, moveInfo.axis, dir, blocks);
        this._bodies.set(key, body);
        this._bodiesCacheDirty = true;

        // ブロックをairに置換 + ライトマップ更新
        for (const b of blocks) {
            const bx = wx + b.rx, by = wy + b.ry, bz = wz + b.rz;
            this._setBlockAt(bx, by, bz, 'air');
            this._updateLight(bx, by, bz, true);
        }

        // 影響チャンクのメッシュ再構築
        this._rebuildAffectedChunks(wx, wy, wz, blocks);

        // 移動体メッシュ生成（BlockGroupMesh を使用）
        if (typeof RotationBodyMesh !== 'undefined') {
            // BlockGroupMesh は body._axisX/Y/Z を参照するので互換オブジェクトを作成
            const compatBody = {
                _axisX: wx, _axisY: wy, _axisZ: wz,
                _blocks: blocks,
                _blockSet: body._blockSet,
                _frontDx: 0, _frontDy: 1, _frontDz: 0, // 回転なし
                _centerX: wx + 0.5, _centerY: wy + 0.5, _centerZ: wz + 0.5
            };
            const mesh = new RotationBodyMesh(compatBody, this._textureLoader, this._chunkManager);
            mesh.Build();
            this._scene.add(mesh.GetGroup());
            this._meshes.set(key, mesh);
        }
    }

    /**
     * 移動体を停止して地形復元
     */
    _dissolveBody(key) {
        const body = this._bodies.get(key);
        if (!body) return;

        const wx = body._dirX;
        const wy = body._dirY;
        const wz = body._dirZ;

        // displacementを整数にスナップ
        const snappedDisp = Math.round(body._displacement);

        // 移動方向のオフセットを計算
        const dx = body._moveAxis === 'x' ? snappedDisp : 0;
        const dy = body._moveAxis === 'y' ? snappedDisp : 0;
        const dz = body._moveAxis === 'z' ? snappedDisp : 0;

        // 新しい移動ブロック位置
        const newDirX = wx + dx;
        const newDirY = wy + dy;
        const newDirZ = wz + dz;

        // ブロックを新しい位置に復元
        for (const b of body._blocks) {
            const bx = wx + b.rx + dx;
            const by = wy + b.ry + dy;
            const bz = wz + b.rz + dz;
            this._setBlockAt(bx, by, bz, b.blockId, b.orientation);
            this._updateLight(bx, by, bz, false);
        }

        // 次回の移動方向を反転して記憶（新しい位置で記憶）
        const newKey = `${newDirX},${newDirY},${newDirZ}`;
        this._nextDirections.set(newKey, -body._moveSign);
        // 元の位置のキーを削除（移動した場合）
        if (key !== newKey) {
            this._nextDirections.delete(key);
        }

        // メッシュ削除
        const mesh = this._meshes.get(key);
        if (mesh) {
            this._scene.remove(mesh.GetGroup());
            mesh.Dispose();
            this._meshes.delete(key);
        }

        this._bodies.delete(key);
        this._bodiesCacheDirty = true;

        // チャンクメッシュ再構築（元の位置と復元位置の両方）
        this._rebuildAffectedChunks(wx, wy, wz, body._blocks);
        if (snappedDisp !== 0) {
            this._rebuildAffectedChunks(newDirX, newDirY, newDirZ, body._blocks);
        }
    }

    /**
     * BFS連結検出（移動ブロック自身を含む全方向）
     */
    _bfsDetect(wx, wy, wz) {
        const blocks = [];
        const visited = new Set();
        const queue = [wx, wy, wz];
        let head = 0;
        visited.add(packBlockKeyD(0, 0, 0));

        while (head < queue.length && blocks.length < 4096) {
            const cx = queue[head], cy = queue[head + 1], cz = queue[head + 2];
            head += 3;

            const blockId = this._getBlockAt(cx, cy, cz);
            if (!blockId || blockId === 'air' || DirectionBlockManager._NON_MOVABLE.has(blockId)) continue;

            const orientation = this._getOrientation(cx, cy, cz) || 0;
            blocks.push({
                rx: cx - wx,
                ry: cy - wy,
                rz: cz - wz,
                blockId,
                orientation
            });

            for (const [ddx, ddy, ddz] of DirectionBlockManager._DIRS_6) {
                const nx = cx + ddx, ny = cy + ddy, nz = cz + ddz;
                const nKey = packBlockKeyD(nx - wx, ny - wy, nz - wz);
                if (visited.has(nKey)) continue;
                visited.add(nKey);

                const nBlock = this._getBlockAt(nx, ny, nz);
                if (!nBlock || nBlock === 'air' || DirectionBlockManager._NON_MOVABLE.has(nBlock)) continue;

                queue.push(nx, ny, nz);
            }
        }

        return blocks;
    }

    /**
     * 毎フレーム更新（移動 + 衝突判定）
     */
    Update(deltaTime) {
        if (this._bodies.size === 0) return;

        const keysToDissolve = [];

        for (const [key, body] of this._bodies) {
            if (!body._isMoving) continue;

            // displacement更新
            body._displacement += body._speed * deltaTime * body._moveSign;

            // 最大距離チェック
            if (Math.abs(body._displacement) >= 16) {
                body._displacement = 16 * body._moveSign;
                keysToDissolve.push(key);
                continue;
            }

            // 整数ステップが変わったか確認
            const intDisp = body._moveSign > 0
                ? Math.floor(body._displacement)
                : Math.ceil(body._displacement);

            if (intDisp !== body._lastIntDisplacement) {
                // 衝突判定: 最前面ブロックの1つ先をチェック
                if (this._checkCollision(body, intDisp)) {
                    // 現在の整数位置で停止（1つ先が衝突なので現在位置は安全）
                    body._displacement = intDisp;
                    keysToDissolve.push(key);
                    continue;
                }
                body._lastIntDisplacement = intDisp;
            }

            // メッシュ位置更新
            const mesh = this._meshes.get(key);
            if (mesh) {
                const group = mesh.GetGroup();
                const axis = body._moveAxis;
                if (axis === 'x') {
                    group.position.x = body._dirX + 0.5 + body._displacement;
                } else if (axis === 'y') {
                    group.position.y = body._dirY + 0.5 + body._displacement;
                } else {
                    // Z軸: worldContainer.scale.z = -1 のため符号反転不要（position.zに直接設定）
                    group.position.z = body._dirZ + 0.5 + body._displacement;
                }
            }
        }

        // 衝突した移動体を解除
        for (const key of keysToDissolve) {
            this._dissolveBody(key);
        }
    }

    /**
     * 衝突判定: 移動方向の最前面ブロック群の1つ先に地形があるか
     */
    _checkCollision(body, intDisp) {
        const axis = body._moveAxis;
        const sign = body._moveSign;
        const wx = body._dirX;
        const wy = body._dirY;
        const wz = body._dirZ;

        // 移動オフセット
        const offX = axis === 'x' ? intDisp : 0;
        const offY = axis === 'y' ? intDisp : 0;
        const offZ = axis === 'z' ? intDisp : 0;

        // 最前面ブロックを検出するため、各(perpendicular1, perpendicular2)ごとに
        // 移動軸方向の最大/最小rxを持つブロックを見つける
        const leadingEdge = new Map(); // key: "perp1,perp2" → max/min axisValue

        for (const b of body._blocks) {
            let axisVal, perpKey;
            if (axis === 'x') {
                axisVal = b.rx;
                perpKey = `${b.ry},${b.rz}`;
            } else if (axis === 'y') {
                axisVal = b.ry;
                perpKey = `${b.rx},${b.rz}`;
            } else {
                axisVal = b.rz;
                perpKey = `${b.rx},${b.ry}`;
            }

            const current = leadingEdge.get(perpKey);
            if (current === undefined) {
                leadingEdge.set(perpKey, axisVal);
            } else if (sign > 0 && axisVal > current) {
                leadingEdge.set(perpKey, axisVal);
            } else if (sign < 0 && axisVal < current) {
                leadingEdge.set(perpKey, axisVal);
            }
        }

        // 各最前面ブロックの1つ先の位置をチェック
        for (const [perpKey, axisVal] of leadingEdge) {
            const [p1, p2] = perpKey.split(',').map(Number);
            let checkX, checkY, checkZ;

            if (axis === 'x') {
                checkX = wx + axisVal + offX + sign;
                checkY = wy + p1;
                checkZ = wz + p2;
            } else if (axis === 'y') {
                checkY = wy + axisVal + offY + sign;
                checkX = wx + p1;
                checkZ = wz + p2;
            } else {
                checkZ = wz + axisVal + offZ + sign;
                checkX = wx + p1;
                checkY = wy + p2;
            }

            const blockId = this._getBlockAt(checkX, checkY, checkZ);
            if (blockId && blockId !== 'air') {
                return true; // 衝突
            }
        }

        return false;
    }

    /**
     * 移動ブロック破壊時の処理
     */
    OnDirectionDestroyed(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        if (this._bodies.has(key)) {
            this._dissolveBody(key);
        }
    }

    // === ヘルパーメソッド（RotationAxisManagerと同じパターン） ===

    _resolve(wx, wy, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.chunkData) return null;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return null;
        return { cd: chunk.chunkData, lx: ((wx % 16) + 16) % 16, ly, lz: ((wz % 16) + 16) % 16 };
    }

    _getBlockAt(wx, wy, wz) {
        const r = this._resolve(wx, wy, wz);
        return r ? r.cd.getBlock(r.lx, r.ly, r.lz) : null;
    }

    _getOrientation(wx, wy, wz) {
        const r = this._resolve(wx, wy, wz);
        return r ? r.cd.getOrientation(r.lx, r.ly, r.lz) : null;
    }

    _setBlockAt(wx, wy, wz, blockId, orientation = 0) {
        const r = this._resolve(wx, wy, wz);
        if (r) r.cd.setBlock(r.lx, r.ly, r.lz, blockId, orientation);
    }

    _updateLight(wx, wy, wz, removed) {
        const lc = this._chunkManager.lightCalculator;
        if (!lc) return;
        const r = this._resolve(wx, wy, wz);
        if (!r) return;
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const neighbors = this._chunkManager._getNeighborChunks(cx, cz);
        if (removed) {
            lc.onBlockRemoved(r.cd, r.lx, r.ly, r.lz, neighbors);
        } else {
            lc.onBlockPlaced(r.cd, r.lx, r.ly, r.lz, neighbors);
        }
    }

    _rebuildAffectedChunks(baseX, baseY, baseZ, blocks) {
        const positions = blocks.map(b => [baseX + b.rx, baseY + b.ry, baseZ + b.rz]);
        positions.push([baseX, baseY, baseZ]);
        this._chunkManager.rebuildChunksAtPositions(positions);
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.MovementBody = MovementBody;
    window.DirectionBlockManager = DirectionBlockManager;
}
