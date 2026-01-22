# 仕様書: 1-4 カスタムブロックエディタ

## 1. 概要

カスタムブロック（shape_type="custom"）を編集するための3Dエディタコアクラスを作る。
8x8x8のボクセルデータを3D表示し、マウス操作でボクセルの配置・削除・マテリアル変更ができる。
このクラスはUIを生成せず、Three.jsシーン・メッシュ・ボクセル編集操作のみを担当する。
実際のUIは 1-6 BlockEditorUI から利用される。

ここで作る重要な部品は、
- カスタムブロックのメッシュ生成ライブラリ（ゲーム本体で利用）
- カスタムブロックの3Dエディタコアクラス（BlockEditorUI で利用）

src/test/ 及び src/game/ のディレクトリは公開用の Github リポジトリにプッシュする
公開用リポジトリ: https://github.com/masaru0ta/craftgame_public

## 2. 関連資料

- spec_1-1_block_data_sheet.md: データ構造
- spec_1-2_gas_api.md: API仕様
- spec_1-3_standard_block_editor.md: 標準ブロックエディタ（カメラ操作の参考）
- spec_1-5_collision_editor.md: 当たり判定編集（このクラスの拡張）
- spec_1-6_block_shape_manager.md: BlockEditorUI（このクラスを利用する）

## 3. アーキテクチャ

### 3.1 クラス構成

```
BlockEditorUI (1-6で定義)
    ├── StandardBlockEditor (1-3で定義)
    │   └── StandardBlockMeshBuilder
    └── CustomBlockEditor (このクラス)
        ├── CustomBlockMeshBuilder
        └── CollisionChecker (1-5で定義、衝突テスト用)
```

### 3.2 責務分離

| クラス | 責務 |
|--------|------|
| CustomBlockEditor | Three.jsシーン管理、カメラ操作、ボクセル編集、当たり判定編集 |
| CustomBlockMeshBuilder | ボクセルメッシュの生成 |
| CollisionChecker | 衝突テストのボール物理演算 |
| BlockEditorUI | UI生成、イベントハンドリング、エディタ切替 |

## 4. 機能詳細

### 4.1 CustomBlockEditor クラス

#### コンストラクタ

```javascript
constructor(options) {
  // options.container: Three.jsをマウントするDOM要素
  // options.THREE: Three.jsライブラリ（外部から注入）
  // options.onVoxelChange: ボクセル変更時コールバック (optional)
  // options.onMaterialSelect: マテリアル選択変更時コールバック (optional)
}
```

#### 公開メソッド

| メソッド | 説明 |
|----------|------|
| `init()` | シーン・カメラ・レンダラーを初期化 |
| `loadBlock(blockData)` | ブロックデータをロードして表示 |
| `setMaterial(slot, textureUrl)` | 指定マテリアルスロット(1-3)にテクスチャを設定 |
| `getMaterials()` | 現在のマテリアル設定を取得 |
| `setCurrentMaterial(num)` | 配置時に使用するマテリアル番号(1-3)を設定 |
| `getCurrentMaterial()` | 現在選択中のマテリアル番号を取得 |
| `setBrushSize(size)` | ブラシサイズ(1,2,4)を設定 |
| `getBrushSize()` | 現在のブラシサイズを取得 |
| `setEditMode(mode)` | 編集モード('look' or 'collision')を設定 |
| `getEditMode()` | 現在の編集モードを取得 |
| `getVoxelLookData()` | 見た目ボクセルデータを取得（Base64） |
| `getVoxelCollisionData()` | 当たり判定ボクセルデータを取得（Base64） |
| `autoCreateCollision()` | 見た目から当たり判定を自動生成 |
| `setBackgroundColor(color)` | 背景色を設定 |
| `getScene()` | Three.jsシーンを取得 |
| `getCamera()` | Three.jsカメラを取得 |
| `resize()` | リサイズ処理 |
| `dispose()` | リソース解放 |

### 4.2 3Dプレビュー仕様

- Three.jsを使用して 3Dプレビューを表示
- 8x8x8のボクセルグリッドを表示
- 初期表示はFRONTが正面、垂直角度20度（少し上から見下ろす）、カメラ距離3
- 床面となる高さにグリッド線（8x8）を表示
- グリッドの外側に FRONT, RIGHT, LEFT, BACK をテキスト表示

### 4.3 カメラ操作

- マウスドラッグで視点を回転させる。左右回転と上下の傾き変更が可能。
- 上下の傾きは上側90度下側90度まで。マウスを右にドラッグすると、ブロックが右に回転する。
- マウスのホイールスクロールで拡大縮小

### 4.4 ボクセル編集（見た目モード）

- カーソル位置でレイキャストし対象のボクセルを常に選択
- 対象ボクセルのレイキャストした面を緑でハイライト、対象ボクセルの辺を赤で強調
- 対象ボクセルが無い場合は床面のグリッドをハイライト
- 右クリックでハイライトした面に隣接するようボクセルを配置（現在選択中のマテリアル）
- 左クリックで選択したボクセルを削除
- ブラシサイズ:
  - [1x] 1x1x1 ボクセル（単一）の設置・削除
  - [2x] 2x2x2 ボクセル、グリッド座標(0,2,4,6)にスナップ
  - [4x] 4x4x4 ボクセル、グリッド座標(0,4)にスナップ

### 4.5 マテリアル

- 3つのマテリアルスロット（1, 2, 3）をサポート
- 各スロットにテクスチャURLを設定可能
- `setCurrentMaterial(num)` で配置時に使用するマテリアルを選択

### 4.6 データ形式

#### voxel_look形式（8x8x8、2bit）
- 各ボクセルは2ビット（0-3）で表現
  - 0: 空気（透明）
  - 1: material_1
  - 2: material_2
  - 3: material_3
- データはY→Z→X順で格納
- Base64エンコードして保存

## 5. ファイル構成

```
src/
  test/
    spec_1-4_custom_block_editor.html       # 単体テスト用HTML
    spec_1-4_custom_block_editor_style.css  # 単体テスト用スタイル
    spec_1-4_custom_block_editor_main.js    # 単体テスト用スクリプト
  game/
    custom_block_editor.js                  # カスタムブロックエディタコアクラス
    custom_block_mesh_builder.js            # カスタムブロック用メッシュ生成
    voxel_data.js                           # ボクセルデータのエンコード/デコード
```

## 6. 補足仕様

### 6.1 初期状態
- 新規ブロック作成時、または `voxel_look` が空のブロックを選択した場合、ボクセルは全て空(0)で開始

### 6.2 未設定マテリアルの表示
- material_1, 2, 3 のテクスチャが未設定の場合、テクスチャリストの最初から順に自動セット
- テクスチャリストが空の場合はグレー単色で表示

### 6.3 編集範囲の制限
- 8x8x8の範囲外にボクセルを配置しようとした場合は無視する（何も起こらない）

### 6.4 Undo/Redo機能
- 本仕様では実装しない

### 6.5 空の状態での保存
- ボクセルが0個（全て空）の状態でも保存を許可する

## 7. 実装詳細: UV座標マッピング

### 7.1 概要

8x8x8のボクセルグリッドに1枚のテクスチャを貼る場合、各ボクセルはテクスチャの1/64（8x8分割の1つ）を表示する。
Three.jsのBoxGeometryを使用する際、UV座標の設定には注意が必要。

### 7.2 Three.js BoxGeometryの面順序

BoxGeometryの面は以下の順序で定義されている（各面4頂点）:
- インデックス 0-3: +X (right)
- インデックス 4-7: -X (left)
- インデックス 8-11: +Y (top)
- インデックス 12-15: -Y (bottom)
- インデックス 16-19: +Z (front)
- インデックス 20-23: -Z (back)

### 7.3 各面のUV座標計算

各面でどの座標軸をU/Vに使用するか:

| 面            | U座標   | V座標   | flipU | flipV  |
|---------------|---------|---------|-------|--------|
| +X (right)    | 7 - z   | y       | true  | false  |
| -X (left)     | z       | y       | true  | false  |
| +Y (top)      | x       | 7 - z   | true  | false  |
| -Y (bottom)   | x       | z       | true  | false  |
| +Z (front)    | x       | y       | true  | false  |
| -Z (back)     | 7 - x   | y       | true  | false  |

## 8. テスト用CSSセレクタ定義

単体テスト用HTMLで使用するセレクタ:

| 要素 | セレクタ | 検証内容 |
|------|----------|----------|
| 右カラム | `.right-column` | 全幅の基準 |
| 3Dプレビュー枠 | `.preview-container` | アスペクト比 3:4 |
| ツールボタン枠 | `.toolbar` | 高さ 1/8 |
| 3Dプレビュー領域 | `.preview-3d` | 高さ 6/8 |
| マテリアル設定枠 | `.material-panel` | 高さ 1/8 |
| マテリアルスロット | `.material-slot` | 3つ存在 |
| 背景色表示 | `.bg-color-indicator` | 背景色の確認 |
| ブラシサイズボタン | `.brush-size-btn` | 3つ存在 |

## 9. テスト項目

### CustomBlockEditor クラス

- [ ] `init()` でシーン・カメラ・レンダラーが初期化される
- [ ] `loadBlock(blockData)` でブロックが3Dプレビューに表示される
- [ ] `setMaterial(slot, url)` でマテリアルテクスチャが反映される
- [ ] `getMaterials()` で現在のマテリアル設定が取得できる
- [ ] `setCurrentMaterial(num)` でマテリアル選択が変更される
- [ ] `setBrushSize(size)` でブラシサイズが変更される
- [ ] `getVoxelLookData()` でBase64エンコードされたデータが取得できる
- [ ] `setBackgroundColor(color)` で背景色が変更される
- [ ] `getScene()` でThree.jsシーンが取得できる
- [ ] `getCamera()` でThree.jsカメラが取得できる

### 3Dプレビュー表示

- [ ] 8x8x8のボクセルグリッドが表示される
- [ ] 床面にグリッド線（8x8）が表示される
- [ ] グリッドの外側にFRONT, RIGHT, LEFT, BACKのテキストが表示されている
- [ ] 各ボクセルにマテリアルのテクスチャが正しく表示される

### カメラ操作

- [ ] マウスドラッグで視点を回転できる
- [ ] 上下の傾きが上側90度、下側90度までに制限される
- [ ] マウスホイールで拡大縮小できる

### ボクセル編集

- [ ] カーソル位置のボクセルがハイライト表示される（選択面は緑、辺は赤）
- [ ] ボクセルが無い場合は床面のグリッドがハイライトされる
- [ ] 右クリックでハイライトした面に隣接するようボクセルを配置できる
- [ ] 左クリックで選択したボクセルを削除できる
- [ ] 配置したボクセルが即座に3Dプレビューに反映される
- [ ] 8x8x8の範囲外にはボクセルを配置できない
- [ ] ブラシサイズ1xで1x1x1ボクセル（単一）の設置・削除
- [ ] ブラシサイズ2xで2x2x2ボクセル、グリッド座標(0,2,4,6)にスナップ
- [ ] ブラシサイズ4xで4x4x4ボクセル、グリッド座標(0,4)にスナップ

### マテリアル選択

- [ ] `setCurrentMaterial(1)` でマテリアル1が選択される
- [ ] `setCurrentMaterial(2)` でマテリアル2が選択される
- [ ] `setCurrentMaterial(3)` でマテリアル3が選択される
- [ ] 選択したマテリアルで新規ボクセルが配置される

### 単体テスト用HTML（spec_1-4_custom_block_editor.html）

- [ ] Github にパブリッシュしたエディタ画面が正常に表示される
- [ ] 4:6 の比率で2カラム表示されている
- [ ] 右カラムに3Dプレビューが表示される
- [ ] ツールボタン枠にブラシサイズ切り替えボタン [4x][2x][1x] が表示される
- [ ] マテリアルスロット（1, 2, 3）が表示される
- [ ] マテリアルスロットクリックでマテリアルを切り替えられる
- [ ] 保存ボタンでGAS APIにデータを送信できる
