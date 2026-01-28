# 仕様書: 2-5 ブロック生成と破壊

## 概要

視線レイキャストによるブロック選択、生成（設置）、破壊を行うテスト。
2-4の移動テストをベースに、ブロック操作機能を追加する。

- 視線方向へのレイキャストでブロックを選択
- 選択中のブロックをワイヤーフレーム＋接触面ハイライトで表示
- 左クリックでブロック破壊（即時）
- 右クリックでブロック設置（即時）
- ホットバーで設置ブロックを選択
- 変更はIndexedDBに保存

## 関連資料

- spec_list.md: 機能一覧
- spec_2-4_movement_test.md: 移動テスト（ベース）
- spec_2-2_chunk_manager_test.md: チャンク管理・保存

## 技術構成

| 項目 | 選定 |
|------|------|
| 3Dライブラリ | Three.js（CDN） |
| レイキャスト | PhysicsWorld.raycast()を拡張 |
| ストレージ | IndexedDB（2-2から継続） |
| テスト方法 | テストページ（HTML） |

## ファイル構成

```
src/
├── game/
│   ├── PhysicsWorld.js         # 既存: raycast改善
│   ├── BlockInteraction.js     # 新規: ブロック操作クラス
│   ├── BlockHighlight.js       # 新規: ハイライト表示
│   └── Hotbar.js               # 新規: ホットバーUI
├── test/
│   ├── 2-5_block_test.html     # 新規: テストページ
│   └── 2-5_main.js             # 新規: メイン処理
```

---

## 要件

### **REQ-2-5-1: レイキャスト（視線判定）**

プレイヤーの視線方向にレイを飛ばし、最初にヒットするブロックを特定する。

#### パラメータ

| 項目 | 値 | 説明 |
|------|-----|------|
| 最大到達距離 | 10ブロック | これより遠いブロックは選択不可 |
| ステップ精度 | 0.05ブロック | レイの進行刻み幅 |

#### カスタムブロックの当たり判定

カスタムブロック（`shape_type === 'custom'`）の場合、`voxel_collision`（4x4x4の当たり判定データ）に基づいてレイキャストを行う。

- 各当たり判定ボクセルは0.25ブロックサイズ（1/4）
- `voxel_collision`の値が1のボクセルのみがヒット対象
- 当たり判定ボクセルがない部分はレイが通過する
- 通常ブロックと同様に、ヒットした面と隣接座標を返す

#### 戻り値

```javascript
{
    hit: true,              // ヒットしたか
    blockX: number,         // ブロックのワールドX座標
    blockY: number,         // ブロックのワールドY座標
    blockZ: number,         // ブロックのワールドZ座標
    face: string,           // ヒットした面 ('top'|'bottom'|'north'|'south'|'east'|'west')
    distance: number,       // プレイヤーからの距離
    adjacentX: number,      // 隣接ブロック（設置位置）のX座標
    adjacentY: number,      // 隣接ブロック（設置位置）のY座標
    adjacentZ: number       // 隣接ブロック（設置位置）のZ座標
}
```

#### 面の定義

| 面 | 方向 | 隣接ブロックのオフセット |
|----|------|------------------------|
| top | Y+ | (0, +1, 0) |
| bottom | Y- | (0, -1, 0) |
| north | Z+ | (0, 0, +1) |
| south | Z- | (0, 0, -1) |
| east | X+ | (+1, 0, 0) |
| west | X- | (-1, 0, 0) |

---

### **REQ-2-5-2: ブロックハイライト（BlockHighlight）**

視線が当たっているブロックを視覚的に強調表示する。

#### 表示内容

1. **ワイヤーフレーム**: ブロック全体を黒い線で囲む
2. **接触面ハイライト**: ヒットした面を半透明の白で塗りつぶす

#### 表示パラメータ

| 項目 | 値 |
|------|-----|
| ワイヤーフレーム色 | 黒（#000000） |
| ワイヤーフレーム太さ | 2px |
| 接触面色 | 白（#FFFFFF） |
| 接触面透明度 | 0.3 |
| ブロック境界からのオフセット | 0.001（Zファイティング防止） |

#### カスタムブロック対応

- カスタムブロックは1×1×1のバウンディングボックスでハイライト
- 個々のボクセル単位ではなく、ブロック全体を囲む

#### API

```javascript
class BlockHighlight {
    constructor(scene)

    // ハイライト更新
    update(raycastResult)   // レイキャスト結果を受けて表示更新

    // 表示制御
    show()
    hide()

    // 破棄
    dispose()
}
```

---

### **REQ-2-5-3: ブロック破壊**

左クリックで視線上のブロックを即時破壊する。

#### 動作フロー

1. 左クリックを検出
2. レイキャストでヒットブロックを取得
3. ヒットがなければ何もしない
4. ブロックを「air」に置換
5. チャンクメッシュを再構築
6. IndexedDBに保存

#### 破壊制限

| 制限 | 説明 |
|------|------|
| Y座標 | Y=0（岩盤層）は破壊不可 |
| 空気 | 既にairのブロックは対象外 |

#### ChunkDataへの反映

```javascript
// ブロック破壊
chunkData.setBlock(localX, blockY, localZ, 'air');

// メッシュ再構築
chunkManager.rebuildChunkMesh(chunkX, chunkZ);

// IndexedDBに保存
chunkStorage.saveChunk(chunkX, chunkZ, chunkData);
```

---

### **REQ-2-5-4: ブロック設置**

右クリックで隣接位置にブロックを即時設置する。

#### 動作フロー

1. 右クリックを検出
2. レイキャストでヒットブロックと隣接位置を取得
3. ヒットがなければ何もしない
4. 隣接位置がプレイヤーと重なる場合は設置不可
5. ホットバーで選択中のブロックを設置
6. チャンクメッシュを再構築
7. IndexedDBに保存

#### 設置制限

| 制限 | 説明 |
|------|------|
| プレイヤー重複 | プレイヤーのAABBと重なる位置には設置不可 |
| Y座標範囲 | Y=0〜127の範囲内のみ |
| 既存ブロック | 既にブロックがある位置には設置不可（airのみ上書き可） |

#### プレイヤー重複判定

```javascript
// 設置位置のAABB
const blockAABB = {
    minX: adjacentX,
    minY: adjacentY,
    minZ: adjacentZ,
    maxX: adjacentX + 1,
    maxY: adjacentY + 1,
    maxZ: adjacentZ + 1
};

// プレイヤーのAABBと交差するか
const playerAABB = player.getAABB();
if (aabbIntersects(blockAABB, playerAABB)) {
    // 設置不可
    return false;
}
```

---

### **REQ-2-5-5: ホットバー（Hotbar）**

設置するブロックを選択するUI。

#### 仕様

| 項目 | 値 |
|------|-----|
| スロット数 | 9 |
| 初期ブロック | GASから取得したブロック一覧の最初の9個 |
| 選択操作 | マウスホイール |
| 入れ替え機能 | なし（固定） |

#### 表示

- 画面下部中央に横並びで表示
- 選択中のスロットは枠を強調（白い太枠）
- 各スロットにブロックのサムネイル画像を表示

#### 操作

| 操作 | 動作 |
|------|------|
| ホイール上 | 前のスロットへ（1→9→8...） |
| ホイール下 | 次のスロットへ（1→2→3...） |

#### API

```javascript
class Hotbar {
    constructor(container, blocks)

    // スロット操作
    selectSlot(index)           // 0-8
    getSelectedSlot()           // 現在の選択インデックス
    getSelectedBlock()          // 選択中のブロック定義

    // ホイール操作
    handleWheel(event)

    // 表示更新
    updateDisplay()
}
```

#### HTML構造

```html
<div id="hotbar">
    <div class="hotbar-slot selected" data-slot="0">
        <img src="..." alt="block">
    </div>
    <div class="hotbar-slot" data-slot="1">
        <img src="..." alt="block">
    </div>
    <!-- ... 9スロット -->
</div>
```

#### CSS

```css
#hotbar {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 4px;
    background: rgba(0, 0, 0, 0.5);
    padding: 8px;
    border-radius: 4px;
}

.hotbar-slot {
    width: 50px;
    height: 50px;
    border: 2px solid #555;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
}

.hotbar-slot.selected {
    border-color: #fff;
    border-width: 3px;
}

.hotbar-slot img {
    max-width: 40px;
    max-height: 40px;
    image-rendering: pixelated;
}
```

---

### **REQ-2-5-6: BlockInteraction（統合クラス）**

レイキャスト、ハイライト、破壊・設置を統合管理するクラス。

#### API

```javascript
class BlockInteraction {
    constructor(player, physicsWorld, chunkManager, chunkStorage, scene)

    // 初期化
    init(blocks)                // ブロック定義を受け取りホットバー初期化

    // 毎フレーム更新
    update()                    // レイキャスト実行、ハイライト更新

    // 入力処理
    handleMouseDown(event)      // 左クリック: 破壊、右クリック: 設置
    handleWheel(event)          // ホットバー操作

    // 状態取得
    getTargetBlock()            // 現在のターゲットブロック情報

    // 破棄
    dispose()
}
```

---

### **REQ-2-5-7: IndexedDB保存**

ブロックの変更はIndexedDBに即時保存する。

#### 保存タイミング

- ブロック破壊時
- ブロック設置時

#### 保存処理

既存の`ChunkStorage`を使用：

```javascript
// チャンクデータを保存
await chunkStorage.saveChunk(chunkX, chunkZ, chunkData);
```

#### 注意事項

- 保存は非同期で行い、UIをブロックしない
- 保存エラーはコンソールに出力（ユーザー通知なし）

---

### **REQ-2-5-8: テストUI**

2-4のUIに以下を追加。

#### 追加表示項目

| 項目 | セレクタ | 説明 |
|------|---------|------|
| ターゲットブロック | `#debug-target-block` | 視線上のブロックID |
| ターゲット座標 | `#debug-target-pos` | ブロック座標 (X, Y, Z) |
| ターゲット面 | `#debug-target-face` | ヒット面 |
| 選択中スロット | `#debug-selected-slot` | ホットバーの選択番号 |

#### クロスヘア

画面中央にクロスヘア（照準）を表示。

```css
#crosshair {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 20px;
    height: 20px;
    pointer-events: none;
}

#crosshair::before,
#crosshair::after {
    content: '';
    position: absolute;
    background: white;
}

#crosshair::before {
    width: 2px;
    height: 20px;
    left: 9px;
    top: 0;
}

#crosshair::after {
    width: 20px;
    height: 2px;
    top: 9px;
    left: 0;
}
```

セレクタ: `#crosshair`

---

### **REQ-2-5-9: 操作説明の更新**

操作説明に以下を追加：

```
左クリック: ブロック破壊
右クリック: ブロック設置
ホイール: ブロック選択
```

---

### **REQ-2-5-10: block_manager.html への統合**

`src/tool/block_manager.html` に「ブロック操作テスト」タブを追加する。

- タブをクリックするとテストページが表示される
- テストページは `iframe` で `../test/2-5_block_test.html` を埋め込む
- iframe は画面いっぱいに表示する

---

## UIセレクタ（テスト用）

Playwrightテストで使用するセレクタを定義する。

### テストページ内

| 要素 | セレクタ | 説明 |
|------|---------|------|
| キャンバス | `#game-canvas` | Three.jsの描画キャンバス |
| クロスヘア | `#crosshair` | 画面中央の照準 |
| ホットバー | `#hotbar` | ホットバーコンテナ |
| ホットバースロット | `.hotbar-slot` | 各スロット |
| 選択中スロット | `.hotbar-slot.selected` | 選択状態のスロット |
| ターゲットブロック表示 | `#debug-target-block` | ターゲットブロックID |
| ターゲット座標表示 | `#debug-target-pos` | ターゲット座標 |
| ターゲット面表示 | `#debug-target-face` | ヒット面 |
| 選択スロット表示 | `#debug-selected-slot` | 選択番号 |

### block_manager.html内

| 要素 | セレクタ | 説明 |
|------|---------|------|
| ブロック操作テストタブ | `.tab[data-tab="blockTest"]` | タブボタン |
| ブロック操作テストコンテンツ | `#blockTest` | タブコンテンツ |
| iframe | `#blockTestFrame` | テストページを埋め込むiframe |

---

## テスト方針

### 機能テスト

1. **レイキャスト動作確認**
   - 視線上のブロックが正しく検出される
   - 到達距離10ブロックを超えるとヒットしない
   - 空気ブロックは無視される

2. **ハイライト表示確認**
   - ブロックにワイヤーフレームが表示される
   - ヒット面がハイライトされる
   - ターゲットがない時はハイライトが非表示

3. **ブロック破壊テスト**
   - 左クリックでブロックが破壊される
   - 破壊後にメッシュが更新される
   - Y=0のブロックは破壊できない

4. **ブロック設置テスト**
   - 右クリックでブロックが設置される
   - 正しい面の隣接位置に設置される
   - プレイヤーと重なる位置には設置できない
   - 既存ブロックがある位置には設置できない

5. **ホットバー操作テスト**
   - マウスホイールでスロットが切り替わる
   - 選択中のスロットが強調表示される
   - 選択したブロックが設置される

6. **IndexedDB保存テスト**
   - 破壊したブロックがリロード後も消えている
   - 設置したブロックがリロード後も残っている

7. **カスタムブロック対応テスト**
   - カスタムブロックを設置できる
   - カスタムブロックを破壊できる
   - カスタムブロックのレイキャストが当たり判定ボクセルに基づく

---

## 補足

### 座標系

2-4と同様、左手座標系を使用。

- X+: 東
- Y+: 上
- Z+: 北

### パフォーマンス考慮

- レイキャストは毎フレーム実行（軽量処理）
- メッシュ再構築は破壊・設置時のみ
- IndexedDB保存は非同期
- グリーディメッシング: デフォルトON（2-2仕様を継承）
- カスタムブロックのグリーディメッシング: 同じマテリアルの隣接ボクセル面をマージ

### カスタムブロックのグリーディメッシング

カスタムブロック（8x8x8ボクセル）のメッシュ生成でグリーディメッシングを適用し、同じマテリアルの隣接面をマージすることでポリゴン数を削減する。

#### CustomBlockMeshBuilder API

```javascript
/**
 * グリーディメッシングでメッシュを生成
 * @param {Uint8Array} voxelData - ボクセルデータ
 * @param {Array} materials - マテリアル配列
 * @param {number} voxelSize - ボクセルサイズ
 * @returns {THREE.Mesh} 単一のマージされたメッシュ
 */
buildWithUVGreedy(voxelData, materials, voxelSize = 0.125)
```

#### 動作仕様

- 各面方向（+X, -X, +Y, -Y, +Z, -Z）に対してグリーディメッシングを適用
- 同じマテリアル値の隣接面をマージ
- マージされた面のUVはタイリング（元のボクセル単位で分割）
- 内部面（隣接ボクセルで隠れる面）はカリング
- 結果は単一のTHREE.Meshとして返す（THREE.Groupではない）

### Three.js CDN

`https://cdn.jsdelivr.net/npm/three@0.128.0/`
