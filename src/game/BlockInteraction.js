/**
 * BlockInteraction.js
 * ブロック操作統合クラス - レイキャスト、ハイライト、破壊・設置を管理
 */
class BlockInteraction {
    static MAX_REACH = 20;  // 最大到達距離（ブロック）

    /** 横4方向 + 真上の隣接オフセット（水フロー・decay スケジュール用） */
    static _ADJACENT_5 = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];

    /** カスタムブロック orientation 計算用 face 文字列 → 数値マップ */
    static _FACE_TO_INT = { top: 0, bottom: 1, north: 2, south: 3, east: 4, west: 5 };

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

        // ハーフブロック設置モード（スロットごとに管理）
        this._halfPlacementModes = new Map(); // Map<slotIndex, boolean>
        this._longPressTimer = null;          // 長押し検出タイマー
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

        // ハイライト更新
        this.highlight.update(this.currentTarget);

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

        // orientation 事前計算
        let orientation = 0;
        if (selectedBlock.orientable) {
            orientation = this._calculateOrientableOrientation(this.currentTarget.face);
        } else if (selectedBlock.shape_type === 'custom') {
            orientation = this._calculateOrientation(this.currentTarget, this.player.getYaw());
        } else if (selectedBlock.half_placeable) {
            const slotIndex = this.hotbar ? this.hotbar.selectedSlot : 0;
            const isHalfMode = this._halfPlacementModes.get(slotIndex) || false;
            if (isHalfMode) {
                orientation = this._calculateHalfOrientation(this.currentTarget.face);
            }
        }

        // 設置可否判定
        const ax = this.currentTarget.adjacentX;
        const ay = this.currentTarget.adjacentY;
        const az = this.currentTarget.adjacentZ;
        const existingBlock = this.physicsWorld.getBlockAt(ax, ay, az);
        const canPlace = (!existingBlock || existingBlock === 'air')
            && !this._intersectsPlayer(ax, ay, az)
            && ay >= 0 && ay < 128;

        this.placementPreview.update(this.currentTarget, selectedBlock, orientation, canPlace);
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

        // 回転軸ブロックチェック
        if (targetBlockId === 'rotor' && this.rotationAxisManager) {
            this.rotationAxisManager.ToggleBody(target.blockX, target.blockY, target.blockZ);
            return true;
        }

        const selectedBlock = this.hotbar.getSelectedBlock();
        if (!selectedBlock) return false;

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

        // orientation 計算
        let orientation = 0;
        if (selectedBlock.orientable) {
            // 設置方向可変ブロック: 設置面の反対方向に向く（0-5）
            orientation = this._calculateOrientableOrientation(target.face);
        } else if (selectedBlock.shape_type === 'custom') {
            orientation = this._calculateOrientation(target, this.player.getYaw());
        } else if (selectedBlock.half_placeable) {
            const slotIndex = this.hotbar ? this.hotbar.selectedSlot : 0;
            const isHalfMode = this._halfPlacementModes.get(slotIndex) || false;
            if (isHalfMode) {
                orientation = this._calculateHalfOrientation(target.face);
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
     * 右クリック長押し（300ms）で half_placeable ブロックの設置モードを切り替える
     * @param {MouseEvent} event
     * @returns {boolean} 処理が実行されたか
     */
    handleMouseDown(event) {
        event.preventDefault();

        if (event.button === 2) {
            const selectedBlock = this.hotbar ? this.hotbar.getSelectedBlock() : null;

            if (selectedBlock && selectedBlock.half_placeable) {
                // half_placeable=true: 長押しタイマー開始（設置は mouseup 時に行う）
                const slotIndex = this.hotbar.selectedSlot;
                clearTimeout(this._longPressTimer);
                this._longPressTimer = setTimeout(() => {
                    this._longPressTimer = null;
                    // 300ms 経過 → モード切り替え（設置しない）
                    const current = this._halfPlacementModes.get(slotIndex) || false;
                    const next = !current;
                    this._halfPlacementModes.set(slotIndex, next);
                    this.hotbar.setHalfMode(slotIndex, next);
                }, 300);
                return true;
            }

            // half_placeable=false: 従来通り即時設置
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

        // 回転軸ブロック破壊時は回転体を解除
        if (currentBlock === 'rotor' && this.rotationAxisManager) {
            this.rotationAxisManager.OnAxisDestroyed(x, y, z);
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

        // メッシュを再構築
        this.chunkManager.rebuildChunkMesh(chunkX, chunkZ);

        // 影響のあった隣接チャンクのメッシュも再構築
        for (const key of affectedNeighbors) {
            const [nx, nz] = key.split(',').map(Number);
            this.chunkManager.rebuildChunkMesh(nx, nz);
        }

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

        // メッシュを再構築
        this.chunkManager.rebuildChunkMesh(chunkX, chunkZ);

        // 影響のあった隣接チャンクのメッシュも再構築
        for (const key of affectedNeighbors) {
            const [nx, nz] = key.split(',').map(Number);
            this.chunkManager.rebuildChunkMesh(nx, nz);
        }

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

        // メッシュ再構築
        this.chunkManager.rebuildChunkMesh(chunkX, chunkZ);

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

        // メッシュ再構築
        this.chunkManager.rebuildChunkMesh(chunkX, chunkZ);

        // IndexedDBに保存
        this._saveChunk(chunkX, chunkZ, chunk.chunkData);

        return true;
    }

    /**
     * カスタムブロックの設置方向（orientation）を計算
     * - 上面・下面: プレイヤーの視線方向で正面がプレイヤー側を向く
     * - 側面: 面上のヒット位置（上/下/左/右）で正面方向が決まる
     * @param {Object} target - レイキャスト結果（face, hitX, hitY, hitZ, adjacentX, adjacentY, adjacentZ）
     * @param {number} playerYaw - プレイヤーのYaw角（ラジアン、0=北/Z+方向）
     * @returns {number} orientation (0〜23)
     */
    _calculateOrientation(target, playerYaw) {
        const face = BlockInteraction._FACE_TO_INT[target.face] || 0;

        if (face >= 2) {
            // 側面: ヒット位置の上/下/左/右で rotation を決定（プレイヤー向き不問）
            return face * 4 + BlockInteraction._sideRotationFromHit(face, target);
        }

        // 上面・下面: プレイヤーの視線方向から rotation を決定
        const camDirX = -Math.sin(playerYaw);
        const camDirZ = Math.cos(playerYaw);
        const angle = Math.atan2(camDirX, camDirZ) * 180 / Math.PI;

        let rotation;
        if (angle >= -45 && angle < 45) rotation = 0;
        else if (angle >= 45 && angle < 135) rotation = 1;
        else if (angle >= -135 && angle < -45) rotation = 3;
        else rotation = 2;

        // 上面(face=0): Ry(π)反転でプレイヤーの向き方向に正面を合わせる
        // 下面(face=1): Rx(π)がZを反転するため、回転方向を逆にして補正
        rotation = (face === 0) ? (rotation + 2) % 4 : (4 - rotation) % 4;

        return face * 4 + rotation;
    }

    // 側面の rotation 対応表（配列: [face-2] → [上ヒット, 下ヒット, +水平軸ヒット, -水平軸ヒット]）
    // ヒット方向と逆側に正面を向ける（上を狙う→正面は下、右を狙う→正面は左）
    static _SideRotations = [
        [2, 0, 1, 3], // face=2 north: 上→DOWN, 下→UP, +X→-X, -X→+X
        [0, 2, 1, 3], // face=3 south: 上→DOWN, 下→UP, +X→-X, -X→+X
        [3, 1, 0, 2], // face=4 east:  上→DOWN, 下→UP, +Z→-Z, -Z→+Z
        [1, 3, 0, 2], // face=5 west:  上→DOWN, 下→UP, +Z→-Z, -Z→+Z
    ];

    /**
     * 側面のヒット位置から rotation を決定
     * 面の中心からの上下/左右の偏りが大きい方向に正面を向ける
     */
    static _sideRotationFromHit(face, target) {
        const dy = target.hitY - (target.adjacentY + 0.5);
        const dh = (face <= 3)
            ? target.hitX - (target.adjacentX + 0.5)   // north/south: 水平軸=X
            : target.hitZ - (target.adjacentZ + 0.5);  // east/west:   水平軸=Z
        const rots = BlockInteraction._SideRotations[face - 2];
        if (Math.abs(dy) >= Math.abs(dh)) {
            return dy > 0 ? rots[0] : rots[1];
        }
        return dh > 0 ? rots[2] : rots[3];
    }

    /**
     * 回転軸ブロックの orientation を決定する
     * 設置方向可変ブロックの orientation を決定する
     * 設置した面の反対方向にfront面が向く
     * @param {string} face - クリック面
     * @returns {number} 0〜5（front面の方向）
     */
    _calculateOrientableOrientation(face) {
        switch (face) {
            case 'top':    return 0; // 上面をクリック → 穴は上
            case 'bottom': return 1; // 下面をクリック → 穴は下
            case 'north':  return 2; // 北面をクリック → 穴は北
            case 'south':  return 3; // 南面をクリック → 穴は南
            case 'east':   return 4; // 東面をクリック → 穴は東
            case 'west':   return 5; // 西面をクリック → 穴は西
            default:       return 0;
        }
    }

    /**
     * ハーフブロックの orientation を決定する
     * @param {string} face - クリック面
     * @returns {number} 1〜6（orientation）
     */
    _calculateHalfOrientation(face) {
        switch (face) {
            case 'top':    return 1; // 下ハーフ
            case 'bottom': return 2; // 上ハーフ
            case 'north':  return 3; // 南付き（-Z）
            case 'south':  return 4; // 北付き（+Z）
            case 'east':   return 5; // 西付き（-X）
            case 'west':   return 6; // 東付き（+X）
            default:       return 1;
        }
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
