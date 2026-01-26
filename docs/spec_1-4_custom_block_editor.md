# 仕様書: 1-4 カスタムブロックエディタ

## 1. 概要

カスタムブロック（shape_type="custom"）を編集するための3Dエディタを作る。
この仕様では以下を作成する:

1. **CustomBlockEditor** - 8x8x8ボクセル編集のコアクラス
2. **CustomBlockMeshBuilder** - カスタムブロック用メッシュ生成ライブラリ
3. **VoxelData** - ボクセルデータのエンコード/デコード
4. **BlockEditorUIへのカスタムブロック機能追加** - 1-3で作成した基盤を拡張

BlockEditorUIは1-3で作成された基盤に、この仕様でカスタムブロック用のUI機能を追加する。
テストページはBlockEditorUIを使用することで、UIの調整が1-6に持ち越されない。

src/test/ 及び src/game/ のディレクトリは公開用の Github リポジトリにプッシュする
公開用リポジトリ: https://github.com/masaru0ta/craftgame_public

## 2. 関連資料

- spec_1-1_block_data_sheet.md: データ構造
- spec_1-2_gas_api.md: API仕様
- spec_1-3_standard_block_editor.md: BlockEditorUI基盤、StandardBlockEditor
- spec_1-5_collision_editor.md: 衝突テスト機能を追加
- spec_1-6_block_shape_manager.md: block_manager統合ツール
- **mockups/mock_block_editor_ui.html**: BlockEditorUIのビジュアルモック（UIパーツ・サイズ・色仕様）

## 3. アーキテクチャ

### 3.1 クラス構成

```
BlockEditorUI (1-3で作成、この仕様で拡張)
    ├── StandardBlockEditor (1-3で作成)
    │   └── StandardBlockMeshBuilder
    └── CustomBlockEditor (この仕様で作成)
        └── CustomBlockMeshBuilder
```

### 3.2 責務分離

| クラス                 | 責務                                           |
|-----------------------|------------------------------------------------|
| BlockEditorUI         | UI生成、イベントハンドリング、エディタ切替（1-3で作成、ここで拡張）      |
| CustomBlockEditor     | Three.jsシーン管理、カメラ操作、ボクセル編集                   |
| CustomBlockMeshBuilder| ボクセルメッシュの生成（ゲーム本体でも使用）                  |
| VoxelData             | ボクセルデータのエンコード/デコード                       |

## 4. BlockEditorUI 拡張（カスタムブロック用）

### 4.1 概要

1-3で作成したBlockEditorUIに、カスタムブロック編集用の機能を追加する:
- shape_typeに応じてStandardBlockEditorまたはCustomBlockEditorを切り替え
- カスタムブロック用のツールバー（モード切替、ブラシサイズ）
- カスタムブロック用のコントロールパネル（マテリアルスロット）

### 4.2 追加メソッド

| メソッド                       | 説明                                                       |
|-------------------------------|------------------------------------------------------------|
| `setMaterial(slot, textureName)`   | 指定マテリアルスロット (1-3) にテクスチャを設定                 |
| `setCurrentMaterial(num)`         | 配置時に使用するマテリアル番号 (1-3) を設定                    |
| `setBrushSize(size)`              | ブラシサイズ (1, 2, 4) を設定                                 |
| `setEditMode(mode)`               | 編集モード ('look' または 'collision') を設定                |

### 4.3 UI構造（カスタムブロック用）

```
.editor-container (aspect-ratio: 3/4)
└── .preview-container (flex column)
    ├── .preview-toolbar (flex: 1, 高さ1/8, 3カラムレイアウト)
    │   ├── .left-group
    │   │   └── モード切替ボタン（look/collision）
    │   ├── .center-group
    │   │   └── ブラシサイズボタン [4][2][1]
    │   └── .right-group
    │       └── BGボタン
    ├── .preview-3d (flex: 6, 高さ6/8)
    │   └── Three.js canvas
    └── .control-panel (flex: 1, 高さ1/8)
        └── .slots-container
            └── .material-item x3 (material_1, material_2, material_3)
```

### 4.3.1 UIパーツ仕様

サイズ・色・枠線などの詳細仕様は `mockups/mock_block_editor_ui.html` を参照。

特記事項
- .editor-containerの比率は横3：縦4（aspect-ratio: 3 / 4）とする。
- 3Dプレビュー領域はレスポンシブで、右カラム幅に合わせてサイズを変更する。
- 3Dプレビュー領域の上部 1/8 はツールバー枠
- 3Dプレビュー領域の下部 1/8 はコントロールパネル枠
- ブラシサイズボタンはBGボタンと同じサイズ
- ブラシサイズボタンの初期値は2
- モード切替ボタンはツールバー枠と同じ上下幅の正方形
- マテリアルスロット・BGボタンのサイズはウィンドウ幅に応じて自動調整する（24px〜48px）。

### 4.3.2 マテリアルスロットクリック

マテリアルスロット（`.material-item`）をクリックすると:

1. BlockEditorUIがテクスチャ選択モーダルを表示
2. ユーザーがテクスチャを選択
3. BlockEditorUIが内部のCustomBlockEditor.setMaterial()を呼び出し
4. 3Dプレビューが更新される
5. `onBlockChange` コールバックで外部に通知

**テクスチャ選択モーダルでの選択:**

| 選択項目    | 動作                                                                             |
|------------|----------------------------------------------------------------------------------|
| テクスチャ  | 選択したテクスチャをマテリアルスロットに設定、3Dプレビュー更新                    |
| 「なし」    | スロットのテクスチャを解除（グレー単色で表示）                                    |
| 「追加」    | `onTextureAdd`コールバックで外部に通知（アップロード処理は外部で実装）           |

**モーダルを閉じる操作:**
- ×ボタンクリック
- オーバーレイ（モーダル外の暗い部分）クリック
- テクスチャ選択後は自動で閉じる

テクスチャ選択モーダルのUI仕様は `mockups/mock_block_editor_ui.html` を参照。

### 4.3.3 BGボタンクリック

BGボタン（`.bg-btn`）をクリックすると:

1. 3Dプレビューの背景色が順番に切り替わる
2. 切り替え順序: 黒（#000000）→ 青（#1a237e）→ 緑（#1b5e20）→ 黒（#000000）
3. BGボタン内のインジケーター（`.bg-color-indicator`）が現在の背景色を表示

### 4.4 shape_typeによるUI切替

| shape_type | ツールバー                                 | コントロールパネル          |
|------------|--------------------------------------------|----------------------------|
| normal     | BGボタンのみ                               | テクスチャスロット x7      |
| custom     | モード切替 + ブラシサイズ + BGボタン        | マテリアルスロット x3      |

## 5. CustomBlockEditor クラス

### 5.1 コンストラクタ

```javascript
constructor(options) {
  // options.container: Three.jsをマウントするDOM要素
  // options.THREE: Three.jsライブラリ（外部から注入）
  // options.onVoxelChange: ボクセル変更時コールバック (optional)
  // options.onMaterialSelect: マテリアル選択変更時コールバック (optional)
}
```

### 5.2 公開メソッド

| メソッド                       | 説明                                               |
|-------------------------------|----------------------------------------------------|
| `init()`                      | シーン・カメラ・レンダラーを初期化                  |
| `loadBlock(blockData)`        | ブロックデータをロードして表示                      |
| `setMaterial(slot, textureUrl)`| 指定マテリアルスロット(1-3)にテクスチャを設定      |
| `getMaterials()`              | 現在のマテリアル設定を取得                          |
| `setCurrentMaterial(num)`     | 配置時に使用するマテリアル番号(1-3)を設定           |
| `getCurrentMaterial()`        | 現在選択中のマテリアル番号を取得                    |
| `setBrushSize(size)`          | ブラシサイズ(1,2,4)を設定                          |
| `getBrushSize()`              | 現在のブラシサイズを取得                            |
| `setEditMode(mode)`           | 編集モード('look' or 'collision')を設定             |
| `getEditMode()`               | 現在の編集モードを取得                              |
| `getVoxelLookData()`          | 見た目ボクセルデータを取得（Base64）                |
| `getVoxelCollisionData()`     | 当たり判定ボクセルデータを取得（Base64）            |
| `autoCreateCollision()`       | 見た目から当たり判定を自動生成                      |
| `setBackgroundColor(color)`   | 背景色を設定                                        |
| `toggleBackgroundColor()`     | 背景色を切り替え                                    |
| `getScene()`                  | Three.jsシーンを取得                                |
| `getCamera()`                 | Three.jsカメラを取得                                |
| `resize()`                    | リサイズ処理                                        |
| `dispose()`                   | リソース解放                                        |

### 5.3 3Dプレビュー仕様

- Three.jsを使用して 3Dプレビューを表示
- 8x8x8のボクセルグリッドを表示
- 初期表示はFRONTが正面、垂直角度20度（少し上から見下ろす）、カメラ距離3
- 床面となる高さにグリッド線（8x8）を表示
- グリッドの外側に FRONT, RIGHT, LEFT, BACK をテキスト表示

### 5.4 カメラ操作

- マウスドラッグで視点を回転させる。左右回転と上下の傾き変更が可能。
- 上下の傾きは上側90度下側90度まで。マウスを右にドラッグすると、ブロックが右に回転する。
- マウスのホイールスクロールで拡大縮小

### 5.5 ボクセル編集（見た目モード）

- カーソル位置でレイキャストし対象のボクセルを常に選択
- 対象ボクセルのレイキャストした面を緑でハイライト、対象ボクセルの辺を赤で強調
- 対象ボクセルが無い場合は床面のグリッドをハイライト
- 設置できない方向の面のハイライトはしない
- 右クリックでハイライトした面に隣接するようボクセルを配置（現在選択中のマテリアル）
- 左クリックで選択したボクセルを削除
- ブラシサイズ:
  - [1] 1x1x1 ボクセル（単一）の設置・削除、ハイライトも1x1
  - [2] 2x2x2 ボクセル、グリッド座標(0,2,4,6)にスナップ、ハイライトも2x2
  - [4] 4x4x4 ボクセル、グリッド座標(0,4)にスナップ、ハイライトも4x4
- ハイライトサイズはブラシサイズに連動し、設置される範囲を視覚的に示す
- `getHighlightSize()` でテスト用に現在のハイライトサイズを取得可能

### 5.6 マテリアル

- 3つのマテリアルスロット（1, 2, 3）をサポート
- 各スロットにテクスチャURLを設定可能
- `setCurrentMaterial(num)` で配置時に使用するマテリアルを選択

### 5.7 データ形式

#### voxel_look形式（8x8x8、2bit）
- 各ボクセルは2ビット（0-3）で表現
  - 0: 空気（透明）
  - 1: material_1
  - 2: material_2
  - 3: material_3
- データはY→Z→X順で格納
- Base64エンコードして保存

## 6. ファイル構成

```
src/
  test/
    spec_1-4_custom_block_editor.html       # テスト用HTML
    spec_1-4_custom_block_editor_style.css  # テスト用スタイル
    spec_1-4_custom_block_editor_main.js    # テスト用スクリプト
  game/
    block_editor_ui.js                      # BlockEditorUIクラス（1-3で作成、ここで拡張）
    custom_block_editor.js                  # CustomBlockEditorコアクラス
    custom_block_mesh_builder.js            # カスタムブロック用メッシュ生成
    voxel_data.js                           # ボクセルデータのエンコード/デコード
```

## 7. テストページ仕様

### 7.1 画面構成

2カラム構成（比率 4:6）

**左カラム:**
- ブロック選択プルダウン（block_id で選択、shape_type="custom" のみ表示）
- block_str_id 表示
- name 表示
- 保存ボタン

**右カラム:**
- BlockEditorUI（3Dプレビュー + コントロールパネル）

### 7.2 データフロー

1. 起動時にGAS APIからブロック一覧・テクスチャ一覧を取得
2. ブロック選択プルダウンで選択
3. 選択したブロックを BlockEditorUI にロード
4. ボクセル編集・マテリアル変更
5. 保存ボタンでGAS APIにデータを送信

## 8. 補足仕様

### 8.1 初期状態
- 新規ブロック作成時、または `voxel_look` が空のブロックを選択した場合、ボクセルは全て空(0)で開始

### 8.2 未設定マテリアルの表示
- material_1, 2, 3 のテクスチャが未設定の場合、テクスチャリストの最初から順に自動セット
- テクスチャリストが空の場合はグレー単色で表示

### 8.3 編集範囲の制限
- 8x8x8の範囲外にボクセルを配置しようとした場合は無視する（何も起こらない）

### 8.4 Undo/Redo機能
- 本仕様では実装しない

### 8.5 空の状態での保存
- ボクセルが0個（全て空）の状態でも保存を許可する

## 9. 実装詳細: UV座標マッピング

### 9.1 概要

8x8x8のボクセルグリッドに1枚のテクスチャを貼る場合、各ボクセルはテクスチャの1/64（8x8分割の1つ）を表示する。
Three.jsのBoxGeometryを使用する際、UV座標の設定には注意が必要。

### 9.2 Three.js BoxGeometryの面順序

BoxGeometryの面は以下の順序で定義されている（各面4頂点）:
- インデックス 0-3: +X (right)
- インデックス 4-7: -X (left)
- インデックス 8-11: +Y (top)
- インデックス 12-15: -Y (bottom)
- インデックス 16-19: +Z (front)
- インデックス 20-23: -Z (back)

### 9.3 各面のUV座標計算

各面でどの座標軸をU/Vに使用するか:

| 面            | U座標   | V座標   |
|---------------|---------|---------|
| +X (right)    | 7 - z   | y       |
| -X (left)     | z       | y       |
| +Y (top)      | x       | 7 - z   |
| -Y (bottom)   | x       | z       |
| +Z (front)    | x       | y       |
| -Z (back)     | 7 - x   | y       |

※ `7 - 座標` の形式はその軸方向の反転を意味する

## 10. テスト用CSSセレクタ定義

BlockEditorUIが生成するカスタムブロック用UI要素:

| 要素 | セレクタ | 検証内容 |
|:-----|:---------|:---------|
| エディタコンテナ | `.editor-container` | アスペクト比 3:4 |
| プレビューコンテナ | `.preview-container` | 縦方向flex |
| ツールバー | `.preview-toolbar` | flex: 1（高さ1/8） |
| ツールバー左グループ | `.left-group` | モード切替ボタン配置 |
| ツールバー中央グループ | `.center-group` | ブラシサイズボタン配置 |
| ツールバー右グループ | `.right-group` | BGボタン配置 |
| 3Dプレビュー領域 | `.preview-3d` | flex: 6（高さ6/8） |
| コントロールパネル | `.control-panel` | flex: 1（高さ1/8） |
| スロットコンテナ | `.slots-container` | センター寄せ |
| カスタムブロック用スロットコンテナ | `.custom-slots` | カスタムブロック用 |
| マテリアルスロット | `.material-item` | 3つ存在 |
| マテリアルスロット識別属性 | `data-material-slot="番号"` | 1, 2, 3 |
| マテリアルスロット選択状態 | `.selected` | 選択中のスロット |
| モード切替ボタン | `.mode-toggle-btn` | look/collision切替 |
| ブラシサイズグループ | `.brush-group` | ボタン群とラベルを含む |
| ブラシサイズボタン群 | `.brush-buttons` | ボタン3つを含む |
| ブラシサイズボタン | `.brush-size-btn` | 3つ存在 |
| ブラシサイズラベル | `.brush-label` | 「ブラシサイズ」テキスト |
| ブラシサイズ識別属性 | `data-size="サイズ"` | 1, 2, 4 |
| ブラシサイズ選択状態 | `.active` | 選択中のサイズ |
| BGボタン | `.bg-btn` | 背景色切り替え |
| 衝突テストボタン | `.check-btn` | 緑背景、スロット画像と同じ高さ、フォントサイズ16px |
| 自動作成ボタン | `.auto-create-btn` | 青背景、スロット画像と同じ高さ、フォントサイズ16px |
| スロット画像 | `.slot-image` | 高さ `clamp(24px, 5vw, 48px)` |
| テクスチャアイテム名 | `.texture-item-name` | テクスチャ名表示 |
| 追加ボタン | `.texture-item.add-new` | 新規テクスチャ追加 |

## 11. テスト観点

テストコードは `tests/spec_1-4_custom_block_editor.spec.js` に実装。

```bash
# テスト項目一覧
npx playwright test --config=tests/playwright.config.js --list

# テスト実行
npm test

# UIモードでテスト確認
npm run test:ui
```

### 観点一覧

| 観点 | 内容 |
|------|------|
| BlockEditorUI カスタムブロック拡張 | shape_type切替、モード切替、ブラシサイズ、マテリアル設定、BGボタンの動作 |
| テクスチャ選択モーダル | 表示/非表示、テクスチャ選択、「なし」「追加」の動作、閉じる操作 |
| CustomBlockEditor クラス | init(), loadBlock(), setMaterial(), setCurrentMaterial(), setBrushSize(), setEditMode() の動作 |
| 3Dプレビュー表示 | 8x8x8ボクセルグリッド、カメラ初期位置、床面グリッド線、方向ラベル |
| カメラ操作 | マウスドラッグ回転、角度制限、ホイールズーム |
| ボクセル編集 | 右クリック配置、左クリック削除、ブラシサイズ別動作、範囲制限、ハイライト表示 |
| マテリアル選択 | マテリアル1-3の選択、選択マテリアルでの配置 |
| UI表示 | レイアウト構成、ボタンサイズ、スロット数、初期値 |
| テストページ | 2カラム構成、API連携、データ表示更新 |
