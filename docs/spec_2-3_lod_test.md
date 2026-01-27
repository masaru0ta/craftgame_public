# 仕様書: 2-3 LoD設定と表示テスト

## 概要

LoD（Level of Detail）システムを実装し、視点からの距離に応じてチャンクの描画詳細度を変える。
遠距離のチャンクを簡略化することで、広い視界を維持しながらパフォーマンスを向上させる。

## 関連資料

- spec_list.md: 機能一覧
- spec_2-1_generate_1chunk.md: 1チャンク生成・表示テスト
- spec_2-2_chunk_manager_test.md: チャンク管理テスト
- spec_1-2_gas_api.md: GAS API仕様（テクスチャのcolor_hex）

## 技術構成

| 項目 | 選定 |
|------|------|
| 3Dライブラリ | Three.js（CDN） |
| カメラ操作 | OrbitControls |
| ストレージ | IndexedDB（2-2から継続） |
| テスト方法 | テストページ（HTML） |

## ファイル構成

```
src/
├── game/
│   ├── ChunkData.js            # 既存
│   ├── ChunkMeshBuilder.js     # 既存: LoD対応メッシュ生成を追加
│   ├── ChunkManager.js         # 既存: LoD管理機能を追加
│   ├── ChunkStorage.js         # 既存
│   ├── TextureLoader.js        # 既存: 頂点カラー対応を追加
│   ├── WorldGenerator.js       # 既存: 高さ・色取得関数を追加
│   └── LoDHelper.js            # 新規: LoD計算・メッシュ生成ヘルパー
├── test/
│   ├── 2-3_lod_test.html       # 新規: テストページ
│   └── 2-3_main.js             # 新規: メイン処理
```

---

## 要件

### **REQ-2-3-1: LoDレベル定義**

視点からの距離に応じて4段階のLoDレベルを適用する。

| レベル | 名称 | 描画方式 | 想定ポリゴン数 |
|--------|------|----------|---------------|
| LoD 0 | 近距離 | 全テクスチャ、カスタムブロック表示 | 数千〜数万/チャンク |
| LoD 1 | 中距離 | 頂点カラー、カスタムブロック→標準ブロック形状+代表色 | 数千/チャンク |
| LoD 2 | 遠距離 | 1チャンク = 4隅の高さで1面 | 2/チャンク |
| LoD 3 | 最遠距離 | 4×4チャンク = 4隅の高さで1面 | 2/16チャンク |

#### LoD 0: 近距離（フル詳細）

- 2-2で実装済みの描画方式をそのまま使用
- テクスチャアトラス使用
- カスタムブロックは定義通りの形状で描画
- グリーディーメッシング適用可能

#### LoD 1: 中距離（頂点カラー）

- テクスチャを使用せず、頂点カラーで描画
- 各ブロックの色はテクスチャ定義の `color_hex` を使用
- カスタムブロック（shape_type = "custom"）は標準ブロック形状（1×1×1立方体）で描画
- カスタムブロックの色はそのブロックのマテリアルの `color_hex` を使用
- グリーディーメッシング適用可能（同色ブロックをマージ）

#### LoD 2: 遠距離（チャンク単位簡略化）

- 1チャンクを4隅の高さで傾いた1つの四角形として描画
- 4隅の座標: (0,0), (15,0), (0,15), (15,15) のワールドX,Z座標
- 各隅の高さは `WorldGenerator.getTerrainHeight(worldX, worldZ)` で取得
- 面の色は `WorldGenerator.getTerrainColor(worldX, worldZ)` で取得
- 4隅それぞれの色を頂点カラーとして設定（補間でグラデーション）
- ポリゴン数: 2（1四角形 = 2三角形）

#### LoD 3: 最遠距離（4×4チャンク単位簡略化）

- 4×4チャンク（64チャンク分）を1つの四角形として描画
- グリッドは固定: チャンク座標を4の倍数で区切る
  - 例: (0,0)〜(3,3)、(4,0)〜(7,3)、(-4,-4)〜(-1,-1) など
- 4隅の座標: グリッドの角のワールド座標
- 高さと色は LoD 2 と同様に WorldGenerator から取得
- ポリゴン数: 2/16チャンク

---

### **REQ-2-3-2: 距離閾値設定**

LoDレベルの切り替え距離をUIで設定可能にする。

| 設定項目 | デフォルト値 | 説明 |
|----------|-------------|------|
| LoD 0 範囲 | 3 | 視点から3チャンク以内 |
| LoD 1 範囲 | 7 | 視点から7チャンク以内 |
| LoD 2 範囲 | 15 | 視点から15チャンク以内 |
| LoD 3 範囲 | それ以上 | 15チャンクより遠い |

- 距離計算はチェビシェフ距離（最大座標差）を使用
  - `distance = max(|chunkX - viewChunkX|, |chunkZ - viewChunkZ|)`
- 切り替えは即時（フェードなし）

#### LoD動的切り替え

視点移動により既存チャンクのLoDレベルが変わった場合、メッシュを再生成する。

- 各チャンクは現在のLoDレベルを `mesh.userData.lodLevel` に保持
- 視点移動時、`getChunkLoD()` で計算したLoDと保持しているLoDが異なる場合:
  - LoD 0/1 間の切り替え: メッシュを再生成（テクスチャ ↔ 頂点カラー）
  - LoD 0/1 → LoD 2/3: 通常チャンクを削除し、LoD 2/3メッシュを生成
  - LoD 2/3 → LoD 0/1: LoD 2/3メッシュを削除し、通常チャンクを生成

---

### **REQ-2-3-3: WorldGenerator 拡張**

地形の高さと色を返す関数を追加する。

```javascript
/**
 * 指定座標の地形の高さを取得
 * @param {number} worldX - ワールドX座標
 * @param {number} worldZ - ワールドZ座標
 * @returns {number} 地形の高さ（Y座標）
 */
getTerrainHeight(worldX, worldZ)

/**
 * 指定座標の地形の色を取得
 * @param {number} worldX - ワールドX座標
 * @param {number} worldZ - ワールドZ座標
 * @returns {string} 色（16進数形式、例: "#4CAF50"）
 */
getTerrainColor(worldX, worldZ)
```

- 現在のテスト地形（フラット）では:
  - 高さ: 常に64（地表）
  - 色: 草ブロックの色（#4CAF50 など）
- 将来的にはノイズベースの地形生成に対応可能な設計とする

---

### **REQ-2-3-4: ChunkManager LoD対応**

ChunkManagerにLoD管理機能を追加する。

```javascript
/**
 * LoD閾値を設定
 * @param {number} lod0Range - LoD 0の範囲（チャンク数）
 * @param {number} lod1Range - LoD 1の範囲（チャンク数）
 * @param {number} lod2Range - LoD 2の範囲（チャンク数）
 */
setLoDRanges(lod0Range, lod1Range, lod2Range)

/**
 * チャンクのLoDレベルを取得
 * @param {number} chunkX - チャンクX座標
 * @param {number} chunkZ - チャンクZ座標
 * @returns {number} LoDレベル（0-3）
 */
getChunkLoD(chunkX, chunkZ)
```

- 視点移動時にLoDレベルが変わったチャンクのメッシュを再生成
- LoD 3のメッシュは4×4チャンクグリッド単位で管理

---

### **REQ-2-3-5: LoDHelper クラス**

LoD 2/3用のメッシュ生成を担当する新規クラス。

```javascript
class LoDHelper {
    /**
     * LoD 2用メッシュを生成（1チャンク = 1四角形）
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @param {WorldGenerator} worldGenerator - 地形生成クラス
     * @returns {THREE.Mesh} 生成されたメッシュ
     */
    static createLoD2Mesh(chunkX, chunkZ, worldGenerator)

    /**
     * LoD 3用メッシュを生成（4×4チャンク = 1四角形）
     * @param {number} gridX - 4×4グリッドのX座標（4の倍数）
     * @param {number} gridZ - 4×4グリッドのZ座標（4の倍数）
     * @param {WorldGenerator} worldGenerator - 地形生成クラス
     * @returns {THREE.Mesh} 生成されたメッシュ
     */
    static createLoD3Mesh(gridX, gridZ, worldGenerator)

    /**
     * 4×4グリッド座標を計算
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @returns {{gridX: number, gridZ: number}} グリッド座標
     */
    static getLoD3Grid(chunkX, chunkZ)
}
```

---

### **REQ-2-3-6: ChunkMeshBuilder LoD 1対応**

頂点カラーモードを追加する。

```javascript
/**
 * LoD 1用メッシュを生成（頂点カラー、カスタムブロック→標準形状）
 * @param {ChunkData} chunkData - チャンクデータ
 * @param {Object} blockColors - ブロックID→色のマップ
 * @param {Object} blockShapes - ブロックID→shape_typeのマップ
 * @param {boolean} greedy - グリーディーメッシング有効化
 * @returns {THREE.Mesh} 生成されたメッシュ
 */
buildLoD1(chunkData, blockColors, blockShapes, greedy = true)
```

- テクスチャではなく頂点カラー（vertexColors）を使用
- マテリアルは `MeshLambertMaterial({ vertexColors: true })`
- カスタムブロック（shape_type = "custom"）は1×1×1の立方体として描画

---

### **REQ-2-3-7: テストUI**

画面左上にデバッグパネルを表示する。

#### 表示項目

| 項目 | セレクタ | 説明 |
|------|---------|------|
| FPS | `#debug-fps` | フレームレート |
| 総ポリゴン数 | `#debug-triangles` | 全LoDレベル合計 |
| ドローコール数 | `#debug-drawcalls` | 描画呼び出し回数 |
| 視点座標 | `#debug-position` | 現在の視点座標 |
| LoD別チャンク数 | `#debug-lod-counts` | LoD0: X, LoD1: Y, LoD2: Z, LoD3: W |

#### 操作項目

| 項目 | セレクタ | 説明 |
|------|---------|------|
| LoD 0 範囲 | `#input-lod0-range` | 数値入力（デフォルト: 3） |
| LoD 1 範囲 | `#input-lod1-range` | 数値入力（デフォルト: 7） |
| LoD 2 範囲 | `#input-lod2-range` | 数値入力（デフォルト: 15） |
| 総描画範囲 | `#input-total-range` | NxN範囲（デフォルト: 31） |
| ワイヤーフレーム | `#btn-wireframe` | ON/OFF切り替え |
| グリーディー | `#btn-greedy` | ON/OFF切り替え（デフォルト: ON） |
| カリング | `#btn-culling` | ON/OFF切り替え（デフォルト: ON） |
| LoD色分け表示 | `#btn-lod-debug` | デバッグ用: LoDレベルで色分け |
| リセット | `#btn-reset` | 視点を原点に戻す |
| ストレージクリア | `#btn-clear-storage` | 保存データを全削除 |

#### LoD色分け表示モード

デバッグ用にLoDレベルごとに色を付けて表示する。

| LoDレベル | デバッグ色 |
|-----------|-----------|
| LoD 0 | 緑 (#00FF00) |
| LoD 1 | 黄 (#FFFF00) |
| LoD 2 | オレンジ (#FFA500) |
| LoD 3 | 赤 (#FF0000) |

---

### **REQ-2-3-8: 手動操作**

2-2と同様のWASD操作で視点移動。

- W: 北へ移動（Z+）
- S: 南へ移動（Z-）
- A: 西へ移動（X-）
- D: 東へ移動（X+）
- 移動に応じてLoDレベルが更新される

#### カメラ操作（OrbitControls）

2-2と同様のOrbitControls操作でカメラを制御する。

- **左ドラッグ**: カメラ回転（視点を中心に周回）
- **マウスホイール**: ズームイン/アウト
- **右ドラッグ**: パン（視点と並行移動）※デフォルト無効
- **カメラ追従**: 視点移動（WASD）に応じてカメラ位置も追従する（カメラの相対位置を維持）

**実装詳細:**
- OrbitControlsのターゲットを視点位置に設定
- 視点移動時はカメラオフセット（ターゲットからの相対位置）を維持しながら追従
- ユーザーのドラッグ/ホイール操作によるカメラ変更はリセットしない
- iframeで埋め込まれた場合: クリックでフォーカスを取得してキー操作を有効化

---

### **REQ-2-3-9: ワールド選択機能**

ドロップダウンでワールドタイプを切り替えられるようにする。

#### ワールドタイプ

| 値 | 表示名 | 説明 |
|----|--------|------|
| `flat` | フラットテスト | 現在のテスト地形（平坦、座標表示あり） |
| `perlin` | 簡易パーリンノイズ | パーリンノイズによる起伏のある地形 |

#### 簡易パーリンノイズ地形（2層ノイズ）

2つのパーリンノイズを組み合わせて地形を生成する。

**パーリンノイズ1（ベース地形 - 細かい起伏）:**

| パラメータ | セレクタ | デフォルト値 | 範囲 | 説明 |
|-----------|---------|------------|------|------|
| シード値 | `#input-perlin1-seed` | 12345 | 1〜99999 | 乱数シード |
| スケール | `#input-perlin1-scale` | 0.02 | 0.001〜0.1 | 狭い間隔（細かい起伏） |
| 振幅 | `#input-perlin1-amplitude` | 0.3 | 0〜2 | 高さへの寄与度 |

**パーリンノイズ2（山 - 大きい高さ、広い間隔）:**

| パラメータ | セレクタ | デフォルト値 | 範囲 | 説明 |
|-----------|---------|------------|------|------|
| シード値 | `#input-perlin2-seed` | 67890 | 1〜99999 | 乱数シード |
| スケール | `#input-perlin2-scale` | 0.005 | 0.001〜0.1 | 広い間隔（大きな山） |
| 振幅 | `#input-perlin2-amplitude` | 1.0 | 0〜2 | 基本振幅 |
| 山閾値 | `#input-perlin2-threshold` | 60 | 1〜100 | この高さ以上で振幅3倍 |

**共通パラメータ:**

| パラメータ | セレクタ | デフォルト値 | 範囲 | 説明 |
|-----------|---------|------------|------|------|
| 最低高さ | `#input-perlin-min-height` | 40 | 1〜100 | 地形の最低高さ |
| 最高高さ | `#input-perlin-max-height` | 100 | 50〜200 | 地形の最高高さ |

**高さ計算式:**

```javascript
// 2つのノイズを合成
combinedNoise = noise1 * amplitude1 + noise2 * amplitude2
baseHeight = minHeight + smoothstep(combinedNoise) * (maxHeight - minHeight)

// 山閾値を超えた場合、超過分を3倍に強調
if (baseHeight > threshold) {
  excess = baseHeight - threshold
  height = threshold + excess * 3
}
```

**地形の特徴:**
- ノイズ1: 小さな丘や谷（細かい凹凸）
- ノイズ2: 大きな山脈（広範囲でゆったりした隆起）
- 山閾値超過時に急峻な山が形成される

**地表ブロック:**
- 高さ80未満: 草（grass）
- 高さ80以上: 石（stone）

**地下ブロック:** 土（dirt）

**色（LoD 2/3用）:**
- 低地（40〜64）: 濃い緑 → 薄い緑
- 高地（64〜80）: 薄い緑 → 茶色
- 山頂（80〜100）: 茶色 → 灰色

**パラメータ変更時の動作:**
- パラメータを変更すると自動的にワールドを再生成
- ストレージはクリアされる

#### ワールド切り替え処理

1. ドロップダウンで選択変更
2. 全チャンクをクリア
3. ストレージをクリア（新ワールドのデータで上書きされるため）
4. 新しいワールドタイプでチャンクを再生成

#### WorldGenerator 拡張

```javascript
/**
 * ワールドタイプを設定
 * @param {string} type - "flat" または "perlin"
 */
setWorldType(type)

/**
 * 簡易パーリンノイズ地形を生成
 * @param {ChunkData} chunkData - 対象のチャンクデータ
 */
generateSimplePerlin(chunkData)
```

---

### **REQ-2-3-10: block_manager.html への統合**

`src/tool/block_manager.html` に「LoDテスト」タブを追加する。

- タブをクリックするとLoDテストページが表示される
- テストページは `iframe` で `../test/2-3_lod_test.html` を埋め込む
- iframe は画面いっぱいに表示する

---

## UIセレクタ（テスト用）

Playwrightテストで使用するセレクタを定義する。

### テストページ内

| 要素 | セレクタ | 説明 |
|------|---------|------|
| キャンバス | `#game-canvas` | Three.jsの描画キャンバス |
| デバッグパネル | `#debug-panel` | デバッグ情報表示パネル |
| FPS表示 | `#debug-fps` | FPS値 |
| ポリゴン数表示 | `#debug-triangles` | 総ポリゴン数 |
| ドローコール表示 | `#debug-drawcalls` | ドローコール数 |
| 視点座標表示 | `#debug-position` | 視点座標 |
| LoD別チャンク数 | `#debug-lod-counts` | 各LoDのチャンク数 |
| LoD 0 範囲入力 | `#input-lod0-range` | LoD 0の閾値 |
| LoD 1 範囲入力 | `#input-lod1-range` | LoD 1の閾値 |
| LoD 2 範囲入力 | `#input-lod2-range` | LoD 2の閾値 |
| 総描画範囲入力 | `#input-total-range` | 描画範囲 |
| ワイヤーフレームボタン | `#btn-wireframe` | ワイヤーフレーム切り替え |
| グリーディーボタン | `#btn-greedy` | グリーディーメッシング切り替え |
| カリングボタン | `#btn-culling` | カリング切り替え |
| LoD色分けボタン | `#btn-lod-debug` | LoD色分け表示切り替え |
| リセットボタン | `#btn-reset` | リセット |
| ストレージクリアボタン | `#btn-clear-storage` | ストレージクリア |
| ワールド選択 | `#select-world` | ワールド選択ドロップダウン |
| ノイズ1シード | `#input-perlin1-seed` | パーリンノイズ1のシード値 |
| ノイズ1スケール | `#input-perlin1-scale` | パーリンノイズ1のスケール |
| ノイズ1振幅 | `#input-perlin1-amplitude` | パーリンノイズ1の振幅 |
| ノイズ2シード | `#input-perlin2-seed` | パーリンノイズ2のシード値 |
| ノイズ2スケール | `#input-perlin2-scale` | パーリンノイズ2のスケール |
| ノイズ2振幅 | `#input-perlin2-amplitude` | パーリンノイズ2の振幅 |
| ノイズ2山閾値 | `#input-perlin2-threshold` | パーリンノイズ2の山閾値 |
| 最低高さ | `#input-perlin-min-height` | パーリンノイズの最低高さ |
| 最高高さ | `#input-perlin-max-height` | パーリンノイズの最高高さ |

### block_manager.html内

| 要素 | セレクタ | 説明 |
|------|---------|------|
| LoDテストタブ | `.tab[data-tab="lodTest"]` | タブボタン |
| LoDテストコンテンツ | `#lodTest` | タブコンテンツ |
| iframe | `#lodTestFrame` | テストページを埋め込むiframe |

---

## テスト方針

### 機能テスト

1. **LoD 0 表示テスト**
   - 近距離チャンクがテクスチャ付きで表示される
   - カスタムブロックが正しい形状で表示される

2. **LoD 1 表示テスト**
   - 中距離チャンクが頂点カラーで表示される
   - カスタムブロックが標準ブロック形状で表示される

3. **LoD 2 表示テスト**
   - 遠距離チャンクが1四角形で表示される
   - 4隅の高さが正しく反映される

4. **LoD 3 表示テスト**
   - 最遠距離が4×4チャンク単位で表示される
   - グリッド境界が正しい

5. **LoD切り替えテスト**
   - 視点移動でLoDレベルが正しく切り替わる
   - 閾値設定が反映される

6. **UI操作テスト**
   - 各入力・ボタンが正しく動作する
   - LoD色分け表示が切り替わる

---

## 補足

- Three.js CDN: `https://cdn.jsdelivr.net/npm/three@0.128.0/`
- OrbitControls CDN: `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js`
