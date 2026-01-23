# 仕様書: 1-3 標準ブロックエディタ

## 1. 概要

標準ブロック（shape_type="normal"）を編集するための3Dエディタを作る。

### 作成するクラス

| クラス | 責務 |
|-------|------|
| BlockEditorUI | UI生成、イベントハンドリング、レイアウト管理 |
| StandardBlockEditor | Three.jsシーン管理、カメラ操作、テクスチャ切替 |
| StandardBlockMeshBuilder | ブロックメッシュの生成 |
| GasApi | GAS API通信 |

BlockEditorUIは1-4, 1-5で拡張され、最終的にblock_manager（1-6）で使用される。

## 2. 関連資料

- spec_1-1_block_data_sheet.md: データ構造
- spec_1-2_gas_api.md: API仕様
- **mockups/mock_block_editor_ui.html**: UIのビジュアルモック（サイズ・色仕様）

## 3. ファイル構成

```
src/
  test/
    spec_1-3_standard_block_editor.html       # テスト用HTML
    spec_1-3_standard_block_editor_style.css  # テスト用スタイル
    spec_1-3_standard_block_editor_main.js    # テスト用スクリプト
  game/
    block_editor_ui.js                        # BlockEditorUIクラス
    standard_block_editor.js                  # StandardBlockEditorクラス
    standard_block_mesh_builder.js            # メッシュ生成
    gas_api.js                                # API通信
tests/
  spec_1-3_block_editor_ui.spec.js            # Playwrightテストコード
```

src/test/ 及び src/game/ は公開用リポジトリにプッシュする。
公開用リポジトリ: https://github.com/masaru0ta/craftgame_public

## 4. UI仕様

### 4.1 レイアウト

- `.editor-container` の比率は横3：縦4（aspect-ratio: 3/4）
- 3Dプレビュー領域はレスポンシブで、コンテナ幅に合わせてサイズ変更
- ツールバー・コントロールパネルは各1/8、3Dプレビューは6/8の高さ
- テクスチャスロット・BGボタンのサイズはウィンドウ幅に応じて自動調整（24px〜48px）

### 4.2 UI構造とセレクタ

| 要素 | セレクタ | 説明 |
|------|----------|------|
| エディタコンテナ | `.editor-container` | 全体を囲む、aspect-ratio: 3/4 |
| プレビューコンテナ | `.preview-container` | 縦方向flexレイアウト |
| ツールバー | `.preview-toolbar` | 3カラムレイアウト（left/center/right-group） |
| ツールバー左 | `.left-group` | 標準ブロックは空 |
| ツールバー中央 | `.center-group` | 標準ブロックは空 |
| ツールバー右 | `.right-group` | BGボタン配置 |
| 3Dプレビュー領域 | `.preview-3d` | Three.js canvas |
| コントロールパネル | `.control-panel` | スロット配置エリア |
| スロットコンテナ | `.slots-container` | センター寄せ |
| 標準ブロック用スロット | `.normal-slots` | 7スロット格納 |
| テクスチャスロット | `.material-item[data-slot="スロット名"]` | default/front/top/bottom/left/right/back |
| スロット画像 | `.slot-image` | テクスチャサムネイル |
| BGボタン | `.bg-btn` | 背景色切り替え |
| 背景色インジケーター | `.bg-color-indicator` | 現在の背景色表示 |
| モーダルオーバーレイ | `.texture-modal-overlay` | モーダル背景（非表示） |
| モーダル本体 | `.texture-modal` | テクスチャ選択UI |
| モーダル閉じる | `.texture-modal-close` | ×ボタン |
| テクスチャグリッド | `.texture-grid` | テクスチャ一覧 |
| テクスチャアイテム | `.texture-item` | 各テクスチャ |
| テクスチャ名 | `.texture-item-name` | テクスチャ名表示 |
| 追加ボタン | `.texture-item.add-new` | 新規追加 |

### 4.3 操作仕様

#### テクスチャスロットクリック

1. テクスチャ選択モーダルを表示
2. ユーザーがテクスチャを選択
3. 3Dプレビューが更新される
4. `onBlockChange` コールバックで外部に通知

| 選択項目 | 動作 |
|----------|------|
| テクスチャ | スロットに設定、プレビュー更新 |
| 「なし」 | テクスチャ解除（defaultは紫色のデフォルトテクスチャ） |
| 「追加」 | `onTextureAdd` コールバック実行 |

**モーダルを閉じる操作:** ×ボタン / オーバーレイクリック / テクスチャ選択

#### BGボタンクリック

背景色を順番に切り替え: 黒(#000000) → 青(#1a237e) → 緑(#1b5e20) → 黒

## 5. 3Dプレビュー仕様

### 5.1 表示

- 3Dプレビュー枠の中央に立方体のブロックを表示
- 初期表示: FRONTが正面、垂直角度20度（少し上から見下ろす）、カメラ距離3
- 床面に白い枠線（ブロックと同サイズ）、外側にFRONT/RIGHT/LEFT/BACKのテキスト
- テクスチャ未設定の面はdefaultのテクスチャを使用

### 5.2 カメラ操作

**マウス操作:**
- ドラッグで視点回転（左右回転 + 上下傾き）
- 上下の傾きは±90度まで
- 右にドラッグ → ブロックが右に回転
- ホイールスクロールで拡大縮小

**タッチ操作（スマホ対応）:**
- 1本指スワイプで視点回転（マウスドラッグと同じ動作）
- ピンチイン/アウトで拡大縮小（ホイールと同じ動作）

### 5.3 テクスチャスロット

7つのスロット: default, front, top, bottom, left, right, back

## 6. 公開API

### BlockEditorUI

```javascript
constructor({ container, THREE, onTextureAdd, onBlockChange })
```

| メソッド | 説明 |
|----------|------|
| `init()` | UIを生成し、エディタを初期化 |
| `loadBlock(blockData, textures)` | ブロックデータをロードして表示 |
| `setTextures(textures)` | テクスチャ一覧を設定 |
| `setTexture(slot, textureName)` | 指定スロットにテクスチャを設定 |
| `getBlockData()` | 現在のブロックデータを取得 |
| `resize()` | リサイズ処理 |
| `dispose()` | リソース解放 |

### StandardBlockEditor

```javascript
constructor({ container, THREE })
```

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

## 7. テストページ仕様

### 画面構成

2カラム構成（比率 4:6）

**左カラム:**
- ブロック選択プルダウン（block_id で選択）
- block_str_id 表示
- name 表示
- 保存ボタン

**右カラム:**
- BlockEditorUI（3Dプレビュー + コントロールパネル）

### データフロー

1. 起動時にGAS APIからブロック一覧・テクスチャ一覧を取得
2. ブロック選択プルダウンで選択
3. 選択したブロックを BlockEditorUI にロード
4. テクスチャ変更・編集
5. 保存ボタンでGAS APIにデータを送信

## 8. テスト観点

テストコード: `tests/spec_1-3_block_editor_ui.spec.js`

| 観点 | 内容 |
|------|------|
| BlockEditorUI クラス | init(), loadBlock(), setTextures(), setTexture(), getBlockData() の動作 |
| テクスチャ選択モーダル | 表示/非表示、テクスチャ選択、「なし」「追加」の動作、閉じる操作 |
| StandardBlockEditor クラス | Three.js初期化、テクスチャ設定、背景色変更、リサイズ |
| 3Dプレビュー表示 | 立方体表示、カメラ初期位置、床面枠線、方向ラベル |
| カメラ操作 | マウスドラッグ回転、角度制限、ホイールズーム |
| UI表示 | レイアウト構成、スロット数、ボタン配置 |
| テストページ | 2カラム構成、API連携、データ表示更新 |
