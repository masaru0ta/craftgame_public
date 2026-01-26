# 仕様書: 2-1 １チャンク生成・表示テスト

## 概要

シンプルな１チャンク生成、表示のテストを通じて今後ゲーム本体で利用するクラスを作っていく。
- チャンクデータ管理クラスの作成
- GAS APIからテクスチャデータとブロックデータを取得
- １チャンク分のメッシュデータを作成
- １チャンクを表示
- テスト用UIでデバッグ情報を表示

## 関連資料

- spec_list.md: 機能一覧
- spec_1-2_gas_api.md: GAS API仕様

## 技術構成

| 項目 | 選定 |
|------|------|
| 3Dライブラリ | Three.js（CDN） |
| カメラ操作 | OrbitControls |
| テクスチャ取得 | GAS API（フェーズ1で作成済み） |
| テスト方法 | 簡易テストページ（HTML） |

## ファイル構成

```
src/
├── game/                       # ゲーム本体で使用するライブラリ
│   ├── ChunkData.js            # チャンクデータ管理クラス
│   ├── ChunkMeshBuilder.js     # メッシュ生成クラス
│   ├── TextureLoader.js        # テクスチャ取得クラス
│   └── WorldGenerator.js       # 地形生成クラス
├── test/                       # テスト用ファイル
│   ├── 2-1_1chunk_test.html    # テストページ
│   └── 2-1_main.js             # メイン処理（シーン構築、デバッグUI含む）
```

---

## 要件

### **REQ-2-1-1: チャンクデータ管理クラス**
- ワールド座標を区分けし、x(左右) 16, y(高さ) 128, z(前後) 16 ブロックごとの領域を1チャンクとする
- 各チャンクは2次元のチャンク座標を持ち、原点 x:0,y:0,z:0 の座標はチャンク(0,0)に含まれる
- ワールド座標 x,y,z でブロック情報を set, get できる
- チャンク座標 0,0 はワールド座標 0,0,0 から 15,127,15 までの領域
- ブロック情報は block_str_id を保持する
- 空気ブロック（block_str_id = "air" または未設定）はデフォルト値とする

---

### **REQ-2-1-1-1: テスト用地形生成**
- 地形を生成するクラス WorldGenerator クラスを用意する
- `worldGenerator.generateTest(chunkData)` で指定したチャンクにテスト用地形を生成
- テスト用地形の構成（block_str_idはGAS APIで登録されているIDを使用）:
  - y=0 から 62 まで土ブロック("dirt")で埋める
  - y=63 は草ブロック("grass")で埋める
  - x=0, y=63, z=* 及び x=*, y=63, z=0 は石ブロック("stone")
  - y=63 の四隅（(0,63,0), (0,63,15), (15,63,0), (15,63,15)）はテストブロック("test")
  - テストブロックの1つ下は空気

※テスト用のblock_str_idは、GAS APIにブロックが登録されていない場合は仮のIDを使用する

---

### **REQ-2-1-2: テクスチャ取得**
- GAS API (`?action=getAll`) からブロック定義リストとテクスチャ画像リストを取得する
- 取得したテクスチャ（Base64）から Three.js の Texture を生成する
- 各block_str_idに対応するマテリアルを生成する（6面対応）
- テクスチャ取得中はローディング状態を表示する
- テクスチャ取得エラー時はエラーメッセージを表示する

---

### **REQ-2-1-3: メッシュ生成**
- ChunkData からメッシュを生成する
- 描画モードを切り替え可能にする:
  - **FULL**: 全ブロックの6面すべてを描画
  - **CULLED**: 隣接ブロックがある面は描画しない（面カリング）
- **y=0 の底面は常にカリング対象とし、描画しない**（ワールドの最下層より下は見えないため）
- 各面に対応するテクスチャを適用する
- 空気ブロック（block_str_id = "air"）は描画しない
- 1チャンク分を1つの結合メッシュとして生成する
- 生成されたメッシュはチャンク座標に応じたワールド座標に配置する
  - `mesh.position.x = chunkX * ChunkData.SIZE_X`
  - `mesh.position.z = chunkZ * ChunkData.SIZE_Z`

---

### **REQ-2-1-3-1: グリーディー・メッシング**
- 隣接する同じブロックの面を1つの大きなポリゴンにマージする最適化機能
- `build(chunkData, mode, greedy)` の第3引数でON/OFFを切り替え可能
- グリーディー・メッシングの動作:
  - 同じblock_str_id・同じ面方向の隣接面をグループ化
  - 2Dグリッド上で矩形領域を検出してマージ
  - マージされた面のUV座標はサイズに応じてスケール（タイリング）
- テクスチャは `wrapS/wrapT = RepeatWrapping` でタイリング対応
- フラット地形では90%以上のポリゴン削減が期待できる

#### **注意: UV座標スケーリングと軸の対応**

グリーディー・メッシングでは、面の方向によって `width`/`height` が対応する軸が異なる。
UV座標 (`uScale`, `vScale`) を設定する際は、頂点座標の軸と正しく対応させる必要がある。

| 面の方向 | グリッド軸 | width の方向 | height の方向 | UV uScale | UV vScale |
|---------|-----------|-------------|--------------|-----------|-----------|
| X面 (left/right) | YZ平面 | Y軸 | Z軸 | **height** | **width** |
| Y面 (top/bottom) | XZ平面 | X軸 | Z軸 | width | height |
| Z面 (front/back) | XY平面 | X軸 | Y軸 | width | height |

**重要**: X面（left/right）では、UV座標の U軸が Z方向、V軸が Y方向に対応するため、
`uScale` と `vScale` に渡す値を入れ替える必要がある。

```javascript
// 正しい実装例
if (faceName === 'left' || faceName === 'right') {
    this._addUVs(uvs, faceName, height, width);  // 入れ替え
} else {
    this._addUVs(uvs, faceName, width, height);
}
```

---

### **REQ-2-1-4: チャンク描画**
- Three.js でシーンを構築する
- Three.js は CDN から読み込む
- OrbitControls でカメラ操作を可能にする
- 背景色は空色（#87CEEB）とする
- 照明は DirectionalLight + AmbientLight を使用する
- 1チャンクのフラット地形（y=0 に全ブロック配置）を表示する
- アニメーションループで描画を更新する

---

### **REQ-2-1-4-1: 左手座標系**
- Minecraft本家と同じ左手座標系を採用する
- 座標軸の方向:
  - **X+**: 東
  - **Y+**: 上
  - **Z+**: 北
- Three.js は右手座標系のため、worldContainer（scale.z = -1）でZ軸を反転して実現する
- ワールド内のオブジェクトは scene ではなく worldContainer に追加する
- メッシュ生成時のUV座標はZ軸反転に合わせて調整済み
- カメラの初期位置は真南からチャンクを見下ろす角度（画面右=東、画面奥=北）
- デバッグUIのカメラ座標は左手座標系で表示する（Three.jsのZ座標を反転）
- ブロックの面の定義:
  - **front**: 南向き（Z-方向）- カメラの初期位置から見える面
  - **back**: 北向き（Z+方向）
  - **right**: 東向き（X+方向）
  - **left**: 西向き（X-方向）
  - **top**: 上向き（Y+方向）
  - **bottom**: 下向き（Y-方向）

#### 実装上の注意: Z軸反転とワインディング順序（面の向き）
- **重要**: `scale.z = -1` によるZ軸反転は、**全ての面**のポリゴンワインディング順序を逆転させる
- Three.jsはデフォルトで反時計回り（CCW）の頂点順序を表面として扱う
- Z軸反転後も正しく表示するため、**全ての面を時計回り（CW）**で定義する必要がある

| 面 | 頂点順序 | 理由 |
|----|---------|------|
| 全ての面 | 時計回り（CW） | Z軸反転（scale.z = -1）で全面の表裏が入れ替わるため |

**症状と対処法:**
- 症状: 面が外側から見えず、内側からしか見えない（裏返しになっている）
- 原因: 頂点順序が逆になっている
- 対処: `_getFaceCorners()` で返す頂点の順序を逆にする

```javascript
// 全ての面を時計回り（CW）で定義する

// front面（Z軸反転対応で時計回りに定義）
case 'front': // 南（Z-）
    return [
        { x: x + width, y: y, z: z },       // 右下
        { x: x, y: y, z: z },               // 左下
        { x: x, y: y + height, z: z },      // 左上
        { x: x + width, y: y + height, z: z } // 右上
    ];

// back面
case 'back': // 北（Z+）
    return [
        { x: x, y: y, z: z + 1 },              // 左下
        { x: x + width, y: y, z: z + 1 },      // 右下
        { x: x + width, y: y + height, z: z + 1 }, // 右上
        { x: x, y: y + height, z: z + 1 }      // 左上
    ];

// top面（Z軸反転対応で時計回りに定義）
case 'top': // 上（Y+）
    return [
        { x: x, y: y + 1, z: z + height },     // 後左
        { x: x + width, y: y + 1, z: z + height }, // 後右
        { x: x + width, y: y + 1, z: z },     // 前右
        { x: x, y: y + 1, z: z }              // 前左
    ];

// bottom面
case 'bottom': // 下（Y-）
    return [
        { x: x, y: y, z: z },                 // 前左
        { x: x + width, y: y, z: z },         // 前右
        { x: x + width, y: y, z: z + height }, // 後右
        { x: x, y: y, z: z + height }         // 後左
    ];

// right面（東/X+方向）- 外側から見て時計回り
case 'right': // 東（X+）
    return [
        { x: x + 1, y: y, z: z + width },        // 後下
        { x: x + 1, y: y, z: z },                // 前下
        { x: x + 1, y: y + height, z: z },       // 前上
        { x: x + 1, y: y + height, z: z + width } // 後上
    ];

// left面（西/X-方向）- 外側から見て時計回り
case 'left': // 西（X-）
    return [
        { x: x, y: y, z: z },                    // 前下
        { x: x, y: y, z: z + width },            // 後下
        { x: x, y: y + height, z: z + width },   // 後上
        { x: x, y: y + height, z: z }            // 前上
    ];
```

#### 実装上の注意: カメラの初期位置
- カメラは `scene` に直接配置され、`worldContainer` の影響を受けない
- 左手座標系で南側（Z-方向）にカメラを配置するには、Three.jsの座標系では**Z+方向**に配置する
- デバッグUIでは `(-camera.position.z)` で左手座標系に変換して表示する
- `controls.target` もworldContainerのZ反転を考慮して設定する

| 項目 | 左手座標系 | Three.js座標系 |
|------|-----------|---------------|
| カメラ位置（南側） | (8, 80, -40) | (8, 80, 40) |
| チャンク中心 | (8, 32, 8) | (8, 32, -8) |

```javascript
// 正しい設定例
camera.position.set(8, 80, 40);      // Three.js座標（南側に配置）
controls.target.set(8, 32, -8);      // Three.js座標（チャンク中心）
```

#### 実装上の注意: UV座標とZ軸反転
- Z軸反転により、一部の面でテクスチャが左右反転または上下反転して見える
- 各面ごとにUV座標を補正する必要がある

| 面 | UV補正 | 理由 |
|----|--------|------|
| front | なし | 頂点順序の逆転で対応済み |
| back | U座標を反転 | Z軸反転による左右反転を補正 |
| right | なし | Z軸に平行でないため影響なし |
| left | U座標を反転 | Z軸反転による左右反転を補正 |
| top | V座標を反転 | Z軸反転による上下反転を補正 |
| bottom | V座標を反転 | Z軸反転による上下反転を補正 |

```javascript
// UV座標の設定例（頂点0,1,2,3の順）
switch (faceName) {
    case 'front':  uvs.push(uScale, 0, 0, 0, 0, vScale, uScale, vScale); break;
    case 'back':   uvs.push(uScale, 0, 0, 0, 0, vScale, uScale, vScale); break; // U反転
    case 'right':  uvs.push(uScale, 0, 0, 0, 0, vScale, uScale, vScale); break;
    case 'left':   uvs.push(uScale, 0, 0, 0, 0, vScale, uScale, vScale); break; // U反転
    case 'top':    uvs.push(0, vScale, uScale, vScale, uScale, 0, 0, 0); break;
    case 'bottom': uvs.push(0, vScale, uScale, vScale, uScale, 0, 0, 0); break; // V反転
}
```

---

### **REQ-2-1-5: テストUI**
- 画面左上にデバッグ情報を表示する
- 表示項目:
  - FPS（フレームレート）
  - "面カリング" ON / OFF 切り替えボタン
  - "ワイヤーフレーム" ON / OFF 切り替えボタン
  - "グリーディー・メッシング" ON / OFF 切り替えボタン
  - "1x1 チャンク" or "3x3 チャンク" 切り替えボタン
  - "ポリゴン数"
  - "ドローコール数"
  - メモリ使用量（geometries, textures）
  - カメラ座標（左手座標系で表示）
- 描画モード切り替えボタンでリアルタイムにメッシュを再生成する
- グリーディー・メッシング切り替えボタンでリアルタイムにメッシュを再生成する
- テクスチャ読み込み中は「Loading...」を表示する
- チャンクの傾きに合わせて、x, y, z の軸の方向を表示する。軸はどれが何の軸で、どちらが＋方向か分かるデザイン。

#### 実装上の注意: ポリゴン数（Triangles）の計算
- **重要**: `renderer.info.render.triangles` は使用しないこと
  - この値は「実際にレンダリングされた三角形数」であり、以下の要因で変動する:
    - フラスタムカリング（視野外のポリゴンは除外される）
    - ワイヤーフレームモード（表示方法が変わる）
    - カメラの向き（見えている範囲によって変わる）
- **正しい方法**: ジオメトリのインデックス数から計算する
  ```javascript
  // メッシュの総三角形数を計算
  let totalTriangles = 0;
  if (mesh && mesh.geometry && mesh.geometry.index) {
      totalTriangles = mesh.geometry.index.count / 3;
  }
  ```
- この方法なら、ワイヤーフレームON/OFFやカメラの向きに関係なく、常に正確なポリゴン数を表示できる

---

## 補足

- Three.js CDN: `https://cdn.jsdelivr.net/npm/three@0.128.0/`
- OrbitControls CDN: `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js`

---

## UIセレクタ（テスト用）

Playwrightテストで使用するセレクタを定義する。

| 要素 | セレクタ | 説明 |
|------|---------|------|
| キャンバス | `#game-canvas` | Three.jsの描画キャンバス |
| デバッグパネル | `#debug-panel` | デバッグ情報表示パネル |
| FPS表示 | `#debug-fps` | FPS値の表示要素 |
| 面カリングボタン | `#btn-culling` | 面カリング切り替えボタン |
| ワイヤーフレームボタン | `#btn-wireframe` | ワイヤーフレーム切り替えボタン |
| グリーディーボタン | `#btn-greedy` | グリーディー・メッシング切り替えボタン |
| チャンク数ボタン | `#btn-chunk-count` | チャンク数切り替えボタン |
| ポリゴン数表示 | `#debug-triangles` | ポリゴン数の表示要素 |
| ドローコール表示 | `#debug-drawcalls` | ドローコール数の表示要素 |
| メモリ表示 | `#debug-memory` | メモリ使用量の表示要素 |
| カメラ座標表示 | `#debug-camera` | カメラ座標の表示要素 |
| ローディング表示 | `#loading-indicator` | ローディング状態の表示要素 |
| 軸表示 | `#axis-helper` | 座標軸の表示要素 |

---

### **REQ-2-1-6: block_manager.html への統合**
- `src/tool/block_manager.html` に「1チャンクテスト」タブを追加する
- タブをクリックすると1チャンクテストページが表示される
- 1チャンクテストは `iframe` で `../test/2-1_1chunk_test.html` を埋め込む
- iframe は画面いっぱいに表示する（100%幅、適切な高さ）

#### UIセレクタ（block_manager.html内）

| 要素 | セレクタ | 説明 |
|------|---------|------|
| 1チャンクテストタブ | `.tab[data-tab="chunkTest"]` | タブボタン |
| 1チャンクテストコンテンツ | `#chunkTest` | タブコンテンツ |
| iframe | `#chunkTestFrame` | 1チャンクテストを埋め込むiframe |

---

## テスト方針

- 処理ロジックの要件１つずつ動作検証
