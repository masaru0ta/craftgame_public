/**
 * BlockInteraction.js
 * ブロック操作統合クラス - レイキャスト、ハイライト、破壊・設置を管理
 */
class BlockInteraction {
    static MAX_REACH = 20;  // 最大到達距離（ブロック）

    /** 横4方向 + 真上の隣接オフセット（水フロー・decay スケジュール用） */
    static _ADJACENT_5 = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];

    /** @deprecated BlockOrientation.FaceToTopDir を直接使用 */
    static _FACE_TO_INT = BlockOrientation.FaceToTopDir;

    /** topDir → 面名（BlockOrientation に委譲） */
    static _ROTOR_AXIS_FACE = BlockOrientation.TopDirToFace;

    /**
     * クリックした面がrotorの軸側（front面の反対面）かを判定
     * @param {number} orientation - rotorのorientation (0-23: topDir×4+rotation)
     * @param {string} face - クリックした面名
     * @returns {boolean}
     */
    static _isRotorAxisFace(orientation, face) {
        return BlockOrientation.TopDirToFace[BlockOrientation.GetTopDir(orientation)] === face;
    }

    /**
     * コンストラクタ
     * @param {Player} player - プレイヤー
     * @param {PhysicsWorld} physicsWorld - 物理演算
     * @param {ChunkManager} chunkManager - チャンクマネージャー
     * @param {ChunkStorage} chunkStorage - チャンクストレージ
     * @param {THREE.Scene} scene - Three.jsシーン
     */
    constructor(player, physicsWorld, chunkManager, chunkStorage, scene) {
        this.player = player;
        this.physicsWorld = physicsWorld;
        this.chunkManager = chunkManager;
        this.chunkStorage = chunkStorage;
        this.scene = scene;

        this.highlight = null;
        this.hotbar = null;
        this.currentTarget = null;
        this._onBlockDestroyed = null;
        this._onBlockPlaced = null;
        this._onBlockPlacedAt = null;
        this._onWorkbenchInteract = null;

        // 設置モード（スロットごとに管理: 'normal'/'half'/'stair'）
        this._placementModes = new Map(); // Map<slotIndex, string>
        // 後方互換用ラッパー
        this._halfPlacementModes = new Proxy(this._placementModes, {
            get: (target, prop) => {
                if (prop === 'get') return (key) => target.get(key) === 'half';
                if (prop === 'set') return (key, val) => { target.set(key, val ? 'half' : 'normal'); return target; };
                return target[prop];
            }
        });
        this._longPressTimer = null;          // 長押し検出タイマー
        this._itemUseHandlers = new Map();    // Map<itemStrId, handler>
    }

    /**
     * アイテム使用ハンドラを登録する
     * ハンドラが true を返した場合 placeBlockAt() はその値をそのまま返す。
     * false を返した場合は後続の通常ブロック設置ロジックへ進む。
     * 同一 itemStrId で複数回登録した場合は後から登録したハンドラで上書きする。
     * @param {string} itemStrId - アイテムの block_str_id
     * @param {function(Object, Object): boolean} handler - (target, selectedBlock) => boolean
     */
    RegisterItemUseHandler(itemStrId, handler) {
        this._itemUseHandlers.set(itemStrId, handler);
    }

    /**
     * 初期化
     * @param {Array} blocks - ブロック定義の配列
     * @param {HTMLElement} hotbarContainer - ホットバーのコンテナ要素
     * @param {TextureLoader} [textureLoader] - テクスチャローダー（設置予測用）
     */
    init(blocks, hotbarContainer, textureLoader) {
        this._blocks = blocks;

        // ホットバー初期化
        this.hotbar = new Hotbar(hotbarContainer, blocks);

        // ハイライト初期化
        this.highlight = new BlockHighlight(this.scene);

        // 設置予測初期化
        if (typeof PlacementPreview !== 'undefined' && textureLoader) {
            this.placementPreview = new PlacementPreview(this.scene, textureLoader);
        }
    }

    /**
     * 毎フレーム更新
     */
    update() {
        // レイキャスト実行
        const origin = this.player.getEyePosition();
        const direction = this.player.getLookDirection();
        this.currentTarget = this.physicsWorld.raycast(origin, direction, BlockInteraction.MAX_REACH);

        // 特殊操作ブロックの判定
        const actionLabel = this._getActionLabel(this.currentTarget);
        if (actionLabel) {
            this.highlight.update(this.currentTarget);
            this.highlight.showActionLabel(actionLabel);
        } else {
            this.highlight.update(this.currentTarget);
        }

        // 設置予測更新
        this._updatePlacementPreview();
    }

    /**
     * 設置予測表示を更新
     */
    _updatePlacementPreview() {
        if (!this.placementPreview) return;

        const selectedBlock = this.hotbar ? this.hotbar.getSelectedBlock() : null;
        const isSpecialItem = selectedBlock &&
            (selectedBlock.block_str_id === 'bucket' ||
             selectedBlock.block_str_id === 'bucket_of_water');

        if (!this.currentTarget || !this.currentTarget.hit || !selectedBlock || isSpecialItem) {
            this.placementPreview.hide();
            return;
        }

        // 構造物アイテムの場合は構造物プレビューモードへ
        if (selectedBlock.structure_str_id && this.structurePlacer) {
            const rawRotY = this.player ? BlockOrientation.RotationFromYaw(this.player.getYaw(), 0) : 0;
            const baseRotY = (4 - rawRotY) % 4;
            const rotY = (baseRotY + (this._structureRotY || 0)) % 4;
            const canPlace = this.structurePlacer.CanPlace(
                { x: this.currentTarget.adjacentX, y: this.currentTarget.adjacentY, z: this.currentTarget.adjacentZ },
                selectedBlock, rotY
            );
            this.placementPreview.updateStructure(
                this.currentTarget, selectedBlock, rotY, canPlace, this.structurePlacer
            );
            return;
        }

        // 右クリックで設置ではなく特殊操作になるブロックはゴースト非表示
        const targetBlockId = this.physicsWorld.getBlockAt(
            this.currentTarget.blockX, this.currentTarget.blockY, this.currentTarget.blockZ);
        if (targetBlockId === 'workbench' ||
            targetBlockId === 'switch_off' || targetBlockId === 'switch' ||
            targetBlockId === 'rope_way' ||
            targetBlockId === 'piston_base') {
            this.placementPreview.hide();
            return;
        }
        // sticky_piston: TOP面はブロック設置可、それ以外は特殊操作
        if (targetBlockId === 'sticky_piston') {
            const pistonOri = this.physicsWorld.getOrientationAt(
                this.currentTarget.blockX, this.currentTarget.blockY, this.currentTarget.blockZ);
            if (!BlockInteraction._isRotorAxisFace(pistonOri, this.currentTarget.face)) {
                this.placementPreview.hide();
                return;
            }
        }
        // ロープ選択時にポールをターゲット → ゴースト非表示
        if (targetBlockId === 'pole' && selectedBlock && selectedBlock.block_str_id === 'rope') {
            this.placementPreview.hide();
            return;
        }
        // rotorは穴面以外（操作面）ならゴースト非表示
        if (RotationAxisManager._ROTOR_IDS.has(targetBlockId) && this.rotationAxisManager) {
            const rotorOri = this.physicsWorld.getOrientationAt(
                this.currentTarget.blockX, this.currentTarget.blockY, this.currentTarget.blockZ);
            if (!BlockInteraction._isRotorAxisFace(rotorOri, this.currentTarget.face)) {
                this.placementPreview.hide();
                return;
            }
        }

        // orientation 事前計算
        const slotIndex = this.hotbar ? this.hotbar.selectedSlot : 0;
        const currentMode = this._getPlacementMode(slotIndex, selectedBlock);
        const orientation = this._calculateOrientationForMode(currentMode, selectedBlock, this.currentTarget, this.player.getYaw());

        // 設置可否判定
        const ax = this.currentTarget.adjacentX;
        const ay = this.currentTarget.adjacentY;
        const az = this.currentTarget.adjacentZ;
        const existingBlock = this.physicsWorld.getBlockAt(ax, ay, az);
        const canPlace = (!existingBlock || existingBlock === 'air')
            && !this._intersectsPlayer(ax, ay, az)
            && ay >= 0 && ay < 128;

        this.placementPreview.update(this.currentTarget, selectedBlock, orientation, canPlace, currentMode === 'half', currentMode === 'stair', currentMode === 'slope');
    }

    /**
     * スクリーン座標からレイキャストを実行
     * @param {number} screenX - スクリーンX座標（clientX）
     * @param {number} screenY - スクリーンY座標（clientY）
     * @param {THREE.Camera} camera - Three.jsカメラ
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @returns {Object|null} レイキャスト結果
     */
    raycastFromScreen(screenX, screenY, camera, canvas) {
        const rect = canvas.getBoundingClientRect();
        // スクリーン座標をNDC（-1〜+1）に変換
        const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

        // NDCからワールド座標への逆投影でレイ方向を算出
        const near = new THREE.Vector3(ndcX, ndcY, 0.5);
        near.unproject(camera);
        const rayDir = new THREE.Vector3().subVectors(near, camera.position).normalize();

        // Three.js座標系 → ゲーム座標系（Z反転）
        const origin = { x: camera.position.x, y: camera.position.y, z: -camera.position.z };
        const direction = { x: rayDir.x, y: rayDir.y, z: -rayDir.z };

        // レイキャストは十分な距離で実行し、プレイヤーからの距離でフィルタ
        const result = this.physicsWorld.raycast(origin, direction, BlockInteraction.MAX_REACH * 2);
        if (!result || !result.hit) return result;

        const eyePos = this.player.getEyePosition();
        const dx = (result.blockX + 0.5) - eyePos.x;
        const dy = (result.blockY + 0.5) - eyePos.y;
        const dz = (result.blockZ + 0.5) - eyePos.z;
        if (dx * dx + dy * dy + dz * dz > BlockInteraction.MAX_REACH * BlockInteraction.MAX_REACH) {
            return null;
        }
        return result;
    }

    /**
     * 指定ターゲットのブロックを破壊
     * @param {Object} target - レイキャスト結果
     * @returns {boolean}
     */
    destroyBlockAt(target) {
        if (!target || !target.hit) return false;
        return this.destroyBlock(target.blockX, target.blockY, target.blockZ);
    }

    /**
     * 指定ターゲットの隣接位置にブロックを設置
     * @param {Object} target - レイキャスト結果
     * @returns {boolean}
     */
    placeBlockAt(target) {
        if (!target || !target.hit) return false;

        // 作業台チェック
        const targetBlockId = this.physicsWorld.getBlockAt(target.blockX, target.blockY, target.blockZ);
        if (targetBlockId === 'workbench') {
            if (this._onWorkbenchInteract) this._onWorkbenchInteract();
            return true;
        }

        // スイッチブロックチェック
        if ((targetBlockId === 'switch_off' || targetBlockId === 'switch') && this.rotationAxisManager) {
            this.OnSwitchRightClick(target.blockX, target.blockY, target.blockZ);
            return true;
        }

        // 移動ブロックチェック
        if (targetBlockId === 'direction' && this.directionBlockManager) {
            this.OnDirectionRightClick(target.blockX, target.blockY, target.blockZ);
            return true;
        }

        // ロープウェイチェック
        if (targetBlockId === 'rope_way' && this.ropeWayManager) {
            this.OnRopeWayRightClick(target.blockX, target.blockY, target.blockZ);
            return true;
        }

        // 粘着ピストンチェック（TOP面クリックは通常設置にフォールスルー）
        if (targetBlockId === 'sticky_piston' && this.pistonManager) {
            const pistonOri = this.physicsWorld.getOrientationAt(target.blockX, target.blockY, target.blockZ);
            if (!BlockInteraction._isRotorAxisFace(pistonOri, target.face)) {
                this.pistonManager.Activate(target.blockX, target.blockY, target.blockZ);
                return true;
            }
        }

        // 回転軸ブロックチェック（軸側の面クリックは通常設置扱い）
        if (RotationAxisManager._ROTOR_IDS.has(targetBlockId) && this.rotationAxisManager) {
            const rotorOri = this.physicsWorld.getOrientationAt(target.blockX, target.blockY, target.blockZ);
            if (!BlockInteraction._isRotorAxisFace(rotorOri, target.face)) {
                if (this.player.isSneaking()) {
                    // しゃがみ＋右クリック → 回転体を解除
                    this.rotationAxisManager.DissolveBody(target.blockX, target.blockY, target.blockZ);
                } else {
                    // 通常右クリック → CW→停止→CCW→停止のサイクル
                    this.rotationAxisManager.ToggleBody(target.blockX, target.blockY, target.blockZ);
                }
                return true;
            }
        }

        const selectedBlock = this.hotbar.getSelectedBlock();
        if (!selectedBlock) return false;

        // アイテム使用ハンドラ呼び出し
        const handler = this._itemUseHandlers.get(selectedBlock.block_str_id);
        if (handler) {
            const result = handler(target, selectedBlock);
            if (result) return result;
        }

        // ロープ選択時 → ポールクリックでロープ接続
        if (selectedBlock.block_str_id === 'rope' && this.ropeManager) {
            if (targetBlockId === 'pole') {
                if (this.ropeManager.IsPending()) {
                    this.ropeManager.CompleteConnection(target.blockX, target.blockY, target.blockZ);
                } else {
                    this.ropeManager.StartConnection(target.blockX, target.blockY, target.blockZ);
                }
                return true;
            }
            // ポール以外をクリック → 接続待ちキャンセル
            if (this.ropeManager.IsPending()) {
                this.ropeManager.CancelConnection();
            }
            return false;
        }

        // バケツ選択時 → 水汲み取りチェック
        if (selectedBlock.block_str_id === 'bucket') {
            const origin = this.player.getEyePosition();
            const direction = this.player.getLookDirection();
            const waterHit = this._raycastWater(origin, direction, BlockInteraction.MAX_REACH);
            if (waterHit) {
                return this._scoopWater(waterHit);
            }
            // 水が無ければ通常設置にフォールバック
        }

        // 水入りバケツ選択時 → 水設置
        if (selectedBlock.block_str_id === 'bucket_of_water') {
            return this._pourWater(target);
        }

        // 構造物アイテムの設置
        if (selectedBlock.structure_str_id && this.structurePlacer) {
            const rawRotY = this.player ? BlockOrientation.RotationFromYaw(this.player.getYaw(), 0) : 0;
            const baseRotY = (4 - rawRotY) % 4;
            const rotY = (baseRotY + (this._structureRotY || 0)) % 4;
            const placed = this.structurePlacer.Place(
                { x: target.adjacentX, y: target.adjacentY, z: target.adjacentZ },
                selectedBlock, rotY
            );
            if (placed && this._onBlockPlaced) {
                this._onBlockPlaced(selectedBlock.structure_str_id);
            }
            return placed;
        }

        // orientation 計算
        const slotIndex = this.hotbar ? this.hotbar.selectedSlot : 0;
        const currentMode = this._getPlacementMode(slotIndex, selectedBlock);
        const orientation = this._calculateOrientationForMode(currentMode, selectedBlock, target, this.player.getYaw());

        // ハーフ/階段/スロープモード時は placeBlock（メッシュ再構築含む）の前に shape を設定
        if (currentMode === 'half' || currentMode === 'stair' || currentMode === 'slope') {
            const cx = Math.floor(target.adjacentX / 16);
            const cz = Math.floor(target.adjacentZ / 16);
            const chunk = this.chunkManager.chunks.get(`${cx},${cz}`);
            if (chunk && chunk.chunkData && typeof chunk.chunkData.setShape === 'function') {
                const lx = ((target.adjacentX % 16) + 16) % 16;
                const lz = ((target.adjacentZ % 16) + 16) % 16;
                const ly = target.adjacentY - chunk.chunkData.baseY;
                chunk.chunkData.setShape(lx, ly, lz, currentMode);
            }
        }
        const placed = this.placeBlock(target.adjacentX, target.adjacentY, target.adjacentZ, selectedBlock.block_str_id, orientation);
        if (placed && this._onBlockPlaced) {
            this._onBlockPlaced(selectedBlock.block_str_id);
        }
        return placed;
    }

    /**
     * 現在のターゲットブロック情報を取得
     * @returns {Object|null}
     */
    getTargetBlock() {
        return this.currentTarget;
    }

    /**
     * マウスダウンイベント処理
     * 右クリック長押し（300ms）で形状切替可能ブロックの設置モードを切り替える
     * @param {MouseEvent} event
     * @returns {boolean} 処理が実行されたか
     */
    handleMouseDown(event) {
        event.preventDefault();

        if (event.button === 2) {
            const selectedBlock = this.hotbar ? this.hotbar.getSelectedBlock() : null;

            if (selectedBlock && (selectedBlock.half_placeable || selectedBlock.stair_placeable || selectedBlock.slope_placeable)) {
                // 形状切替可能ブロック: 長押しタイマー開始（設置は mouseup 時に行う）
                const slotIndex = this.hotbar.selectedSlot;
                clearTimeout(this._longPressTimer);
                this._longPressTimer = setTimeout(() => {
                    this._longPressTimer = null;
                    // 300ms 経過 → モード切り替え（設置しない）
                    const current = this._placementModes.get(slotIndex) || 'normal';
                    const next = this._getNextPlacementMode(selectedBlock, current);
                    this._placementModes.set(slotIndex, next);
                    this.hotbar.setPlacementMode(slotIndex, next);
                }, 300);
                return true;
            }

            // 形状切替不可: 従来通り即時設置
            if (this.currentTarget) {
                return this.placeBlockAt(this.currentTarget);
            }
            return false;
        }

        if (!this.currentTarget) return false;

        if (event.button === 0) {
            // 左クリック - 破壊
            return this.destroyBlockAt(this.currentTarget);
        }

        return false;
    }

    /**
     * マウスアップイベント処理
     * 長押しタイマーが残っている（＝短押し）場合は通常設置を行う
     * @param {MouseEvent} event
     * @returns {boolean} 処理が実行されたか
     */
    handleMouseUp(event) {
        if (event.button === 2 && this._longPressTimer !== null) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
            // 短押し（< 300ms）→ 現在のモードでブロック設置
            if (this.currentTarget) {
                return this.placeBlockAt(this.currentTarget);
            }
        }
        return false;
    }

    /**
     * マウスホイールイベント処理
     * @param {WheelEvent} event
     */
    handleWheel(event) {
        this.hotbar.handleWheel(event);
    }

    /**
     * ブロックを破壊
     * @param {number} x - ワールドX座標
     * @param {number} y - ワールドY座標
     * @param {number} z - ワールドZ座標
     * @returns {boolean} 成功したか
     */
    destroyBlock(x, y, z) {
        // 現在のブロックを取得
        const currentBlock = this.physicsWorld.getBlockAt(x, y, z);
        if (!currentBlock || currentBlock === 'air') {
            return false;
        }

        // チャンク座標を計算
        const chunkX = Math.floor(x / 16);
        const chunkZ = Math.floor(z / 16);
        const localX = ((x % 16) + 16) % 16;
        const localZ = ((z % 16) + 16) % 16;

        // チャンクデータを取得
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = this.chunkManager.chunks.get(chunkKey);
        if (!chunk || !chunk.chunkData) {
            return false;
        }

        // ワールドY → ローカルY変換
        const localY = y - chunk.chunkData.baseY;

        // ローカルY範囲外チェック
        if (localY < 0) {
            return false;
        }

        // linked_destruction チェック（構造物全体の連鎖破壊）
        if (this.structurePlacer && typeof chunk.chunkData.getStructureInstance === 'function') {
            const instanceInfo = chunk.chunkData.getStructureInstance(localX, localY, localZ);
            if (instanceInfo) {
                const result = this.structurePlacer.DestroyLinked(instanceInfo);
                if (result.destroyed) {
                    if (this._onBlockDestroyed) {
                        this._onBlockDestroyed(result.dropItemId, x, y, z);
                    }
                }
                return result.destroyed;
            }
        }

        // 回転軸ブロック破壊時は回転体を解除
        if (RotationAxisManager._ROTOR_IDS.has(currentBlock) && this.rotationAxisManager) {
            this.rotationAxisManager.OnAxisDestroyed(x, y, z);
        }

        // ロープ付きポール破壊時は結び先を復元
        if (currentBlock === 'pole_with_rope' && this.ropeManager) {
            this.ropeManager.OnPoleDestroyed(x, y, z);
        }

        // ブロックをairに置換
        chunk.chunkData.setBlock(localX, localY, localZ, 'air');

        // 破壊コールバック発火（座標も渡す）
        if (this._onBlockDestroyed) {
            this._onBlockDestroyed(currentBlock, x, y, z);
        }

        // ライトマップ更新（クロスチャンク対応）
        let affectedNeighbors = new Set();
        if (this.chunkManager.lightCalculator) {
            const neighborChunks = this.chunkManager._getNeighborChunks(chunkX, chunkZ);
            affectedNeighbors = this.chunkManager.lightCalculator.onBlockRemoved(
                chunk.chunkData, localX, localY, localZ, neighborChunks
            ) || new Set();
        }

        // メッシュを再構築（チャンク境界の隣接チャンクも含む）
        this.chunkManager.rebuildChunksAtPositions([[x, y, z]], affectedNeighbors);

        // 隣接・真上の水ブロックにフロートリガーをスケジュール（壁・床破壊で水が流れ出す）
        this._scheduleAdjacentWaterFlow(x, y, z);

        // IndexedDBに保存（非同期）
        this._saveChunk(chunkX, chunkZ, chunk.chunkData);

        return true;
    }

    /**
     * ブロックを設置
     * @param {number} x - ワールドX座標
     * @param {number} y - ワールドY座標
     * @param {number} z - ワールドZ座標
     * @param {string} blockStrId - 設置するブロックID
     * @param {number} [orientation=0] - ブロックの向き（0〜23）。カスタムブロック用
     * @returns {boolean} 成功したか
     */
    placeBlock(x, y, z, blockStrId, orientation = 0) {
        // 現在のブロックをチェック（airでなければ設置不可）
        const currentBlock = this.physicsWorld.getBlockAt(x, y, z);
        if (currentBlock && currentBlock !== 'air') {
            return false;
        }

        // プレイヤーとの重複チェック
        if (this._intersectsPlayer(x, y, z)) {
            return false;
        }

        // チャンク座標を計算
        const chunkX = Math.floor(x / 16);
        const chunkZ = Math.floor(z / 16);
        const localX = ((x % 16) + 16) % 16;
        const localZ = ((z % 16) + 16) % 16;

        // チャンクデータを取得
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = this.chunkManager.chunks.get(chunkKey);
        if (!chunk || !chunk.chunkData) {
            return false;
        }

        // ワールドY → ローカルY変換
        const localY = y - chunk.chunkData.baseY;

        // ローカルY範囲チェック
        if (localY < 0 || localY >= 128) {
            return false;
        }

        // ブロックを設置（orientation付き）
        chunk.chunkData.setBlock(localX, localY, localZ, blockStrId, orientation);

        // 水ブロック設置時はスケジュールティックに登録（水の流れ）
        if (blockStrId === 'water' && this.scheduleTickEngine) {
            this.scheduleTickEngine.schedule(x, y, z, 'water', 0, { dist: 0 });
        }

        // 設置コールバック発火（座標付き、orientation付き）
        if (this._onBlockPlacedAt) {
            this._onBlockPlacedAt(x, y, z, blockStrId, orientation);
        }

        // ライトマップ更新（クロスチャンク対応）
        let affectedNeighbors = new Set();
        if (this.chunkManager.lightCalculator) {
            const neighborChunks = this.chunkManager._getNeighborChunks(chunkX, chunkZ);
            affectedNeighbors = this.chunkManager.lightCalculator.onBlockPlaced(
                chunk.chunkData, localX, localY, localZ, neighborChunks
            ) || new Set();
        }

        // メッシュを再構築（チャンク境界の隣接チャンクも含む）
        this.chunkManager.rebuildChunksAtPositions([[x, y, z]], affectedNeighbors);

        // IndexedDBに保存（非同期）
        this._saveChunk(chunkX, chunkZ, chunk.chunkData);

        return true;
    }

    /**
     * プレイヤーとの重複をチェック
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    _intersectsPlayer(x, y, z) {
        const blockAABB = {
            minX: x,
            minY: y,
            minZ: z,
            maxX: x + 1,
            maxY: y + 1,
            maxZ: z + 1
        };

        const playerAABB = this.player.getAABB();

        return blockAABB.minX < playerAABB.maxX && blockAABB.maxX > playerAABB.minX &&
               blockAABB.minY < playerAABB.maxY && blockAABB.maxY > playerAABB.minY &&
               blockAABB.minZ < playerAABB.maxZ && blockAABB.maxZ > playerAABB.minZ;
    }

    /**
     * チャンクを保存（非同期）
     * @param {number} chunkX
     * @param {number} chunkZ
     * @param {ChunkData} chunkData
     */
    async _saveChunk(chunkX, chunkZ, chunkData) {
        // メモリキャッシュに即座に保存（同期リロード用）
        const key = `${chunkX},${chunkZ}`;
        this.chunkManager.modifiedChunkCache.set(key, chunkData.getSerializedData());

        // IndexedDBにも非同期で保存（ページリロード用）
        try {
            const worldName = this.chunkManager.worldName;
            await this.chunkStorage.save(worldName, chunkX, chunkZ, chunkData);
        } catch (error) {
            console.error('Failed to save chunk:', error);
        }
    }

    /**
     * ブロック破壊時コールバックを設定
     * @param {Function} callback - (blockStrId: string, x: number, y: number, z: number) => void
     */
    onBlockDestroyed(callback) {
        this._onBlockDestroyed = callback;
    }

    /**
     * ブロック設置時コールバックを設定
     * @param {Function} callback - (blockStrId: string) => void
     */
    onBlockPlaced(callback) {
        this._onBlockPlaced = callback;
    }

    /**
     * ブロック設置時コールバックを設定（座標付き）
     * @param {Function} callback - (x: number, y: number, z: number, blockStrId: string, orientation: number) => void
     */
    onBlockPlacedAt(callback) {
        this._onBlockPlacedAt = callback;
    }

    /**
     * 作業台右クリック時コールバックを設定
     * @param {Function} callback - () => void
     */
    onWorkbenchInteract(callback) {
        this._onWorkbenchInteract = callback;
    }

    /**
     * 特殊操作ブロックのアクションラベルを返す（該当しなければnull）
     * @param {Object|null} target - レイキャスト結果
     * @returns {string|null}
     */
    _getActionLabel(target) {
        if (!target || !target.hit) return null;
        const blockId = this.physicsWorld.getBlockAt(target.blockX, target.blockY, target.blockZ);
        if (blockId === 'workbench') return '作業台';
        if (blockId === 'switch_off' || blockId === 'switch') return 'スイッチ';
        if (RotationAxisManager._ROTOR_IDS.has(blockId) && this.rotationAxisManager) {
            const ori = this.physicsWorld.getOrientationAt(target.blockX, target.blockY, target.blockZ);
            if (!BlockInteraction._isRotorAxisFace(ori, target.face)) return '回転';
        }
        if (blockId === 'direction' && this.directionBlockManager) return '移動';
        if (blockId === 'rope_way' && this.ropeWayManager) return 'ロープウェイ';
        if (blockId === 'sticky_piston' && this.pistonManager) {
            const ori = this.physicsWorld.getOrientationAt(target.blockX, target.blockY, target.blockZ);
            if (!BlockInteraction._isRotorAxisFace(ori, target.face)) return 'ピストン';
        }
        return null;
    }

    /**
     * 移動ブロックの右クリック処理
     * @param {number} wx - ワールドX座標
     * @param {number} wy - ワールドY座標
     * @param {number} wz - ワールドZ座標
     */
    OnDirectionRightClick(wx, wy, wz) {
        if (!this.directionBlockManager) return;
        this.directionBlockManager.ToggleBody(wx, wy, wz);
    }

    /**
     * ロープウェイブロックの右クリック処理
     */
    OnRopeWayRightClick(wx, wy, wz) {
        if (!this.ropeWayManager) return;
        this.ropeWayManager.ToggleBody(wx, wy, wz);
    }

    /**
     * スイッチブロックの右クリック処理
     * @param {number} wx - ワールドX座標
     * @param {number} wy - ワールドY座標
     * @param {number} wz - ワールドZ座標
     */
    OnSwitchRightClick(wx, wy, wz) {
        const currentBlock = this.physicsWorld.getBlockAt(wx, wy, wz);
        const turningOn = (currentBlock === 'switch_off');
        const newBlockId = turningOn ? 'switch' : 'switch_off';

        // ブロックIDを切り替え
        const chunkX = Math.floor(wx / 16);
        const chunkZ = Math.floor(wz / 16);
        const chunk = this.chunkManager.chunks.get(`${chunkX},${chunkZ}`);
        if (!chunk || !chunk.chunkData) return;
        const localX = ((wx % 16) + 16) % 16;
        const localZ = ((wz % 16) + 16) % 16;
        const localY = wy - chunk.chunkData.baseY;
        const orientation = chunk.chunkData.getOrientation(localX, localY, localZ);
        chunk.chunkData.setBlock(localX, localY, localZ, newBlockId, orientation);

        const range = 5;

        // マンハッタン距離5以内のrotorを検索して操作
        const ram = this.rotationAxisManager;
        // チャンクデータ上のrotorを検索
        const rotorPositions = [];
        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                for (let dz = -range; dz <= range; dz++) {
                    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > range) continue;
                    const rx = wx + dx, ry = wy + dy, rz = wz + dz;
                    const blockId = this.physicsWorld.getBlockAt(rx, ry, rz);
                    if (RotationAxisManager._ROTOR_IDS.has(blockId)) {
                        rotorPositions.push({ x: rx, y: ry, z: rz });
                    }
                }
            }
        }
        // 回転体内のrotorも検索（回転体生成時にairに置換されるため）
        for (const [, body] of ram._bodies) {
            for (const b of body._blocks) {
                if (!RotationAxisManager._ROTOR_IDS.has(b.blockId)) continue;
                const rx = body._axisX + b.rx;
                const ry = body._axisY + b.ry;
                const rz = body._axisZ + b.rz;
                const dist = Math.abs(rx - wx) + Math.abs(ry - wy) + Math.abs(rz - wz);
                if (dist > range) continue;
                // 既にリストにあるか確認
                if (!rotorPositions.some(p => p.x === rx && p.y === ry && p.z === rz)) {
                    rotorPositions.push({ x: rx, y: ry, z: rz });
                }
            }
        }
        // 各rotorを操作
        for (const pos of rotorPositions) {
            if (turningOn) {
                ram.ToggleBody(pos.x, pos.y, pos.z);
            } else {
                const body = ram.GetBodyAt(pos.x, pos.y, pos.z);
                if (body) {
                    ram.ToggleBody(pos.x, pos.y, pos.z);
                }
            }
        }

        // マンハッタン距離5以内のdirectionを検索して操作
        const dbm = this.directionBlockManager;
        if (dbm) {
            const dirPositions = [];
            // チャンクデータ上のdirectionを検索
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    for (let dz = -range; dz <= range; dz++) {
                        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > range) continue;
                        const rx = wx + dx, ry = wy + dy, rz = wz + dz;
                        const blockId = this.physicsWorld.getBlockAt(rx, ry, rz);
                        if (blockId === 'direction') {
                            dirPositions.push({ x: rx, y: ry, z: rz });
                        }
                    }
                }
            }
            // 移動体内のdirectionも検索（移動体生成時にairに置換されるため）
            for (const [, body] of dbm._bodies) {
                for (const b of body._blocks) {
                    if (b.blockId !== 'direction') continue;
                    const rx = body._dirX + b.rx;
                    const ry = body._dirY + b.ry;
                    const rz = body._dirZ + b.rz;
                    const dist = Math.abs(rx - wx) + Math.abs(ry - wy) + Math.abs(rz - wz);
                    if (dist > range) continue;
                    if (!dirPositions.some(p => p.x === rx && p.y === ry && p.z === rz)) {
                        dirPositions.push({ x: rx, y: ry, z: rz });
                    }
                }
            }
            // 各directionを操作
            for (const pos of dirPositions) {
                if (turningOn) {
                    dbm.ToggleBody(pos.x, pos.y, pos.z);
                } else {
                    const body = dbm.GetBodyAt(pos.x, pos.y, pos.z);
                    if (body) {
                        dbm.ToggleBody(pos.x, pos.y, pos.z);
                    }
                }
            }
        }

        // マンハッタン距離5以内のrope_wayを検索して操作
        const rwm = this.ropeWayManager;
        if (rwm) {
            const rwPositions = [];
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    for (let dz = -range; dz <= range; dz++) {
                        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > range) continue;
                        const rx = wx + dx, ry = wy + dy, rz = wz + dz;
                        const blockId = this.physicsWorld.getBlockAt(rx, ry, rz);
                        if (blockId === 'rope_way') {
                            rwPositions.push({ x: rx, y: ry, z: rz });
                        }
                    }
                }
            }
            // 移動体内のrope_wayも検索
            for (const [, body] of rwm._bodies) {
                for (const b of body._blocks) {
                    if (b.blockId !== 'rope_way') continue;
                    const rx = body._originX + b.rx;
                    const ry = body._originY + b.ry;
                    const rz = body._originZ + b.rz;
                    const dist = Math.abs(rx - wx) + Math.abs(ry - wy) + Math.abs(rz - wz);
                    if (dist > range) continue;
                    if (!rwPositions.some(p => p.x === rx && p.y === ry && p.z === rz)) {
                        rwPositions.push({ x: rx, y: ry, z: rz });
                    }
                }
            }
            for (const pos of rwPositions) {
                if (turningOn) {
                    rwm.ToggleBody(pos.x, pos.y, pos.z);
                } else {
                    const body = rwm.GetBodyAt(pos.x, pos.y, pos.z);
                    if (body) {
                        rwm.StopBody(pos.x, pos.y, pos.z);
                    }
                }
            }
        }

        // マンハッタン距離5以内のsticky_pistonを検索して作動
        const psm = this.pistonManager;
        if (psm) {
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    for (let dz = -range; dz <= range; dz++) {
                        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > range) continue;
                        const rx = wx + dx, ry = wy + dy, rz = wz + dz;
                        if (this.physicsWorld.getBlockAt(rx, ry, rz) === 'sticky_piston') {
                            psm.Activate(rx, ry, rz);
                        }
                    }
                }
            }
        }

        // メッシュ再構築（チャンク境界の隣接チャンクも含む）
        this.chunkManager.rebuildChunksAtPositions([[wx, wy, wz]]);
    }

    /**
     * ブロック定義をblock_str_idで検索
     * @param {string} blockStrId
     * @returns {Object|null}
     */
    _getBlockDef(blockStrId) {
        if (!this._blocks) return null;
        return this._blocks.find(b => b.block_str_id === blockStrId) || null;
    }

    /**
     * (x,y,z) の横4方向と真上にある水ブロックにフロートリガーをスケジュールする。
     * ブロック破壊・水汲み取り後に呼ぶことで、隣接水が空きスペースへ流れ込む。
     * @param {number} x @param {number} y @param {number} z
     */
    _scheduleAdjacentWaterFlow(x, y, z) {
        if (!this.scheduleTickEngine) return;
        const cm = this.chunkManager;
        for (const [dx, dy, dz] of BlockInteraction._ADJACENT_5) {
            const nx = x + dx, ny = y + dy, nz = z + dz;
            if (TickHelpers.getBlock(cm, nx, ny, nz) !== 'water') continue;
            const orientation = TickHelpers.getOrientation(cm, nx, ny, nz);
            this.scheduleTickEngine.schedule(nx, ny, nz, 'water', 2, { dist: orientation });
        }
    }

    /**
     * 水ブロック専用レイキャスト
     * 通常レイキャストと同じステップ走査だが、waterをヒット対象とする
     * @param {Object} origin - 開始位置 {x, y, z}
     * @param {Object} direction - 方向ベクトル {x, y, z}
     * @param {number} maxDistance - 最大到達距離
     * @returns {Object|null} { hit, blockX, blockY, blockZ }
     */
    _raycastWater(origin, direction, maxDistance) {
        const step = 0.05;
        const steps = Math.ceil(maxDistance / step);
        let prevX = NaN, prevY = NaN, prevZ = NaN;
        for (let i = 0; i <= steps; i++) {
            const t = i * step;
            const x = Math.floor(origin.x + direction.x * t);
            const y = Math.floor(origin.y + direction.y * t);
            const z = Math.floor(origin.z + direction.z * t);
            if (x === prevX && y === prevY && z === prevZ) continue;
            prevX = x; prevY = y; prevZ = z;
            if (this.physicsWorld.getBlockAt(x, y, z) === 'water') {
                return { hit: true, blockX: x, blockY: y, blockZ: z };
            }
        }
        return null;
    }

    /**
     * バケツで水を汲み取る
     * @param {Object} waterHit - 水ブロックのレイキャスト結果
     * @returns {boolean} 成功したか
     */
    _scoopWater(waterHit) {
        if (!waterHit || !waterHit.hit) return false;

        const { blockX: x, blockY: y, blockZ: z } = waterHit;

        // チャンク座標解決 & 水源（orientation=0）チェック
        const r = TickHelpers._resolve(this.chunkManager, x, y, z);
        if (!r) return false;
        if (r.cd.getOrientation(r.lx, r.ly, r.lz) !== 0) return false;

        // 水ブロックを除去
        const { cx: chunkX, cz: chunkZ } = r;
        r.cd.setBlock(r.lx, r.ly, r.lz, 'air');

        // 隣接水に対してトリガーをスケジュール:
        //   水源（orientation=0）→ フロートリガー（空き位置に流れ込む）
        //   流れ水（orientation>0）→ decayトリガー（水源を失い連鎖消滅）
        if (this.scheduleTickEngine) {
            const cm = this.chunkManager;
            for (const [dx, dy, dz] of BlockInteraction._ADJACENT_5) {
                const nx = x + dx, ny = y + dy, nz = z + dz;
                if (TickHelpers.getBlock(cm, nx, ny, nz) !== 'water') continue;
                const ori = TickHelpers.getOrientation(cm, nx, ny, nz);
                const meta = ori === 0 ? { dist: 0 } : { decay: true };
                this.scheduleTickEngine.schedule(nx, ny, nz, 'water', 2, meta);
            }
            // 真下は常に decay（支えを失った落下水が消える）
            if (TickHelpers.getBlock(cm, x, y - 1, z) === 'water')
                this.scheduleTickEngine.schedule(x, y - 1, z, 'water', 2, { decay: true });
        }

        // ホットバーをbucket_of_waterに変更
        const slot = this.hotbar.getSelectedSlot();
        const waterBucketDef = this._getBlockDef('bucket_of_water');
        if (waterBucketDef) {
            this.hotbar.setSlotBlock(slot, waterBucketDef);
        }

        // メッシュ再構築（チャンク境界の隣接チャンクも含む）
        this.chunkManager.rebuildChunksAtPositions([[x, y, z]]);

        // IndexedDBに保存
        this._saveChunk(chunkX, chunkZ, r.cd);

        return true;
    }

    /**
     * 水入りバケツから水を設置する
     * @param {Object} target - 通常レイキャスト結果（隣接位置に設置）
     * @returns {boolean} 成功したか
     */
    _pourWater(target) {
        if (!target || !target.hit) return false;

        const x = target.adjacentX;
        const y = target.adjacentY;
        const z = target.adjacentZ;

        // 設置制限チェック: 既存ブロック
        const currentBlock = this.physicsWorld.getBlockAt(x, y, z);
        if (currentBlock && currentBlock !== 'air') return false;

        // 設置制限チェック: プレイヤー重複
        if (this._intersectsPlayer(x, y, z)) return false;

        // 設置制限チェック: Y座標範囲
        if (y < 0 || y >= 128) return false;

        // 水ブロックを設置
        const chunkX = Math.floor(x / 16);
        const chunkZ = Math.floor(z / 16);
        const localX = ((x % 16) + 16) % 16;
        const localZ = ((z % 16) + 16) % 16;
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = this.chunkManager.chunks.get(chunkKey);
        if (!chunk || !chunk.chunkData) return false;

        const localY = y - chunk.chunkData.baseY;
        if (localY < 0 || localY >= 128) return false;

        chunk.chunkData.setBlock(localX, localY, localZ, 'water');

        // スケジュールティックに登録（水の流れ）
        if (this.scheduleTickEngine) {
            this.scheduleTickEngine.schedule(x, y, z, 'water', 0, { dist: 0 });
        }

        // ホットバーをbucketに変更
        const slot = this.hotbar.getSelectedSlot();
        const bucketDef = this._getBlockDef('bucket');
        if (bucketDef) {
            this.hotbar.setSlotBlock(slot, bucketDef);
        }

        // 設置コールバック発火（マルチプレイ同期用）
        if (this._onBlockPlacedAt) {
            this._onBlockPlacedAt(x, y, z, 'water', 0);
        }

        // メッシュ再構築（チャンク境界の隣接チャンクも含む）
        this.chunkManager.rebuildChunksAtPositions([[x, y, z]]);

        // IndexedDBに保存
        this._saveChunk(chunkX, chunkZ, chunk.chunkData);

        return true;
    }

    /**
     * ブロック定義のフラグ（rotatable/sidePlaceable）に基づいてorientを計算する統一メソッド
     * カスタムブロックは暗黙的に両フラグONとして扱う
     * @param {Object} blockDef - ブロック定義
     * @param {Object} target - レイキャスト結果
     * @param {number} playerYaw - プレイヤーのYaw角
     * @returns {number} orient格納値 (0〜23)
     */
    _calculateBlockOrientation(blockDef, target, playerYaw) {
        const isCustom = blockDef.shape_type === 'custom';
        const rotatable = isCustom || blockDef.rotatable || false;
        const sidePlaceable = isCustom || blockDef.sidePlaceable || false;

        if (!rotatable && !sidePlaceable) {
            return 0;
        }

        // sidePlaceable: クリック面からtopDirを決定
        const face = BlockOrientation.FaceToTopDir[target.face] || 0;
        const topDir = sidePlaceable ? face : 0;

        // rotation の決定
        let rotation = 0;
        if (rotatable) {
            if (topDir <= 1) {
                // 上面/下面設置時: プレイヤーyawからrotationを算出
                rotation = BlockOrientation.RotationFromYaw(playerYaw, topDir);
            } else if (isCustom) {
                // カスタムブロックの側面: ヒット位置からrotationを決定
                rotation = BlockOrientation.SideRotationFromHit(face, target);
            }
            // 通常ブロック側面設置時: rotation=0固定（front面が下を向く方向）
        }

        return BlockOrientation.Encode(topDir, rotation);
    }

    /**
     * 回転軸ブロック / 設置方向可変ブロックの orientation を決定する
     * @param {string} face - クリック面
     * @returns {number} 0〜5
     */
    _calculateOrientableOrientation(face) {
        return BlockOrientation.FaceToTopDir[face] || 0;
    }

    /**
     * ハーフブロックの orientation を決定する
     * クリック面の反対側にtopDirを設定（ハーフがクリック面に寄る配置）
     * topDir * 4 形式で返す（shapeは呼び出し側で 'half' に設定）
     * @param {string} face - クリック面
     * @returns {number} topDir * 4（0, 4, 8, 12, 16, 20）
     */
    _calculateHalfOrientation(face) {
        const topDir = BlockOrientation.FaceToTopDir[face] || 0;
        return topDir * 4;
    }

    /**
     * 設置モードに応じた orientation を計算する共通メソッド
     * @param {string} mode - 'normal'/'half'/'stair'
     * @param {Object} blockDef - ブロック定義
     * @param {Object} target - レイキャスト結果
     * @param {number} playerYaw - プレイヤーの yaw 角
     * @returns {number} orient値 (0〜23)
     */
    _calculateOrientationForMode(mode, blockDef, target, playerYaw) {
        if (mode === 'half') return this._calculateHalfOrientation(target.face);
        if (mode === 'stair') return this._calculateStairOrientation(target.face, playerYaw);
        if (mode === 'slope') return this._calculateStairOrientation(target.face, playerYaw);
        return this._calculateBlockOrientation(blockDef, target, playerYaw);
    }

    /**
     * 階段ブロックの orientation を決定する
     * topDir はクリック面から、rotation はプレイヤーの yaw から決定する
     * @param {string} face - クリック面
     * @param {number} playerYaw - プレイヤーの yaw 角
     * @returns {number} topDir * 4 + rotation (0〜23)
     */
    _calculateStairOrientation(face, playerYaw) {
        const topDir = BlockOrientation.FaceToTopDir[face] || 0;
        const rotation = BlockOrientation.RotationFromYaw(playerYaw, topDir);
        return BlockOrientation.Encode(topDir, rotation);
    }

    /**
     * 現在のスロットの設置モードを取得（ブロックのフラグを考慮）
     * @param {number} slotIndex - スロットインデックス
     * @param {Object} block - ブロック定義
     * @returns {string} 'normal'/'half'/'stair'
     */
    _getPlacementMode(slotIndex, block) {
        const mode = this._placementModes.get(slotIndex) || 'normal';
        if (mode === 'half' && block && block.half_placeable) return 'half';
        if (mode === 'stair' && block && block.stair_placeable) return 'stair';
        if (mode === 'slope' && block && block.slope_placeable) return 'slope';
        return 'normal';
    }

    /**
     * 次の設置モードを計算（サイクル切り替え）
     * @param {Object} block - ブロック定義
     * @param {string} currentMode - 現在のモード
     * @returns {string} 次のモード
     */
    _getNextPlacementMode(block, currentMode) {
        const modes = ['normal'];
        if (block.half_placeable) modes.push('half');
        if (block.stair_placeable) modes.push('stair');
        if (block.slope_placeable) modes.push('slope');
        const idx = modes.indexOf(currentMode);
        return modes[(idx + 1) % modes.length];
    }

    /**
     * リソースを解放
     */
    dispose() {
        if (this.highlight) {
            this.highlight.dispose();
        }
        if (this.placementPreview) {
            this.placementPreview.dispose();
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.BlockInteraction = BlockInteraction;
}
