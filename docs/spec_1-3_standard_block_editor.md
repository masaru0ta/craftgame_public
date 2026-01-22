# 仕様書: 1-3 標準ブロックエディタ

## 1. 概要

標準ブロック（shape_type="normal"）を編集するための3Dエディタを作る。
この仕様では以下を作成する:

1. **BlockEditorUI** - UI生成・イベントハンドリングを担当するクラス（基盤）
2. **StandardBlockEditor** - Three.jsシーン・メッシュ・カメラ操作を担当するコアクラス
3. **StandardBlockMeshBuilder** - ブロックメッシュ生成ライブラリ
4. **GasApi** - GAS API通信ライブラリ

BlockEditorUIは1-4, 1-5で拡張され、最終的にblock_manager（1-6）で使用される。
テストページはBlockEditorUIを使用することで、UIの調整が1回で済む。

src/test/ 及び src/game/ のディレクトリは公開用の Github リポジトリにプッシュする
公開用リポジトリ: https://github.com/masaru0ta/craftgame_public

## 2. 関連資料

- spec_1-1_block_data_sheet.md: データ構造
- spec_1-2_gas_api.md: API仕様
- spec_1-4_custom_block_editor.md: カスタムブロック機能を追加
- spec_1-5_collision_editor.md: 衝突テスト機能を追加
- spec_1-6_block_shape_manager.md: block_manager統合ツール
- **mockups/mock_block_editor_ui.html**: BlockEditorUIのビジュアルモック（UIパーツ・サイズ・色仕様）

## 3. アーキテクチャ

### 3.1 クラス構成

```
BlockEditorUI (この仕様で作成、1-4/1-5で拡張)
    └── StandardBlockEditor (この仕様で作成)
        └── StandardBlockMeshBuilder
```

### 3.2 責務分離

| クラス | 責務 |
|--------|------|
| BlockEditorUI | UI生成、イベントハンドリング、レイアウト管理 |
| StandardBlockEditor | Three.jsシーン管理、カメラ操作、テクスチャ切替 |
| StandardBlockMeshBuilder | ブロックメッシュの生成 |

### 3.3 処理シーケンス

#### 初期化

```
外部（テストページ/block_manager）
    │
    │ new BlockEditorUI({ container, THREE, onTextureAdd, onBlockChange })
    │ editorUI.init()
    │ editorUI.setTextures(textures)   ← テクスチャ一覧を渡す
    │ editorUI.loadBlock(blockData)
    ▼
BlockEditorUI
    │
    │ new StandardBlockEditor({ container, THREE })
    │ standardBlockEditor.init()
    │ standardBlockEditor.loadBlock(blockData)
    ▼
StandardBlockEditor
    │
    │ 3Dプレビュー表示
```

#### テクスチャ変更

```
ユーザー操作
    │
    │ スロットクリック
    ▼
BlockEditorUI
    │
    │ モーダル表示
    │ ユーザーがテクスチャ選択
    │ standardBlockEditor.setTexture(slot, url)
    ▼
StandardBlockEditor
    │
    │ 3Dプレビュー更新
    ▼
BlockEditorUI
    │
    │ onBlockChange(blockData) で外部に通知
```

## 4. BlockEditorUI クラス

### 4.1 概要

BlockEditorUIはDOM要素を受け取り、その中に3Dプレビュー用のUIを生成する。
この仕様では標準ブロック用のUIを実装し、1-4でカスタムブロック用UIを追加する。

### 4.2 コンストラクタ

```javascript
constructor(options) {
  // options.container: UIをマウントするDOM要素
  // options.THREE: Three.jsライブラリ（外部から注入）
  // options.onTextureAdd: 「追加」選択時コールバック (optional)
  // options.onBlockChange: ブロックデータ変更時コールバック (optional)
}
```

### 4.3 公開メソッド

| メソッド | 説明 |
|----------|------|
| `init()` | UIを生成し、エディタを初期化 |
| `loadBlock(blockData, textures)` | ブロックデータをロードして表示 |
| `setTextures(textures)` | テクスチャ一覧を設定 |
| `setTexture(slot, textureName)` | 指定スロットにテクスチャを設定 |
| `getBlockData()` | 現在のブロックデータを取得 |
| `resize()` | リサイズ処理 |
| `dispose()` | リソース解放 |

### 4.4 UI構造（標準ブロック用）

```
.editor-container
├── .preview-container
│   ├── .preview-toolbar (3カラムレイアウト)
│   │   ├── .left-group
│   │   │   └── (標準ブロックは空)
│   │   ├── .center-group
│   │   │   └── (標準ブロックは空)
│   │   └── .right-group
│   │       └── .bg-btn
│   │           ├── .bg-color-indicator
│   │           └── .bg-label
│   ├── .preview-3d
│   │   └── Three.js canvas
│   └── .control-panel
│       └── .slots-container
│           └── .material-item x7 (default, front, top, bottom, left, right, back)
│               ├── .slot-image
│               └── span (ラベル)
└── .texture-modal-overlay (非表示、スロットクリックで表示)
    └── .texture-modal
        ├── .texture-modal-header
        │   ├── .texture-modal-title
        │   └── .texture-modal-close
        └── .texture-grid
            ├── .texture-item (「なし」)
            ├── .texture-item x N (テクスチャ一覧)
            └── .texture-item (「追加」)
```

### 4.5 UIパーツ仕様

サイズ・色・枠線などの詳細仕様は `mockups/mock_block_editor_ui.html` を参照。

### 4.6 UI操作

#### 4.6.1 テクスチャスロットクリック

テクスチャスロット（`.material-item`）をクリックすると:

1. BlockEditorUIがテクスチャ選択モーダルを表示
2. ユーザーがテクスチャを選択
3. BlockEditorUIが内部のStandardBlockEditor.setTexture()を呼び出し
4. 3Dプレビューが更新される
5. `onBlockChange` コールバックで外部に通知

**テクスチャ選択モーダルでの選択:**

| 選択項目 | 動作 |
|----------|------|
| テクスチャ | 選択したテクスチャをスロットに設定、3Dプレビュー更新 |
| 「なし」 | スロットのテクスチャを解除（default スロットの場合は紫色のデフォルトテクスチャを使用） |
| 「追加」 | `onTextureAdd` コールバックで外部に通知（アップロード処理は外部で実装） |

**モーダルを閉じる操作:**
- ×ボタンクリック
- オーバーレイ（モーダル外の暗い部分）クリック
- テクスチャ選択後は自動で閉じる

テクスチャ選択モーダルのUI仕様は `mockups/mock_block_editor_ui.html` を参照。

#### 4.6.2 BGボタンクリック

BGボタン（`.bg-btn`）をクリックすると:

1. 3Dプレビューの背景色が順番に切り替わる
2. 切り替え順序: 黒（#000000）→ 青（#1a237e）→ 緑（#1b5e20）→ 黒（#000000）
3. BGボタン内のインジケーター（`.bg-color-indicator`）が現在の背景色を表示

## 5. StandardBlockEditor クラス

### 5.1 コンストラクタ

```javascript
constructor(options) {
  // options.container: Three.jsをマウントするDOM要素
  // options.THREE: Three.jsライブラリ（外部から注入）
}
```

### 5.2 公開メソッド

| メソッド | 説明 |
|----------|------|
| `init()` | シーン・カメラ・レンダラーを初期化 |
| `loadBlock(blockData)` | ブロックデータをロードして表示 |
| `setTexture(slot, textureUrl)` | 指定スロットにテクスチャを設定 |
| `getTextures()` | 現在のテクスチャ設定を取得 |
| `setBackgroundColor(color)` | 背景色を設定 |
| `toggleBackgroundColor()` | 背景色を切り替え |
| `getScene()` | Three.jsシーンを取得 |
| `getCamera()` | Three.jsカメラを取得 |
| `resize()` | リサイズ処理 |
| `dispose()` | リソース解放 |

### 5.3 3Dプレビュー仕様

- Three.jsを使用して 3Dプレビューを表示
- 3Dプレビュー枠の中央に立方体のブロックを表示
- 初期表示はFRONTが正面、垂直角度20度（少し上から見下ろす）、カメラ距離3（ブロックサイズの3倍）
- 床面となる高さにブロックと同じ大きさの白い枠線と、その枠線の外側に FRONT, RIGHT, LEFT, BACK をテキスト表示
- テクスチャ未設定の面は default の指定があれば default のテクスチャを使用する

### 5.4 カメラ操作

- マウスドラッグで視点を回転させる。左右回転と上下の傾き変更が可能。
- 上下の傾きは上側90度下側90度まで。マウスを右にドラッグすると、ブロックが右に回転する。
- マウスのホイールスクロールで拡大縮小

### 5.5 テクスチャスロット

7つのテクスチャスロットをサポート:
- default, front, top, bottom, left, right, back
- 各スロットにテクスチャURLを設定可能
- 未設定の面は default を使用

## 6. ファイル構成

```
src/
  test/
    spec_1-3_standard_block_editor.html       # テスト用HTML
    spec_1-3_standard_block_editor_style.css  # テスト用スタイル
    spec_1-3_standard_block_editor_main.js    # テスト用スクリプト
  game/
    block_editor_ui.js                        # BlockEditorUIクラス
    standard_block_editor.js                  # StandardBlockEditorコアクラス
    standard_block_mesh_builder.js            # 標準ブロック用メッシュ生成
    gas_api.js                                # API通信
```

## 7. テストページ仕様

### 7.1 画面構成

2カラム構成（比率 4:6）

**左カラム:**
- ブロック選択プルダウン（block_id で選択）
- block_str_id 表示
- name 表示
- 保存ボタン

**右カラム:**
- BlockEditorUI（3Dプレビュー + コントロールパネル）

### 7.2 データフロー

1. 起動時にGAS APIからブロック一覧・テクスチャ一覧を取得
2. ブロック選択プルダウンで選択
3. 選択したブロックを BlockEditorUI にロード
4. テクスチャ変更・編集
5. 保存ボタンでGAS APIにデータを送信

## 8. テスト用CSSセレクタ定義

BlockEditorUIが生成するUI要素。サイズ・色の詳細は `mockups/mock_block_editor_ui.html` を参照。

| 要素 | セレクタ |
|:-----|:---------|
| エディタコンテナ | `.editor-container` |
| プレビューコンテナ | `.preview-container` |
| ツールバー | `.preview-toolbar` |
| ツールバー左グループ | `.left-group` |
| ツールバー中央グループ | `.center-group` |
| ツールバー右グループ | `.right-group` |
| 3Dプレビュー領域 | `.preview-3d` |
| コントロールパネル | `.control-panel` |
| スロットコンテナ | `.slots-container` |
| スロット枠 | `.material-item` |
| スロット画像 | `.slot-image` |
| BGボタン | `.bg-btn` |
| 背景色インジケーター | `.bg-color-indicator` |
| ラベル | `.bg-label`, `span` |
| モーダルオーバーレイ | `.texture-modal-overlay` |
| モーダル本体 | `.texture-modal` |
| モーダルヘッダー | `.texture-modal-header` |
| モーダル閉じるボタン | `.texture-modal-close` |
| テクスチャグリッド | `.texture-grid` |
| テクスチャアイテム | `.texture-item` |

## 9. テスト項目

### BlockEditorUI クラス

- [ ] `init()` でUIが生成される
- [ ] `loadBlock()` でブロックが3Dプレビューに表示される
- [ ] `setTextures()` でテクスチャ一覧がモーダルに反映される
- [ ] `setTexture()` でテクスチャが反映される
- [ ] `getBlockData()` で現在のブロックデータが取得できる
- [ ] BGボタンクリックで背景色が変化する

### テクスチャ選択モーダル

- [ ] テクスチャスロットクリックでモーダルが表示される
- [ ] モーダルにテクスチャ一覧が表示される
- [ ] 「なし」が先頭に表示される
- [ ] 「追加」が最後尾に表示される
- [ ] テクスチャ選択で3Dプレビューが更新される
- [ ] テクスチャ選択後にモーダルが閉じる
- [ ] 「なし」選択でテクスチャが解除される
- [ ] 「追加」選択で `onTextureAdd` コールバックが呼ばれる
- [ ] ×ボタンクリックでモーダルが閉じる
- [ ] オーバーレイクリックでモーダルが閉じる

### StandardBlockEditor クラス

- [ ] `init()` でシーン・カメラ・レンダラーが初期化される
- [ ] `loadBlock(blockData)` でブロックが3Dプレビューに表示される
- [ ] `setTexture(slot, url)` でテクスチャが反映される
- [ ] `getTextures()` で現在のテクスチャ設定が取得できる
- [ ] `setBackgroundColor(color)` で背景色が変更される
- [ ] `resize()` でリサイズが正しく処理される
- [ ] `dispose()` でリソースが解放される

### 3Dプレビュー表示

- [ ] 立方体が表示される
- [ ] 初期表示でFRONTが正面になっている
- [ ] 初期表示で垂直角度20度になっている
- [ ] 初期表示でカメラ距離3になっている
- [ ] 床面に白い枠線が表示される
- [ ] FRONT, RIGHT, LEFT, BACKのテキストが表示されている
- [ ] 各面にテクスチャが正しく表示される
- [ ] テクスチャ未設定の面はdefaultテクスチャが使用される

### カメラ操作

- [ ] マウスドラッグで視点を回転できる
- [ ] 上下の傾きが上側90度、下側90度までに制限される
- [ ] マウスホイールで拡大縮小できる

### UI表示

※ サイズ・色の詳細仕様は `mockups/mock_block_editor_ui.html` を参照

- [ ] UIがモックHTMLと同じ見た目で表示される
- [ ] ツールバーが3カラム構成（left-group, center-group, right-group）である
- [ ] テクスチャスロット（.material-item）が7つ表示される（default, front, top, bottom, left, right, back）
- [ ] BGボタンが右グループに表示される

### テストページ（spec_1-3_standard_block_editor.html）

- [ ] Github にパブリッシュしたエディタ画面が正常に表示される
- [ ] 2カラムの幅比率が 4:6 である
- [ ] 左カラムにブロック選択プルダウンが表示される
- [ ] 左カラムにblock_str_id、nameが表示される
- [ ] 左カラムに保存ボタンが表示される
- [ ] 右カラムにBlockEditorUIが表示される
- [ ] 起動時にGAS APIからブロック一覧を取得できる
- [ ] 起動時にGAS APIからテクスチャ一覧を取得できる
- [ ] ブロック選択時にblock_str_id、nameが更新される
- [ ] ブロック選択時に3Dプレビューが更新される
- [ ] 背景色切り換えボタンクリックで背景色が変化する
- [ ] テクスチャ枠クリックで選択モーダルが表示される
- [ ] モーダルでテクスチャを選択すると3Dプレビューが更新される
- [ ] 「追加」選択時にアラート等で通知される（テスト用の仮実装）
- [ ] 保存ボタンでGAS APIにデータを送信できる
