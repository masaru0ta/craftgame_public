# 仕様書: 2-3 LoD設定と表示テスト

## 概要

LoD（Level of Detail）システムを実装し、視点からの距離に応じてチャンクの描画詳細度と生成優先度を制御する。
近距離のゲームチャンク（LoD 0）を最優先で生成し、遠距離の風景チャンク（LoD 1）は余裕があるときに生成する。

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
│   ├── ChunkMeshBuilder.js     # 既存: LoD対応メッシュ生成
│   ├── ChunkManager.js         # 既存: LoD管理・優先度キュー
│   ├── ChunkStorage.js         # 既存
│   ├── TextureLoader.js        # 既存: 頂点カラー対応
│   ├── WorldGenerator.js       # 既存
│   └── LoDHelper.js            # LoD計算ヘルパー（簡略化）
├── test/
│   ├── 2-3_lod_test.html       # テストページ
│   └── 2-3_main.js             # メイン処理
```

---

## 要件

### **REQ-2-3-1: LoDレベル定義**

視点からの距離に応じて2段階のLoDレベルを適用する。

| レベル | 名称 | 描画方式 | 生成優先度 |
|--------|------|----------|-----------|
| LoD 0 | ゲームチャンク | テクスチャ、カスタムブロック表示 | 最優先（常に即時生成） |
| LoD 1 | 風景チャンク | 頂点カラー、標準ブロック形状 | 低優先（余裕時に生成） |

#### LoD 0: ゲームチャンク（フル詳細）

- 2-2で実装済みの描画方式をそのまま使用
- テクスチャアトラス使用
- カスタムブロックは定義通りの形状で描画
- グリーディーメッシング適用可能
- **生成優先度: 最優先** - 常に他のチャンクより先に生成

#### LoD 1: 風景チャンク（頂点カラー）

- テクスチャを使用せず、頂点カラーで描画
- 各ブロックの色はテクスチャ定義の `color_hex` を使用
- カスタムブロック（shape_type = "custom"）は標準ブロック形状（1×1×1立方体）で描画
- カスタムブロックの色はそのブロックのマテリアルの `color_hex` を使用
- グリーディーメッシング適用可能（同色ブロックをマージ）
- **生成優先度: 低** - LoD 0キューが空のときのみ生成

---

### **REQ-2-3-2: 距離閾値設定**

LoDレベルの切り替え距離をUIで設定可能にする。すべて半径（チェビシェフ距離）で指定する。

| 設定項目 | デフォルト値 | 説明 |
|----------|-------------|------|
| LoD 0 半径 | 3 | 視点から半径3チャンク以内はLoD 0 |
| 総描画半径 | 3 | 視点から半径3チャンク以内を描画 |

- 距離計算はチェビシェフ距離（最大座標差）を使用
  - `distance = max(|chunkX - viewChunkX|, |chunkZ - viewChunkZ|)`
- 半径3の場合、-3〜+3の範囲（7×7 = 49チャンク）が対象
- LoD 0 半径内: LoD 0（ゲームチャンク）
- LoD 0 半径外: LoD 1（風景チャンク）
- 切り替えは即時（フェードなし）

#### LoD動的切り替え

視点移動により既存チャンクのLoDレベルが変わった場合、メッシュを再生成する。

- 各チャンクは現在のLoDレベルを `mesh.userData.lodLevel` に保持
- 視点移動時、`getChunkLoD()` で計算したLoDと保持しているLoDが異なる場合:
  - LoD 0 → LoD 1: メッシュを再生成（テクスチャ → 頂点カラー）
  - LoD 1 → LoD 0: メッシュを再生成（頂点カラー → テクスチャ）

---

### **REQ-2-3-3: チャンクキューシステム**

ChunkManagerにチャンク処理のキューシステムを実装する。

#### キュー構造

```javascript
// チャンクキュー（生成・LoD変更を統合）
this.chunkQueue = [];

// アンロードキュー
this.unloadQueue = [];
```

#### 処理タイミング

視点のチャンク座標が変わった時のみキュー更新処理を行う。
ワールド座標が変わっても、チャンク座標が同じなら処理しない。

```javascript
updateViewPosition(worldX, worldZ) {
    const newChunkCoord = this.worldToChunk(worldX, worldZ);

    // チャンク座標が変わっていなければ何もしない
    if (前回と同じチャンク座標) return;

    // キュー更新処理...
}
```

#### キュー追加時

重複チェックは行わない。必要なチャンクをそのままキューに追加する。

#### キュー処理時（遅延評価）

キューから取り出した時点で、そのチャンクがまだ必要かを判断する。

```javascript
_processChunkQueue() {
    const item = this.chunkQueue.shift();

    // 範囲外なら捨てる
    if (!this._isInRange(item.chunkX, item.chunkZ)) return;

    if (this.chunks.has(item.key)) {
        // 生成済み → LoD変更が必要か確認
        const currentLoD = chunk.mesh.userData.lodLevel;
        const newLoD = this.getChunkLoD(item.chunkX, item.chunkZ);
        if (currentLoD !== newLoD) {
            this._rebuildChunkMesh(...);
        }
    } else {
        // 未生成 → 新規生成
        await this._generateChunk(...);
    }
}
```

#### 処理の優先度

1フレームあたり最大 `maxProcessingPerFrame` 個の処理を行う。
優先度順: チャンクキュー（近い順） > アンロードキュー

#### API

```javascript
/**
 * LoD 0 範囲を設定
 * @param {number} range - LoD 0の範囲（チャンク数）
 */
setLoD0Range(range)

/**
 * チャンクのLoDレベルを取得
 * @param {number} chunkX - チャンクX座標
 * @param {number} chunkZ - チャンクZ座標
 * @returns {number} LoDレベル（0または1）
 */
getChunkLoD(chunkX, chunkZ)

/**
 * LoD別のチャンク数を取得
 * @returns {{lod0: number, lod1: number}}
 */
getLoDCounts()

/**
 * 1フレームで処理する最大数を設定
 * @param {number} n - 上限数（デフォルト: 1）
 */
setMaxProcessingPerFrame(n)

/**
 * LoD処理時間の平均を取得（直近10チャンク）
 * @returns {{lod1Generate: number|null, lod1to0: number|null, lod0to1: number|null, lod1Unload: number|null}}
 */
getLoDProcessingTimes()
```

---

### **REQ-2-3-4: ChunkMeshBuilder LoD 1対応**

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

### **REQ-2-3-5: LoDHelper クラス（簡略化）**

LoD計算のヘルパークラス。

```javascript
class LoDHelper {
    /**
     * LoD色分け表示用の色を取得
     * @param {number} lodLevel - LoDレベル（0-1）
     * @returns {string} 16進数カラー
     */
    static getDebugColor(lodLevel)
}
```

**デバッグ色:**

| LoDレベル | デバッグ色 |
|-----------|-----------|
| LoD 0 | 緑 (#00FF00) |
| LoD 1 | 黄 (#FFFF00) |

---

### **REQ-2-3-6: テストUI**

画面左上にデバッグパネルを表示する。

#### 表示項目

| 項目 | セレクタ | 説明 |
|------|---------|------|
| FPS | `#debug-fps` | フレームレート |
| FPSグラフ | `#fps-graph` | 0.1秒ごとのFPS履歴をグラフ表示（Canvas、幅280px×高さ80px） |
| 総ポリゴン数 | `#debug-triangles` | 全LoDレベル合計 |
| ドローコール数 | `#debug-drawcalls` | 描画呼び出し回数 |
| 視点座標 | `#debug-position` | 現在の視点座標 |
| LoD別チャンク数 | `#debug-lod-counts` | LoD0: X, LoD1: Y |
| LoD 0 キュー数 | `#debug-lod0-queue` | LoD 0 生成待ちチャンク数 |
| LoD 1 キュー数 | `#debug-lod1-queue` | LoD 1 生成待ちチャンク数 |
| LoD1生成時間 | `#debug-lod1-generate-time` | LoD1生成の平均時間(ms) |
| LoD1→0変換時間 | `#debug-lod1to0-time` | LoD1→0変換の平均時間(ms) |
| LoD0→1変換時間 | `#debug-lod0to1-time` | LoD0→1変換の平均時間(ms) |
| LoD1解放時間 | `#debug-lod1-unload-time` | LoD1解放の平均時間(ms) |

#### 操作項目

| 項目 | セレクタ | 説明 |
|------|---------|------|
| LoD 0 範囲 | `#input-lod0-range` | 数値入力（デフォルト: 3） |
| 総描画範囲 | `#input-total-range` | NxN範囲（デフォルト: 31） |
| ワイヤーフレーム | `#btn-wireframe` | ON/OFF切り替え |
| グリーディー | `#btn-greedy` | ON/OFF切り替え（デフォルト: ON） |
| カリング | `#btn-culling` | ON/OFF切り替え（デフォルト: ON） |
| LoD色分け表示 | `#btn-lod-debug` | デバッグ用: LoDレベルで色分け |
| フレーム処理上限 | `#input-max-processing-per-frame` | 数値入力（デフォルト: 1） |
| リセット | `#btn-reset` | 視点を原点に戻す |
| ストレージクリア | `#btn-clear-storage` | 保存データを全削除 |

---

### **REQ-2-3-7: 手動操作**

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

### **REQ-2-3-8: ワールド選択機能**

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

### **REQ-2-3-9: パフォーマンス要件**

移動中も安定した60FPSを維持する。

#### 性能基準

| 条件 | 要件 |
|------|------|
| LoD 0 半径: 3、総描画半径: 10 | 移動中58FPS以上を維持（headlessブラウザでは60厳密維持が困難なため） |
| LoD 0 半径: 3、総描画半径: 15 | 移動中60FPS以上を維持（実ブラウザ基準） |

#### 最適化ポイント

- 毎フレーム実行する処理は最小限にする
- 重い計算（ポリゴン数集計、LoD別チャンク数集計）は間引いて実行
- キューカウントの取得はO(n)ではなくキャッシュを活用

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
| FPSグラフ | `#fps-graph` | 0.1秒ごとのFPS履歴グラフ（Canvas） |
| ポリゴン数表示 | `#debug-triangles` | 総ポリゴン数 |
| ドローコール表示 | `#debug-drawcalls` | ドローコール数 |
| 視点座標表示 | `#debug-position` | 視点座標 |
| LoD別チャンク数 | `#debug-lod-counts` | 各LoDのチャンク数 |
| LoD 0 キュー数 | `#debug-lod0-queue` | LoD 0 生成待ち数 |
| LoD 1 キュー数 | `#debug-lod1-queue` | LoD 1 生成待ち数 |
| LoD1生成時間 | `#debug-lod1-generate-time` | LoD1生成の平均時間(ms) |
| LoD1→0変換時間 | `#debug-lod1to0-time` | LoD1→0変換の平均時間(ms) |
| LoD0→1変換時間 | `#debug-lod0to1-time` | LoD0→1変換の平均時間(ms) |
| LoD1解放時間 | `#debug-lod1-unload-time` | LoD1解放の平均時間(ms) |
| LoD 0 範囲入力 | `#input-lod0-range` | LoD 0の閾値 |
| 総描画範囲入力 | `#input-total-range` | 描画範囲 |
| ワイヤーフレームボタン | `#btn-wireframe` | ワイヤーフレーム切り替え |
| グリーディーボタン | `#btn-greedy` | グリーディーメッシング切り替え |
| カリングボタン | `#btn-culling` | カリング切り替え |
| LoD色分けボタン | `#btn-lod-debug` | LoD色分け表示切り替え |
| フレーム処理上限 | `#input-max-processing-per-frame` | 1フレームで処理する最大数（全キュー合計） |
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
   - LoD 0 範囲内のチャンクは lodLevel = 0

2. **LoD 1 表示テスト**
   - 遠距離チャンクが頂点カラーで表示される
   - LoD 0 範囲外のチャンクは lodLevel = 1

3. **優先度キューテスト**
   - LoD 0 チャンクが先に生成される
   - LoD 0 キューが空のときのみ LoD 1 チャンクが生成される

4. **LoD切り替えテスト**
   - 視点移動でLoDレベルが正しく切り替わる
   - 閾値設定が反映される

5. **UI操作テスト**
   - 各入力・ボタンが正しく動作する
   - LoD色分け表示が切り替わる

---

## 補足

- Three.js CDN: `https://cdn.jsdelivr.net/npm/three@0.128.0/`
- OrbitControls CDN: `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js`
