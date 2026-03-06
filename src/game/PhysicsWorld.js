/**
 * PhysicsWorld.js
 * 物理演算・衝突判定クラス
 * AABB衝突判定、接地判定、押し返し処理を実装
 */
class PhysicsWorld {
    /**
     * コンストラクタ
     * @param {ChunkManager} chunkManager - チャンクマネージャー
     * @param {TextureLoader} textureLoader - テクスチャローダー（ブロック定義取得用）
     */
    constructor(chunkManager, textureLoader) {
        this.chunkManager = chunkManager;
        this.textureLoader = textureLoader;

        // 衝突判定の検索範囲（プレイヤー周辺のブロック数）
        this.collisionSearchRadius = 2;

        // 接地判定の閾値
        this.groundCheckDistance = 0.01;

        // ステップアップの最大高さ（0.5ブロック以下の段差を瞬時に乗り越える）
        this.stepUpMaxHeight = 0.5;

        // オートジャンプの最大高さ（0.5超〜1.0ブロックの段差でジャンプ）
        this.autoJumpMaxHeight = 1.0;

        // 進行方向の高さチェック距離（ブロック）
        this.stepCheckDistance = 0.3;
    }

    /**
     * プレイヤーを移動（衝突判定付き）
     * @param {Player} player - プレイヤー
     * @param {{x: number, y: number, z: number}} velocity - 速度ベクトル
     * @param {number} deltaTime - 経過時間（秒）
     */
    movePlayer(player, velocity, deltaTime) {
        const pos = player.getPosition();

        // 移動量を計算
        const dx = velocity.x * deltaTime;
        const dy = velocity.y * deltaTime;
        const dz = velocity.z * deltaTime;

        // Y軸を先に処理（接地判定のため）
        if (dy !== 0) {
            pos.y += dy;
            player.setPosition(pos.x, pos.y, pos.z);
            this._resolveCollisionY(player, dy);
            const newPos = player.getPosition();
            pos.x = newPos.x;
            pos.y = newPos.y;
            pos.z = newPos.z;
        }

        // X軸の処理
        if (dx !== 0) {
            pos.x += dx;
            player.setPosition(pos.x, pos.y, pos.z);
            this._resolveCollisionX(player, dx);
            const newPos = player.getPosition();
            // ステップアップがY位置を変更する可能性があるため、全軸を保存
            pos.x = newPos.x;
            pos.y = newPos.y;
            pos.z = newPos.z;
        }

        // Z軸の処理
        if (dz !== 0) {
            pos.z += dz;
            player.setPosition(pos.x, pos.y, pos.z);
            this._resolveCollisionZ(player, dz);
        }

        // 接地判定を更新（回転体上も考慮）
        player.setOnGround(this.isOnGround(player));
    }

    /**
     * Y軸方向の衝突を解決
     * @param {Player} player
     * @param {number} dy - 移動方向
     */
    _resolveCollisionY(player, dy) {
        const aabb = player.getAABB();
        const collisions = this._getCollidingBlocks(aabb);

        for (const blockAABB of collisions) {
            const playerAABB = player.getAABB();

            if (!this._aabbIntersects(playerAABB, blockAABB)) continue;

            if (dy > 0) {
                // 上昇中 - 天井に当たった
                const newY = blockAABB.minY - player.getHeight();
                player.setPosition(player.getPosition().x, newY, player.getPosition().z);
                player.setVelocity(player.getVelocity().x, 0, player.getVelocity().z);
            } else if (dy < 0) {
                // 落下中 - 床に着地
                const newY = blockAABB.maxY;
                player.setPosition(player.getPosition().x, newY, player.getPosition().z);
                player.setVelocity(player.getVelocity().x, 0, player.getVelocity().z);
            }
        }
    }

    /**
     * X軸方向の衝突を解決
     * @param {Player} player
     * @param {number} dx - 移動方向
     */
    _resolveCollisionX(player, dx) {
        const aabb = player.getAABB();
        const collisions = this._getCollidingBlocks(aabb);
        const halfWidth = Player.WIDTH / 2;

        // ステップアップ/オートジャンプ判定（接地中かつ非飛行時のみ）
        if (player.isOnGround() && !player.isFlying()) {
            const stepUpResult = this._tryStepUpOrAutoJump(player, collisions, dx, 0);
            if (stepUpResult.steppedUp) {
                return; // ステップアップ成功、押し返し不要
            }
            // オートジャンプの場合は壁との衝突解決を続行
        }

        for (const blockAABB of collisions) {
            const playerAABB = player.getAABB();

            if (!this._aabbIntersects(playerAABB, blockAABB)) continue;

            const pos = player.getPosition();

            if (dx > 0) {
                // 東へ移動中 - 壁に当たった
                const newX = blockAABB.minX - halfWidth;
                player.setPosition(newX, pos.y, pos.z);
            } else if (dx < 0) {
                // 西へ移動中 - 壁に当たった
                const newX = blockAABB.maxX + halfWidth;
                player.setPosition(newX, pos.y, pos.z);
            }
            player.setVelocity(0, player.getVelocity().y, player.getVelocity().z);
        }
    }

    /**
     * Z軸方向の衝突を解決
     * @param {Player} player
     * @param {number} dz - 移動方向
     */
    _resolveCollisionZ(player, dz) {
        const aabb = player.getAABB();
        const collisions = this._getCollidingBlocks(aabb);
        const halfWidth = Player.WIDTH / 2;

        // ステップアップ/オートジャンプ判定（接地中かつ非飛行時のみ）
        if (player.isOnGround() && !player.isFlying()) {
            const stepUpResult = this._tryStepUpOrAutoJump(player, collisions, 0, dz);
            if (stepUpResult.steppedUp) {
                return; // ステップアップ成功、押し返し不要
            }
            // オートジャンプの場合は壁との衝突解決を続行
        }

        for (const blockAABB of collisions) {
            const playerAABB = player.getAABB();

            if (!this._aabbIntersects(playerAABB, blockAABB)) continue;

            const pos = player.getPosition();

            if (dz > 0) {
                // 北へ移動中 - 壁に当たった
                const newZ = blockAABB.minZ - halfWidth;
                player.setPosition(pos.x, pos.y, newZ);
            } else if (dz < 0) {
                // 南へ移動中 - 壁に当たった
                const newZ = blockAABB.maxZ + halfWidth;
                player.setPosition(pos.x, pos.y, newZ);
            }
            player.setVelocity(player.getVelocity().x, player.getVelocity().y, 0);
        }
    }

    /**
     * ステップアップまたはオートジャンプを試行
     * 進行方向前方の高さをチェックして、ステップアップまたはオートジャンプを判定
     * @param {Player} player
     * @param {Array<Object>} collisions - 衝突候補のAABBリスト
     * @param {number} dx - X方向の移動
     * @param {number} dz - Z方向の移動
     * @returns {{steppedUp: boolean, autoJumped: boolean, targetY: number}}
     */
    _tryStepUpOrAutoJump(player, collisions, dx, dz) {
        const pos = player.getPosition();
        const playerAABB = player.getAABB();

        // 実際に衝突しているAABBがあるか確認
        let hasCollision = false;
        for (const blockAABB of collisions) {
            if (this._aabbIntersects(playerAABB, blockAABB)) {
                hasCollision = true;
                break;
            }
        }

        if (!hasCollision) {
            return { steppedUp: false, autoJumped: false, targetY: pos.y };
        }

        // 進行方向を正規化
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len === 0) {
            return { steppedUp: false, autoJumped: false, targetY: pos.y };
        }
        const dirX = dx / len;
        const dirZ = dz / len;

        // 進行方向前方の位置を計算
        const checkX = pos.x + dirX * this.stepCheckDistance;
        const checkZ = pos.z + dirZ * this.stepCheckDistance;

        // 進行方向前方の高さを取得
        const frontHeight = this._getObstacleHeightAt(checkX, pos.y, checkZ, player);

        // 段差の高さ
        const stepHeight = frontHeight - pos.y;

        // 段差がない場合
        if (stepHeight <= 0) {
            return { steppedUp: false, autoJumped: false, targetY: pos.y };
        }

        // ステップアップ（0.5以下）
        if (stepHeight <= this.stepUpMaxHeight) {
            if (this._canStepUpTo(player, frontHeight)) {
                player.setPosition(pos.x, frontHeight, pos.z);
                return { steppedUp: true, autoJumped: false, targetY: frontHeight };
            }
        }
        // オートジャンプ（0.5超〜1.0以下）
        else if (stepHeight <= this.autoJumpMaxHeight) {
            if (this._canStepUpTo(player, frontHeight)) {
                // ジャンプ速度を付与（PlayerControllerのJUMP_VELOCITYと同じ8）
                const vel = player.getVelocity();
                player.setVelocity(vel.x, 8, vel.z);
                player.setOnGround(false);
                return { steppedUp: false, autoJumped: true, targetY: frontHeight };
            }
        }

        return { steppedUp: false, autoJumped: false, targetY: pos.y };
    }

    /**
     * 指定座標での障害物の高さを取得
     * @param {number} x - X座標
     * @param {number} baseY - 基準Y座標（プレイヤーの足元）
     * @param {number} z - Z座標
     * @param {Player} player - プレイヤー
     * @returns {number} 障害物の上面Y座標
     */
    _getObstacleHeightAt(x, baseY, z, player) {
        const halfWidth = Player.WIDTH / 2;

        // チェック用のAABB（プレイヤーの幅で縦に細い領域）
        const checkAABB = {
            minX: x - halfWidth,
            minY: baseY,
            minZ: z - halfWidth,
            maxX: x + halfWidth,
            maxY: baseY + this.autoJumpMaxHeight + 0.1,
            maxZ: z + halfWidth
        };

        const collisions = this._getCollidingBlocks(checkAABB);
        let maxY = baseY;

        for (const blockAABB of collisions) {
            if (!this._aabbIntersects(checkAABB, blockAABB)) continue;

            // この位置での障害物の高さを記録
            if (blockAABB.maxY > maxY && blockAABB.maxY <= baseY + this.autoJumpMaxHeight + 0.1) {
                maxY = blockAABB.maxY;
            }
        }

        return maxY;
    }

    /**
     * 指定の高さにステップアップできるか確認（頭上スペースチェック）
     * @param {Player} player
     * @param {number} targetY - 目標Y座標
     * @returns {boolean} ステップアップ可能か
     */
    _canStepUpTo(player, targetY) {
        const pos = player.getPosition();
        const halfWidth = Player.WIDTH / 2;
        const height = player.getHeight();

        // ステップアップ後のAABBを計算
        const stepAABB = {
            minX: pos.x - halfWidth,
            minY: targetY,
            minZ: pos.z - halfWidth,
            maxX: pos.x + halfWidth,
            maxY: targetY + height,
            maxZ: pos.z + halfWidth
        };

        // ステップアップ後に頭上に衝突するブロックがないか確認
        const collisions = this._getCollidingBlocks(stepAABB);
        for (const blockAABB of collisions) {
            // ステップアップ先の床は除外（minYがtargetYのブロック）
            if (Math.abs(blockAABB.maxY - targetY) < 0.01) continue;

            if (this._aabbIntersects(stepAABB, blockAABB)) {
                return false; // 頭上に障害物あり
            }
        }

        return true;
    }

    /**
     * プレイヤー周辺の衝突するブロックのAABBリストを取得
     * @param {Object} playerAABB - プレイヤーのAABB
     * @returns {Array<Object>} 衝突するブロックのAABBリスト
     */
    _getCollidingBlocks(playerAABB) {
        const collisions = [];

        // 検索範囲を計算
        const minX = Math.floor(playerAABB.minX) - 1;
        const maxX = Math.ceil(playerAABB.maxX) + 1;
        const minY = Math.floor(playerAABB.minY) - 1;
        const maxY = Math.ceil(playerAABB.maxY) + 1;
        const minZ = Math.floor(playerAABB.minZ) - 1;
        const maxZ = Math.ceil(playerAABB.maxZ) + 1;

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const blockAABBs = this.getBlockCollisionAABBs(x, y, z);
                    collisions.push(...blockAABBs);
                }
            }
        }

        return collisions;
    }

    /**
     * 2つのAABBが交差しているかチェック
     * @param {Object} a - AABB
     * @param {Object} b - AABB
     * @returns {boolean}
     */
    _aabbIntersects(a, b) {
        return a.minX < b.maxX && a.maxX > b.minX &&
               a.minY < b.maxY && a.maxY > b.minY &&
               a.minZ < b.maxZ && a.maxZ > b.minZ;
    }

    /**
     * 接地判定
     * @param {Player} player
     * @returns {boolean}
     */
    isOnGround(player) {
        const pos = player.getPosition();
        const halfWidth = Player.WIDTH / 2;

        // 足元のAABBを作成（薄い板状）
        const checkAABB = {
            minX: pos.x - halfWidth,
            minY: pos.y - this.groundCheckDistance,
            minZ: pos.z - halfWidth,
            maxX: pos.x + halfWidth,
            maxY: pos.y,
            maxZ: pos.z + halfWidth
        };

        // 検索範囲を計算
        const minX = Math.floor(checkAABB.minX);
        const maxX = Math.ceil(checkAABB.maxX);
        const y = Math.floor(pos.y) - 1;
        const minZ = Math.floor(checkAABB.minZ);
        const maxZ = Math.ceil(checkAABB.maxZ);

        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const blockAABBs = this.getBlockCollisionAABBs(x, y, z);
                for (const blockAABB of blockAABBs) {
                    if (this._aabbIntersects(checkAABB, blockAABB)) {
                        return true;
                    }
                }
                // 現在の高さのブロックもチェック
                const blockAABBs2 = this.getBlockCollisionAABBs(x, Math.floor(pos.y), z);
                for (const blockAABB of blockAABBs2) {
                    if (blockAABB.maxY <= pos.y + 0.01 && blockAABB.maxY >= pos.y - 0.01) {
                        if (pos.x - halfWidth < blockAABB.maxX && pos.x + halfWidth > blockAABB.minX &&
                            pos.z - halfWidth < blockAABB.maxZ && pos.z + halfWidth > blockAABB.minZ) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * ワールド座標からブロックを取得
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {string|null} block_str_id または null
     */
    getBlockAt(x, y, z) {
        if (!this.chunkManager) return null;

        const blockX = Math.floor(x);
        const blockY = Math.floor(y);
        const blockZ = Math.floor(z);

        // チャンク座標を計算
        const chunkX = Math.floor(blockX / 16);
        const chunkZ = Math.floor(blockZ / 16);
        const key = `${chunkX},${chunkZ}`;

        const chunk = this.chunkManager.chunks.get(key);
        if (!chunk || !chunk.chunkData) return null;

        // チャンク内座標（ワールドY → ローカルY変換）
        const localX = ((blockX % 16) + 16) % 16;
        const localY = blockY - chunk.chunkData.baseY;
        const localZ = ((blockZ % 16) + 16) % 16;

        return chunk.chunkData.getBlock(localX, localY, localZ);
    }

    /**
     * ブロック位置のAABBリストを取得
     * @param {number} blockX
     * @param {number} blockY
     * @param {number} blockZ
     * @returns {Array<Object>} AABBリスト
     */
    getBlockCollisionAABBs(blockX, blockY, blockZ) {
        // チャンクを取得してbaseYベースのY範囲チェック
        const chunkX = Math.floor(blockX / 16);
        const chunkZ = Math.floor(blockZ / 16);
        const chunk = this.chunkManager ? this.chunkManager.chunks.get(`${chunkX},${chunkZ}`) : null;
        if (!chunk || !chunk.chunkData) return [];
        const localY = blockY - chunk.chunkData.baseY;
        if (localY < 0 || localY >= 128) return [];

        const blockStrId = this.getBlockAt(blockX, blockY, blockZ);

        // 空気・水ブロックは判定なし
        if (!blockStrId || blockStrId === 'air' || blockStrId === 'water') return [];

        // ブロック定義を取得
        const blockDef = this._getBlockDefinition(blockStrId);

        if (!blockDef) {
            // 定義がない場合は1x1x1のAABBを返す
            return [{
                minX: blockX,
                minY: blockY,
                minZ: blockZ,
                maxX: blockX + 1,
                maxY: blockY + 1,
                maxZ: blockZ + 1
            }];
        }

        // ハーフブロック対応（half_placeable=true かつ orientation 101-106）
        if (blockDef.half_placeable && blockDef.shape_type !== 'custom') {
            const localX = ((blockX % 16) + 16) % 16;
            const localZ = ((blockZ % 16) + 16) % 16;
            const rawOrientation = chunk.chunkData.getOrientation(localX, localY, localZ);
            const orientation = rawOrientation - 100;
            if (orientation >= 1 && orientation <= 6) {
                const aabb = {
                    minX: blockX, minY: blockY, minZ: blockZ,
                    maxX: blockX + 1, maxY: blockY + 1, maxZ: blockZ + 1
                };
                switch (orientation) {
                    case 1: aabb.maxY = blockY + 0.5; break; // 下ハーフ
                    case 2: aabb.minY = blockY + 0.5; break; // 上ハーフ
                    case 3: aabb.maxZ = blockZ + 0.5; break; // 南付き（-Z）
                    case 4: aabb.minZ = blockZ + 0.5; break; // 北付き（+Z）
                    case 5: aabb.maxX = blockX + 0.5; break; // 西付き（-X）
                    case 6: aabb.minX = blockX + 0.5; break; // 東付き（+X）
                }
                return [aabb];
            }
        }

        // 標準ブロックは1x1x1のAABB
        if (blockDef.shape_type === 'standard' || !blockDef.shape_type) {
            return [{
                minX: blockX,
                minY: blockY,
                minZ: blockZ,
                maxX: blockX + 1,
                maxY: blockY + 1,
                maxZ: blockZ + 1
            }];
        }

        // カスタムブロックは当たり判定ボクセルを使用
        if (blockDef.shape_type === 'custom' && blockDef.voxel_collision) {
            return this._getCustomBlockAABBs(blockX, blockY, blockZ, blockDef.voxel_collision);
        }

        // その他は1x1x1のAABB
        return [{
            minX: blockX,
            minY: blockY,
            minZ: blockZ,
            maxX: blockX + 1,
            maxY: blockY + 1,
            maxZ: blockZ + 1
        }];
    }

    /**
     * プレイヤーの足元が水中かどうか判定
     * @param {Player} player
     * @returns {boolean}
     */
    isInWater(player) {
        const pos = player.getPosition();
        const block = this.getBlockAt(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        return block === 'water';
    }

    /**
     * プレイヤーの目線が水中かどうか判定
     * @param {Player} player
     * @returns {boolean}
     */
    isEyeInWater(player) {
        const eye = player.getEyePosition();
        const block = this.getBlockAt(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
        return block === 'water';
    }

    /**
     * カスタムブロックの当たり判定AABBリストを取得
     * @param {number} blockX
     * @param {number} blockY
     * @param {number} blockZ
     * @param {string} voxelCollision - Base64エンコードされた当たり判定データ
     * @returns {Array<Object>} AABBリスト
     */
    _getCustomBlockAABBs(blockX, blockY, blockZ, voxelCollision) {
        const aabbs = [];

        // CustomCollisionクラスを使用してデコード
        if (typeof CustomCollision === 'undefined') {
            // CustomCollisionがない場合は1x1x1を返す
            return [{
                minX: blockX,
                minY: blockY,
                minZ: blockZ,
                maxX: blockX + 1,
                maxY: blockY + 1,
                maxZ: blockZ + 1
            }];
        }

        const collisionData = CustomCollision.decode(voxelCollision);
        const voxelSize = 0.25; // 1/4 ブロック

        // 4x4x4のボクセルをチェック
        for (let vy = 0; vy < 4; vy++) {
            for (let vz = 0; vz < 4; vz++) {
                for (let vx = 0; vx < 4; vx++) {
                    if (collisionData[vy][vz][vx] === 1) {
                        aabbs.push({
                            minX: blockX + vx * voxelSize,
                            minY: blockY + vy * voxelSize,
                            minZ: blockZ + vz * voxelSize,
                            maxX: blockX + (vx + 1) * voxelSize,
                            maxY: blockY + (vy + 1) * voxelSize,
                            maxZ: blockZ + (vz + 1) * voxelSize
                        });
                    }
                }
            }
        }

        return aabbs;
    }

    /**
     * ブロック定義を取得
     * @param {string} blockStrId
     * @returns {Object|null}
     */
    _getBlockDefinition(blockStrId) {
        if (!this.textureLoader || !this.textureLoader.blocks) return null;

        return this.textureLoader.blocks.find(b => b.block_str_id === blockStrId) || null;
    }

    /**
     * スニーク時の落下防止チェック
     * プレイヤーが移動しようとしている方向に床がないかチェック
     * @param {Player} player
     * @param {number} dx - X方向の移動量
     * @param {number} dz - Z方向の移動量
     * @returns {{dx: number, dz: number}} 修正された移動量
     */
    checkSneakEdge(player, dx, dz) {
        if (!player.isSneaking() || player.isFlying()) {
            return { dx, dz };
        }

        const pos = player.getPosition();
        const halfWidth = Player.WIDTH / 2;

        // 移動後の位置で足元をチェック
        const checkX = pos.x + dx;
        const checkZ = pos.z + dz;

        // 足元にブロックがあるかチェック
        const hasGroundAfterMove = this._hasGroundAt(checkX, pos.y, checkZ, halfWidth);

        if (!hasGroundAfterMove && player.isOnGround()) {
            // 現在の位置で足元にブロックがあるか
            const hasGroundNow = this._hasGroundAt(pos.x, pos.y, pos.z, halfWidth);

            if (hasGroundNow) {
                // 軸ごとにチェック
                let newDx = dx;
                let newDz = dz;

                // X方向のみで落下するか
                if (dx !== 0) {
                    const hasGroundX = this._hasGroundAt(pos.x + dx, pos.y, pos.z, halfWidth);
                    if (!hasGroundX) newDx = 0;
                }

                // Z方向のみで落下するか
                if (dz !== 0) {
                    const hasGroundZ = this._hasGroundAt(pos.x, pos.y, pos.z + dz, halfWidth);
                    if (!hasGroundZ) newDz = 0;
                }

                return { dx: newDx, dz: newDz };
            }
        }

        return { dx, dz };
    }

    /**
     * 指定位置の足元にブロックがあるかチェック
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} halfWidth
     * @returns {boolean}
     */
    _hasGroundAt(x, y, z, halfWidth) {
        // 4隅と中心をチェック
        const checkPoints = [
            { x: x, z: z },
            { x: x - halfWidth * 0.9, z: z - halfWidth * 0.9 },
            { x: x + halfWidth * 0.9, z: z - halfWidth * 0.9 },
            { x: x - halfWidth * 0.9, z: z + halfWidth * 0.9 },
            { x: x + halfWidth * 0.9, z: z + halfWidth * 0.9 }
        ];

        for (const point of checkPoints) {
            const blockY = Math.floor(y) - 1;
            const blockAABBs = this.getBlockCollisionAABBs(
                Math.floor(point.x),
                blockY,
                Math.floor(point.z)
            );
            if (blockAABBs.length > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * 段差を乗り越えられるかチェック（オートジャンプ用）
     * @param {Player} player - プレイヤー
     * @param {number} dx - X方向の移動量
     * @param {number} dz - Z方向の移動量
     * @param {number} maxStepHeight - 最大段差高さ
     * @returns {{canStepUp: boolean, stepHeight: number}} 段差情報
     */
    checkStepUp(player, dx, dz, maxStepHeight) {
        const pos = player.getPosition();
        const halfWidth = Player.WIDTH / 2;

        // 移動先の位置
        const targetX = pos.x + dx;
        const targetZ = pos.z + dz;

        // 移動先のAABB（足元付近）
        const checkAABB = {
            minX: targetX - halfWidth,
            minY: pos.y,
            minZ: targetZ - halfWidth,
            maxX: targetX + halfWidth,
            maxY: pos.y + 0.1, // 少し上まで
            maxZ: targetZ + halfWidth
        };

        // 移動先で衝突するブロックを取得
        const collisions = this._getCollidingBlocks(checkAABB);

        // 衝突がなければ段差なし
        if (collisions.length === 0) {
            return { canStepUp: false, stepHeight: 0 };
        }

        // 衝突があるか確認
        let hasCollision = false;
        let maxBlockTop = pos.y;

        for (const blockAABB of collisions) {
            if (this._aabbIntersects(checkAABB, blockAABB)) {
                hasCollision = true;
                // 衝突ブロックの上面の高さを記録
                if (blockAABB.maxY > maxBlockTop) {
                    maxBlockTop = blockAABB.maxY;
                }
            }
        }

        if (!hasCollision) {
            return { canStepUp: false, stepHeight: 0 };
        }

        // 段差の高さを計算
        const stepHeight = maxBlockTop - pos.y;

        // 最大段差を超えている場合は乗り越えられない
        if (stepHeight > maxStepHeight || stepHeight <= 0) {
            return { canStepUp: false, stepHeight: 0 };
        }

        // 段差の上にプレイヤーが入れるスペースがあるか確認
        const headRoom = player.getHeight();
        const stepTopAABB = {
            minX: targetX - halfWidth,
            minY: maxBlockTop,
            minZ: targetZ - halfWidth,
            maxX: targetX + halfWidth,
            maxY: maxBlockTop + headRoom,
            maxZ: targetZ + halfWidth
        };

        const headCollisions = this._getCollidingBlocks(stepTopAABB);
        for (const blockAABB of headCollisions) {
            if (this._aabbIntersects(stepTopAABB, blockAABB)) {
                // 頭上に障害物があるので乗り越えられない
                return { canStepUp: false, stepHeight: 0 };
            }
        }

        return { canStepUp: true, stepHeight: stepHeight };
    }

    /**
     * レイキャスト（ブロック設置/破壊用）
     * @param {{x: number, y: number, z: number}} origin - 始点
     * @param {{x: number, y: number, z: number}} direction - 方向（単位ベクトル）
     * @param {number} maxDistance - 最大距離
     * @returns {{hit: boolean, blockX: number, blockY: number, blockZ: number, face: string, distance: number, adjacentX: number, adjacentY: number, adjacentZ: number}|null}
     */
    raycast(origin, direction, maxDistance) {
        // DDA (Digital Differential Analyzer) アルゴリズム
        const step = 0.05;
        let x = origin.x;
        let y = origin.y;
        let z = origin.z;

        // カスタムブロック重複チェック用（DDAで全ボクセル走査済みならスキップ）
        let lastCBX = NaN, lastCBY = NaN, lastCBZ = NaN;

        for (let dist = 0; dist < maxDistance; dist += step) {
            const blockX = Math.floor(x);
            const blockY = Math.floor(y);
            const blockZ = Math.floor(z);

            const blockStrId = this.getBlockAt(blockX, blockY, blockZ);
            if (blockStrId && blockStrId !== 'air' && blockStrId !== 'water') {
                // ブロック定義を取得
                const blockDef = this._getBlockDefinition(blockStrId);

                // カスタムブロックの場合、ボクセルグリッドDDAでレイキャスト
                if (blockDef && blockDef.shape_type === 'custom' && blockDef.voxel_look) {
                    if (blockX !== lastCBX || blockY !== lastCBY || blockZ !== lastCBZ) {
                        lastCBX = blockX; lastCBY = blockY; lastCBZ = blockZ;
                        const customHit = this._raycastCustomBlockDDA(
                            origin, direction, blockX, blockY, blockZ, blockDef.voxel_look
                        );
                        if (customHit) {
                            const adjacent = this._getAdjacentBlock(blockX, blockY, blockZ, customHit.face);
                            return {
                                hit: true,
                                blockX,
                                blockY,
                                blockZ,
                                face: customHit.face,
                                distance: dist,
                                hitX: x, hitY: y, hitZ: z,
                                adjacentX: adjacent.x,
                                adjacentY: adjacent.y,
                                adjacentZ: adjacent.z
                            };
                        }
                    }
                    // DDA走査済みでヒットなし → 継続
                } else {
                    lastCBX = NaN;
                    // 通常ブロック
                    const face = this._determineFace(x - blockX, y - blockY, z - blockZ);
                    const adjacent = this._getAdjacentBlock(blockX, blockY, blockZ, face);

                    return {
                        hit: true,
                        blockX,
                        blockY,
                        blockZ,
                        face,
                        distance: dist,
                        hitX: x, hitY: y, hitZ: z,
                        adjacentX: adjacent.x,
                        adjacentY: adjacent.y,
                        adjacentZ: adjacent.z
                    };
                }
            } else {
                lastCBX = NaN;
            }

            x += direction.x * step;
            y += direction.y * step;
            z += direction.z * step;
        }

        return null;
    }

    /**
     * カスタムブロック内をDDAで正確にレイキャスト
     * レイの進入点を算出し、8x8x8ボクセルグリッドを1ボクセルも飛ばさずに走査する
     * @param {{x,y,z}} origin - レイ始点（ワールド座標）
     * @param {{x,y,z}} dir - レイ方向（単位ベクトル）
     * @param {number} blockX - ブロック整数座標X
     * @param {number} blockY - ブロック整数座標Y
     * @param {number} blockZ - ブロック整数座標Z
     * @param {string} voxelLook - Base64エンコードされた見た目ボクセルデータ
     * @returns {{face: string}|null}
     */
    _raycastCustomBlockDDA(origin, dir, blockX, blockY, blockZ, voxelLook) {
        if (typeof VoxelData === 'undefined') {
            return { face: 'top' };
        }
        const voxelData = VoxelData.decode(voxelLook);
        const dx = dir.x, dy = dir.y, dz = dir.z;

        // --- Ray-AABB交差: ブロック境界への進入t値を求める ---
        let tMin = 0, tMax = Infinity;
        let entryAxis = -1; // 0=X, 1=Y, 2=Z

        // X
        if (Math.abs(dx) > 1e-10) {
            let t1 = (blockX - origin.x) / dx;
            let t2 = (blockX + 1 - origin.x) / dx;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tMin) { tMin = t1; entryAxis = 0; }
            if (t2 < tMax) tMax = t2;
        } else if (origin.x < blockX || origin.x >= blockX + 1) {
            return null;
        }
        // Y
        if (Math.abs(dy) > 1e-10) {
            let t1 = (blockY - origin.y) / dy;
            let t2 = (blockY + 1 - origin.y) / dy;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tMin) { tMin = t1; entryAxis = 1; }
            if (t2 < tMax) tMax = t2;
        } else if (origin.y < blockY || origin.y >= blockY + 1) {
            return null;
        }
        // Z
        if (Math.abs(dz) > 1e-10) {
            let t1 = (blockZ - origin.z) / dz;
            let t2 = (blockZ + 1 - origin.z) / dz;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tMin) { tMin = t1; entryAxis = 2; }
            if (t2 < tMax) tMax = t2;
        } else if (origin.z < blockZ || origin.z >= blockZ + 1) {
            return null;
        }

        if (tMin > tMax + 1e-6) return null;
        tMin = Math.max(tMin, 0);

        // --- 進入点をボクセルグリッド座標(0〜8)に変換 ---
        const E = 1e-4;
        const gx = Math.max(E, Math.min(8 - E, (origin.x + tMin * dx - blockX) * 8));
        const gy = Math.max(E, Math.min(8 - E, (origin.y + tMin * dy - blockY) * 8));
        const gz = Math.max(E, Math.min(8 - E, (origin.z + tMin * dz - blockZ) * 8));

        let vx = Math.min(7, Math.floor(gx));
        let vy = Math.min(7, Math.floor(gy));
        let vz = Math.min(7, Math.floor(gz));

        // 進入面（ブロック境界から入った面）
        const entryFaces = [
            dx > 0 ? 'west' : 'east',
            dy > 0 ? 'bottom' : 'top',
            dz > 0 ? 'south' : 'north'
        ];
        let lastFace = entryAxis >= 0 ? entryFaces[entryAxis] : 'top';

        // 開始ボクセルがソリッドならそのまま返す
        if (VoxelData.getVoxel(voxelData, vx, vy, vz) !== 0) {
            return { face: lastFace };
        }

        // --- DDAセットアップ ---
        const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
        const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
        const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);

        const dx8 = dx * 8, dy8 = dy * 8, dz8 = dz * 8;
        const tDeltaX = stepX !== 0 ? Math.abs(1 / dx8) : Infinity;
        const tDeltaY = stepY !== 0 ? Math.abs(1 / dy8) : Infinity;
        const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz8) : Infinity;

        let tMaxX = stepX > 0 ? (vx + 1 - gx) / dx8 : (stepX < 0 ? (vx - gx) / dx8 : Infinity);
        let tMaxY = stepY > 0 ? (vy + 1 - gy) / dy8 : (stepY < 0 ? (vy - gy) / dy8 : Infinity);
        let tMaxZ = stepZ > 0 ? (vz + 1 - gz) / dz8 : (stepZ < 0 ? (vz - gz) / dz8 : Infinity);

        // --- DDAループ（最大24ステップ: 8×3軸対角線） ---
        for (let i = 0; i < 24; i++) {
            if (tMaxX < tMaxY) {
                if (tMaxX < tMaxZ) {
                    vx += stepX; tMaxX += tDeltaX;
                    lastFace = entryFaces[0];
                } else {
                    vz += stepZ; tMaxZ += tDeltaZ;
                    lastFace = entryFaces[2];
                }
            } else {
                if (tMaxY < tMaxZ) {
                    vy += stepY; tMaxY += tDeltaY;
                    lastFace = entryFaces[1];
                } else {
                    vz += stepZ; tMaxZ += tDeltaZ;
                    lastFace = entryFaces[2];
                }
            }

            // 範囲外 → ブロック内にヒットなし
            if (vx < 0 || vx > 7 || vy < 0 || vy > 7 || vz < 0 || vz > 7) {
                return null;
            }

            // ソリッドボクセルにヒット → lastFaceがDDAステップ方向から決まる入射面
            if (VoxelData.getVoxel(voxelData, vx, vy, vz) !== 0) {
                return { face: lastFace };
            }
        }

        return null;
    }

    /**
     * 面に隣接するブロック座標を取得
     * @param {number} blockX
     * @param {number} blockY
     * @param {number} blockZ
     * @param {string} face
     * @returns {{x: number, y: number, z: number}}
     */
    _getAdjacentBlock(blockX, blockY, blockZ, face) {
        switch (face) {
            case 'top':
                return { x: blockX, y: blockY + 1, z: blockZ };
            case 'bottom':
                return { x: blockX, y: blockY - 1, z: blockZ };
            case 'north':
                return { x: blockX, y: blockY, z: blockZ + 1 };
            case 'south':
                return { x: blockX, y: blockY, z: blockZ - 1 };
            case 'east':
                return { x: blockX + 1, y: blockY, z: blockZ };
            case 'west':
                return { x: blockX - 1, y: blockY, z: blockZ };
            default:
                return { x: blockX, y: blockY + 1, z: blockZ };
        }
    }

    /**
     * ブロック内の位置から面を判定
     * @param {number} localX
     * @param {number} localY
     * @param {number} localZ
     * @returns {string}
     */
    _determineFace(localX, localY, localZ) {
        const faces = [
            { name: 'west', value: localX },
            { name: 'east', value: 1 - localX },
            { name: 'bottom', value: localY },
            { name: 'top', value: 1 - localY },
            { name: 'south', value: localZ },
            { name: 'north', value: 1 - localZ }
        ];

        faces.sort((a, b) => a.value - b.value);
        return faces[0].name;
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.PhysicsWorld = PhysicsWorld;
}
