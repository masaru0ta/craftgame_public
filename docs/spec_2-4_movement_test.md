# 仕様書: 2-4 移動テスト

## 概要

プレイヤーが1人称視点でワールド内を移動できるテスト。
2-3のLoD表示をベースに、プレイヤー移動・物理演算・衝突判定を実装する。

- 1人称視点カメラ（PointerLock API）
- WASD移動、マウス視点操作
- 重力・ジャンプの物理演算
- ブロックとのAABB衝突判定
- 飛行モード

## 関連資料

- spec_list.md: 機能一覧
- spec_2-3_lod_test.md: LoD設定と表示テスト
- spec_1-5_collision_editor.md: カスタムブロック当たり判定

## 技術構成

| 項目 | 選定 |
|------|------|
| 3Dライブラリ | Three.js（CDN） |
| カメラ制御 | PointerLock API |
| ストレージ | IndexedDB（2-2から継続） |
| テスト方法 | テストページ（HTML） |

## ファイル構成

```
src/
├── game/
│   ├── ChunkData.js            # 既存
│   ├── ChunkMeshBuilder.js     # 既存
│   ├── ChunkManager.js         # 既存
│   ├── ChunkStorage.js         # 既存
│   ├── TextureLoader.js        # 既存
│   ├── WorldGenerator.js       # 既存
│   ├── LoDHelper.js            # 既存
│   ├── CustomCollision.js      # 既存: 当たり判定データ
│   ├── Player.js               # 新規: プレイヤー状態管理
│   ├── PlayerController.js     # 新規: 入力・移動制御
│   ├── PhysicsWorld.js         # 新規: 物理演算・衝突判定
│   └── FirstPersonCamera.js    # 新規: 1人称カメラ制御
├── test/
│   ├── 2-4_movement_test.html  # 新規: テストページ
│   └── 2-4_main.js             # 新規: メイン処理
```

---

## 要件

### **REQ-2-4-1: プレイヤークラス（Player）**

プレイヤーの状態を管理するクラス。

#### プレイヤーサイズ（Minecraft準拠）

| 項目 | 通常時 | スニーク時 | 説明 |
|------|--------|-----------|------|
| 幅 | 0.6 ブロック | 0.6 ブロック | X軸・Z軸の当たり判定幅 |
| 高さ | 1.8 ブロック | 1.5 ブロック | Y軸の当たり判定高さ |
| 目線高さ | 1.62 ブロック | 1.35 ブロック | 地面からカメラ位置 |

#### プレイヤー状態

| 状態 | 説明 |
|------|------|
| position | ワールド座標（足元の中心） |
| velocity | 速度ベクトル |
| yaw | 左右の向き（ラジアン、0=北） |
| pitch | 上下の向き（ラジアン、-π/2〜π/2） |
| isOnGround | 接地判定 |
| isFlying | 飛行モード |
| isSprinting | 走り状態 |
| isSneaking | スニーク状態 |

#### API

```javascript
class Player {
    constructor(x, y, z)

    // 位置
    getPosition()           // {x, y, z}
    setPosition(x, y, z)
    getEyePosition()        // {x, y + eyeHeight, z}

    // 向き
    getYaw()
    setYaw(yaw)
    getPitch()
    setPitch(pitch)
    getLookDirection()      // 視線方向の単位ベクトル

    // 状態
    isOnGround()
    setOnGround(value)
    isFlying()
    setFlying(value)
    toggleFlying()
    isSprinting()
    setSprinting(value)
    isSneaking()
    setSneaking(value)

    // 速度
    getVelocity()           // {x, y, z}
    setVelocity(vx, vy, vz)
    addVelocity(vx, vy, vz)

    // AABB
    getAABB()               // {minX, minY, minZ, maxX, maxY, maxZ}
}
```

---

### **REQ-2-4-2: プレイヤーコントローラー（PlayerController）**

入力処理とプレイヤー移動を制御するクラス。

#### 操作マッピング

| キー | 通常モード | 飛行モード |
|------|-----------|-----------|
| W | 前進（歩き） | 前進 |
| Ctrl + W | 前進（走り） | 前進（高速） |
| S | 後退 | 後退 |
| A | 左移動 | 左移動 |
| D | 右移動 | 右移動 |
| スペース | ジャンプ | 上昇 |
| Shift | スニーク | 下降 |
| スペース×2 | 飛行ON | 飛行OFF |
| マウス移動 | 視点回転 | 視点回転 |

#### 物理パラメータ

| 項目 | 値 | 説明 |
|------|-----|------|
| WALK_SPEED | 4 | 歩行速度（ブロック/秒） |
| SNEAK_SPEED | 2 | スニーク速度（ブロック/秒） |
| SPRINT_SPEED | 6 | 走り速度（ブロック/秒） |
| FLY_SPEED | 10 | 飛行速度（ブロック/秒） |
| JUMP_VELOCITY | 8 | ジャンプ初速（ブロック/秒） |
| GRAVITY | 32 | 重力加速度（ブロック/秒²） |
| TERMINAL_VELOCITY | 78.4 | 終端速度（ブロック/秒） |

#### ジャンプ高さの計算

ジャンプ初速8、重力32で計算:
- 最高点到達時間: t = v0 / g = 8 / 32 = 0.25秒
- 最高点高さ: h = v0² / (2g) = 64 / 64 = 1.0ブロック

※Minecraft準拠の1.25ブロックには若干届かないが、調整可能

#### スニーク機能

- Shiftキーでスニーク状態ON/OFF
- スニーク中は移動速度が2ブロック/秒に低下
- スニーク中は当たり判定の高さが1.5ブロックに縮小（低い隙間を通れる）
- **落下防止機能**: スニーク中はブロックの端から落ちない（Minecraft式）
  - プレイヤーの足元にブロックがない方向への移動を制限
  - 意図的にジャンプすれば落下可能

#### 飛行モード切り替え

- スペースキーの2回タップで飛行モードをトグル
- ダブルタップ判定時間: 300ms以内
- 飛行モード中は重力無効
- 飛行モード中にブロックに着地すると自動で飛行モードOFF

#### ステップアップ機能

低い段差（0.5ブロック以下）に衝突すると、ジャンプアニメーションなしで瞬時に段差の上に移動する機能。

| 項目 | 値 | 説明 |
|------|-----|------|
| STEP_UP_MAX_HEIGHT | 0.5 | ステップアップ対象の最大段差（ブロック） |

**動作条件:**
- 接地中のみ発動（空中では無効）
- 移動キー（W/A/S/D）押下中のみ発動
- 飛行モード中は無効
- **スニーク中も発動する**（オートジャンプと異なる点）

**判定ロジック:**
1. プレイヤーが水平方向（X軸またはZ軸）に移動しようとしている
2. 移動先にブロックがあり、進めない（水平衝突）
3. そのブロックの上面がプレイヤーの足元から0.5ブロック以内
4. ブロックの上に十分なスペースがある（プレイヤーの高さ分）
5. 瞬時にY座標をブロック上面に移動（ジャンプ速度は付与しない）

**オートジャンプとの違い:**
| 項目 | ステップアップ | オートジャンプ |
|------|---------------|---------------|
| 対象段差 | ≤0.5ブロック | ≤1.0ブロック |
| 動作 | 瞬時にY座標を移動 | ジャンプアニメーション |
| スニーク中 | 発動する | 発動しない |
| 設定 | 常時ON（設定不可） | ON/OFF切り替え可能 |
| 判定タイミング | 衝突解決時 | オートジャンプ判定時 |

**カスタムブロック対応:**
- カスタムブロックの当たり判定ボクセル（4x4x4）の上面にもステップアップ可能
- 例: 下半分（y=0,1）のみ当たり判定があるハーフブロック（高さ0.5）

#### オートジャンプ機能

前進中に段差に衝突すると自動でジャンプして登る機能（Minecraft式）。

| 項目 | 値 | 説明 |
|------|-----|------|
| AUTO_JUMP_MAX_HEIGHT | 1.0 | オートジャンプ対象の最大段差（ブロック） |

**動作条件:**
- 接地中のみ発動（空中では無効）
- 移動キー（W/A/S/D）押下中のみ発動
- 飛行モード中は無効
- スニーク中は無効

**判定ロジック:**
1. プレイヤーが水平方向に移動しようとしている
2. 移動先にブロックがあり、進めない（水平衝突）
3. そのブロックの上面がプレイヤーの足元から1ブロック以内（ステップアップ範囲を除く）
4. ブロックの上に十分なスペースがある（プレイヤーの高さ分）

**設定:**
- デフォルト: ON
- UIで切り替え可能（`#checkbox-auto-jump`）

**ステップアップとの連携:**
- 段差≤0.5ブロック: ステップアップが発動（瞬時移動）
- 段差0.5〜1.0ブロック: オートジャンプが発動（ジャンプアニメーション）
- 段差>1.0ブロック: 何もしない

#### API

```javascript
class PlayerController {
    constructor(player, physicsWorld, options)

    // 入力
    handleKeyDown(event)
    handleKeyUp(event)
    handleMouseMove(event)

    // 更新（毎フレーム呼び出し）
    update(deltaTime)

    // PointerLock
    requestPointerLock(element)
    exitPointerLock()
    isPointerLocked()

    // 設定
    setMouseSensitivity(value)  // デフォルト: 0.002
}
```

---

### **REQ-2-4-3: 物理演算・衝突判定（PhysicsWorld）**

物理演算と衝突判定を担当するクラス。

#### 衝突判定対象

| ブロック種類 | 当たり判定 |
|-------------|-----------|
| 標準ブロック（shape_type = "standard"） | 1×1×1 の AABB |
| カスタムブロック（shape_type = "custom"） | 4×4×4 の当たり判定ボクセル（各0.25×0.25×0.25） |
| 空気ブロック（block_str_id = "air"） | 判定なし |

#### AABB衝突判定

プレイヤーのAABBとブロックのAABBの衝突を検出し、めり込みを解消する。

**押し返し方式:**
1. プレイヤーを移動させる
2. 周辺ブロックとの衝突（めり込み）を検出
3. めり込んでいる場合、ブロック範囲外へ押し返す
4. 押し返した軸の速度を0にする
5. 軸ごとに独立して押し返すことで、結果的にスライドのような動きになる

**軸分離での判定順序:**
1. Y軸（垂直）を先に判定 → 接地判定に使用
2. X軸、Z軸（水平）を判定

**押し返し処理の例:**
```
壁に斜めに突っ込んだ場合:
1. X軸でめり込み検出 → X方向に押し返し
2. Z軸でめり込み検出 → Z方向に押し返し
→ 結果として壁に沿って移動したように見える
```

#### カスタムブロック衝突判定

カスタムブロックは4×4×4の当たり判定ボクセルを持つ。

```javascript
// カスタムブロックの当たり判定ボクセル取得
const collisionData = CustomCollision.decode(block.voxel_collision);
// collisionData[y][z][x] = 0 or 1

// 各ボクセルのワールド座標AABB
// ボクセル(vx, vy, vz) のAABB:
// minX = blockX + vx * 0.25
// minY = blockY + vy * 0.25
// minZ = blockZ + vz * 0.25
// maxX = minX + 0.25
// maxY = minY + 0.25
// maxZ = minZ + 0.25
```

#### 接地判定

- プレイヤーの足元（AABB底面から0.01ブロック下）にブロックがあれば接地
- 接地中は落下速度をリセット
- 接地中のみジャンプ可能（飛行モード除く）

#### API

```javascript
class PhysicsWorld {
    constructor(chunkManager)

    // 衝突判定
    movePlayer(player, velocity, deltaTime)  // 衝突を考慮して移動
    isOnGround(player)                        // 接地判定

    // ブロック取得
    getBlockAt(x, y, z)                       // ワールド座標からブロック取得
    getBlockCollisionAABBs(blockX, blockY, blockZ)  // ブロックのAABBリスト取得

    // レイキャスト（将来のブロック設置/破壊用）
    raycast(origin, direction, maxDistance)
}
```

---

### **REQ-2-4-4: 1人称カメラ（FirstPersonCamera）**

1人称視点のカメラ制御クラス。

#### PointerLock API

- クリックでPointerLockを取得
- ESCキーでPointerLockを解除
- PointerLock中のみマウス操作を受け付ける

#### カメラ設定

| 項目 | 値 |
|------|-----|
| FOV | 70度 |
| Near | 0.1 |
| Far | 1000 |

#### 視点制限

- Pitch（上下）: -89度 〜 +89度（真上・真下を向けないよう制限）
- Yaw（左右）: 制限なし（360度回転可能）

#### API

```javascript
class FirstPersonCamera {
    constructor(camera, player)

    // 更新（毎フレーム呼び出し）
    update()                    // プレイヤー位置・向きをカメラに反映

    // PointerLock
    requestPointerLock(element)
    exitPointerLock()
    isPointerLocked()
    onPointerLockChange(callback)
}
```

---

### **REQ-2-4-5: テストUI**

#### 表示項目

| 項目 | セレクタ | 説明 |
|------|---------|------|
| FPS | `#debug-fps` | フレームレート |
| プレイヤー座標 | `#debug-player-pos` | X, Y, Z（小数点2桁） |
| チャンク座標 | `#debug-chunk-pos` | プレイヤーがいるチャンク |
| 向き | `#debug-player-dir` | Yaw, Pitch（度数表示） |
| 速度 | `#debug-player-speed` | 現在の移動速度 |
| 状態 | `#debug-player-state` | 地上/空中/飛行中 |
| 接地判定 | `#debug-on-ground` | true/false |
| LoD別チャンク数 | `#debug-lod-counts` | LoD0: X, LoD1: Y |
| ポリゴン数 | `#debug-triangles` | 総ポリゴン数 |

#### 操作ボタン

| ボタン | セレクタ | 機能 |
|--------|---------|------|
| リセット | `#btn-reset` | 初期位置に戻る |
| 飛行モード | `#btn-fly-toggle` | ON/OFF切り替え |
| 衝突判定表示 | `#btn-show-collision` | 当たり判定ボックスを可視化 |
| ワイヤーフレーム | `#btn-wireframe` | ワイヤーフレーム表示 |
| ストレージクリア | `#btn-clear-storage` | ストレージクリア |

#### 設定項目

| 項目 | セレクタ | デフォルト | 説明 |
|------|---------|-----------|------|
| LoD 0 範囲 | `#input-lod0-range` | 3 | LoD 0 の半径 |
| 総描画範囲 | `#input-total-range` | 15 | 描画範囲の半径 |
| マウス感度 | `#input-mouse-sensitivity` | 0.002 | マウス感度 |
| ワールド選択 | `#select-world` | flat | フラット/パーリンノイズ |
| オートジャンプ | `#checkbox-auto-jump` | true | オートジャンプのON/OFF |

#### 操作説明表示

画面右下に操作説明を常時表示:

```
WASD: 移動
マウス: 視点
スペース: ジャンプ
Shift: スニーク
Ctrl+W: 走り
スペース×2: 飛行モード
ESC: マウス解除
```

セレクタ: `#controls-help`

#### PointerLock未取得時

画面中央に「クリックして開始」を表示。
セレクタ: `#click-to-start`

---

### **REQ-2-4-6: シーン構成**

2-3をベースに以下を変更:

| 項目 | 2-3 | 2-4 |
|------|-----|-----|
| カメラ | 俯瞰視点 + OrbitControls | 1人称視点 + PointerLock |
| 視点移動 | WASD で視点位置を移動 | WASD でプレイヤーを移動 |
| カメラ追従 | 視点を見下ろす | プレイヤー目線 |

#### 座標系

2-3と同様、左手座標系（worldContainer で Z軸反転）を使用。

- X+: 東
- Y+: 上
- Z+: 北

#### カメラ配置

カメラは **scene直下** に配置する（worldContainerの外）。

- カメラがZ軸反転の影響を受けないようにするため
- プレイヤー座標（左手系）からカメラ座標（Three.js右手系）への変換が必要

```javascript
// プレイヤー座標（左手系）→ カメラ座標（Three.js右手系）
camera.position.set(player.x, player.y + eyeHeight, -player.z);

// カメラの向きもZ軸反転を考慮
// yawは左手系で0=北（Z+）なので、Three.jsでは-Z方向
```

#### 初期位置

- プレイヤー初期位置: (8, 65, 8) - チャンク(0,0)の中央、地表より少し上
- 初期向き: 北向き（Z+方向）

#### ChunkManagerとの連携

- プレイヤー位置に応じてチャンクを生成・解放する
- 既存の `ChunkManager.updateViewPosition(worldX, worldZ)` をそのまま使用
- 毎フレーム、プレイヤー位置でupdateViewPosition()を呼び出す

```javascript
// 毎フレームの更新
chunkManager.updateViewPosition(player.x, player.z);
```

#### ブロックデータの取得

衝突判定に必要なブロック情報はGAS APIから取得済みのデータを使用。

- `TextureLoader` からブロック定義を取得
- `shape_type`: "standard" または "custom"
- `voxel_collision`: カスタムブロックの当たり判定データ（Base64）

---

### **REQ-2-4-7: block_manager.html への統合**

`src/tool/block_manager.html` に「移動テスト」タブを追加する。

- タブをクリックすると移動テストページが表示される
- テストページは `iframe` で `../test/2-4_movement_test.html` を埋め込む
- iframe は画面いっぱいに表示する

---

### **REQ-2-4-8: パフォーマンス要件**

| 条件 | 要件 |
|------|------|
| LoD 0 半径: 3、総描画半径: 10 | 移動中55FPS以上を維持 |

#### 衝突判定の最適化

- プレイヤー周辺のブロックのみ判定（半径2ブロック程度）
- 空気ブロックは早期スキップ
- カスタムブロックの当たり判定データはキャッシュ

---

## UIセレクタ（テスト用）

Playwrightテストで使用するセレクタを定義する。

### テストページ内

| 要素 | セレクタ | 説明 |
|------|---------|------|
| キャンバス | `#game-canvas` | Three.jsの描画キャンバス |
| デバッグパネル | `#debug-panel` | デバッグ情報表示パネル |
| FPS表示 | `#debug-fps` | FPS値 |
| プレイヤー座標 | `#debug-player-pos` | プレイヤー座標 |
| チャンク座標 | `#debug-chunk-pos` | チャンク座標 |
| 向き表示 | `#debug-player-dir` | Yaw, Pitch |
| 速度表示 | `#debug-player-speed` | 移動速度 |
| 状態表示 | `#debug-player-state` | 地上/空中/飛行 |
| 接地判定 | `#debug-on-ground` | 接地状態 |
| LoD別チャンク数 | `#debug-lod-counts` | LoD0/LoD1チャンク数 |
| ポリゴン数 | `#debug-triangles` | 総ポリゴン数 |
| リセットボタン | `#btn-reset` | 初期位置リセット |
| 飛行モードボタン | `#btn-fly-toggle` | 飛行モード切替 |
| 衝突判定表示ボタン | `#btn-show-collision` | 衝突判定可視化 |
| ワイヤーフレームボタン | `#btn-wireframe` | ワイヤーフレーム |
| ストレージクリアボタン | `#btn-clear-storage` | ストレージクリア |
| LoD 0 範囲入力 | `#input-lod0-range` | LoD 0 半径 |
| 総描画範囲入力 | `#input-total-range` | 描画範囲 |
| マウス感度入力 | `#input-mouse-sensitivity` | マウス感度 |
| ワールド選択 | `#select-world` | ワールドタイプ |
| 操作説明 | `#controls-help` | 操作説明パネル |
| クリック開始表示 | `#click-to-start` | PointerLock促進表示 |

### block_manager.html内

| 要素 | セレクタ | 説明 |
|------|---------|------|
| 移動テストタブ | `.tab[data-tab="movementTest"]` | タブボタン |
| 移動テストコンテンツ | `#movementTest` | タブコンテンツ |
| iframe | `#movementTestFrame` | テストページを埋め込むiframe |

---

## テスト方針

### 機能テスト

1. **移動テスト**
   - WASDキーでプレイヤーが移動する
   - 移動方向が視点の向きに追従する
   - 走り（Ctrl+W）で速度が上がる

2. **視点操作テスト**
   - マウス移動で視点が回転する
   - Pitch制限が機能する（真上・真下を超えない）

3. **ジャンプテスト**
   - スペースキーでジャンプする
   - 接地中のみジャンプ可能
   - 重力で落下する

4. **飛行モードテスト**
   - スペース2回タップで飛行モードON/OFF
   - 飛行中はスペースで上昇、Shiftで下降
   - 飛行中は重力無効

5. **衝突判定テスト**
   - ブロックを通り抜けない
   - カスタムブロックの当たり判定ボクセルと衝突する
   - 壁に沿ってスライドする（押し返し処理の結果）

6. **スニークテスト**
   - Shiftキーでスニーク状態になる
   - スニーク中は移動速度が低下する
   - スニーク中は当たり判定の高さが縮小する
   - スニーク中はブロックの端から落ちない

7. **接地判定テスト**
   - ブロック上に立つと接地判定がtrue
   - 空中では接地判定がfalse

8. **UI操作テスト**
   - 各ボタンが正しく動作する
   - デバッグ情報が更新される

9. **オートジャンプテスト**
   - オートジャンプ設定のON/OFF切り替えができる
   - 1ブロック段差でオートジャンプが発動する
   - 2ブロック段差ではオートジャンプしない
   - 空中ではオートジャンプしない
   - スニーク中はオートジャンプしない
   - 飛行モード中はオートジャンプしない

---

## 補足

- Three.js CDN: `https://cdn.jsdelivr.net/npm/three@0.128.0/`
- PointerLock API: https://developer.mozilla.org/ja/docs/Web/API/Pointer_Lock_API
