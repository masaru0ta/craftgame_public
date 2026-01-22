# 仕様書: 1-3 標準ブロックエディタ

## 1. 概要

標準ブロック（shape_type="normal"）を編集するための3Dエディタコアクラスを作る。
このクラスはUIを生成せず、Three.jsシーン・メッシュ・カメラ操作のみを担当する。
実際のUIは 1-6 BlockEditorUI から利用される。

ここで作る重要な部品は、
- GAS API の読み書きライブラリ（ゲーム本体、管理ツールで利用）
- 通常ブロックのメッシュ生成ライブラリ（ゲーム本体で利用）
- 通常ブロックの3Dエディタコアクラス（BlockEditorUI で利用）

src/test/ 及び src/game/ のディレクトリは公開用の Github リポジトリにプッシュする
公開用リポジトリ: https://github.com/masaru0ta/craftgame_public

## 2. 関連資料

- spec_1-1_block_data_sheet.md: データ構造
- spec_1-2_gas_api.md: API仕様
- spec_1-6_block_shape_manager.md: BlockEditorUI（このクラスを利用する）

## 3. アーキテクチャ

### 3.1 クラス構成

```
BlockEditorUI (1-6で定義)
    ├── StandardBlockEditor (このクラス)
    │   └── StandardBlockMeshBuilder
    └── CustomBlockEditor (1-4で定義)
        └── CustomBlockMeshBuilder
```

### 3.2 責務分離

| クラス | 責務 |
|--------|------|
| StandardBlockEditor | Three.jsシーン管理、カメラ操作、テクスチャ切替 |
| StandardBlockMeshBuilder | ブロックメッシュの生成 |
| BlockEditorUI | UI生成、イベントハンドリング、エディタ切替 |

## 4. 機能詳細

### 4.1 StandardBlockEditor クラス

#### コンストラクタ

```javascript
constructor(options) {
  // options.container: Three.jsをマウントするDOM要素
  // options.THREE: Three.jsライブラリ（外部から注入）
}
```

#### 公開メソッド

| メソッド | 説明 |
|----------|------|
| `init()` | シーン・カメラ・レンダラーを初期化 |
| `loadBlock(blockData)` | ブロックデータをロードして表示 |
| `setTexture(slot, textureUrl)` | 指定スロットにテクスチャを設定 |
| `getTextures()` | 現在のテクスチャ設定を取得 |
| `setBackgroundColor(color)` | 背景色を設定 |
| `getScene()` | Three.jsシーンを取得 |
| `getCamera()` | Three.jsカメラを取得 |
| `resize()` | リサイズ処理 |
| `dispose()` | リソース解放 |

### 4.2 3Dプレビュー仕様

- Three.jsを使用して 3Dプレビューを表示
- 3Dプレビュー枠の中央に立方体のブロックを表示
- 初期表示はFRONTが正面、垂直角度20度（少し上から見下ろす）、カメラ距離3（ブロックサイズの3倍）
- 床面となる高さにブロックと同じ大きさの白い枠線と、その枠線の外側に FRONT, RIGHT, LEFT, BACK をテキスト表示
- テクスチャ未設定の面は default の指定があれば default のテクスチャを使用する

### 4.3 カメラ操作

- マウスドラッグで視点を回転させる。左右回転と上下の傾き変更が可能。
- 上下の傾きは上側90度下側90度まで。マウスを右にドラッグすると、ブロックが右に回転する。
- マウスのホイールスクロールで拡大縮小

### 4.4 テクスチャスロット

7つのテクスチャスロットをサポート:
- default, front, top, bottom, left, right, back
- 各スロットにテクスチャURLを設定可能
- 未設定の面は default を使用

## 5. ファイル構成

```
src/
  test/
    spec_1-3_standard_block_editor.html       # 単体テスト用HTML
    spec_1-3_standard_block_editor_style.css  # 単体テスト用スタイル
    spec_1-3_standard_block_editor_main.js    # 単体テスト用スクリプト
  game/
    standard_block_editor.js                  # 標準ブロックエディタコアクラス
    gas_api.js                                # API通信
    standard_block_mesh_builder.js            # 標準ブロック用メッシュ生成
```

## 6. テスト用CSSセレクタ定義

単体テスト用HTMLで使用するセレクタ:

| 要素 | セレクタ | 検証内容 |
|:-----|:---------|:---------|
| 右カラム | `.right-column` | 全幅の基準 |
| 3Dプレビュー枠 | `.preview-container` | アスペクト比 3:4 |
| ツールボタン枠 | `.toolbar` | 高さ 1/8 |
| 3Dプレビュー領域 | `.preview-3d` | 高さ 6/8 |
| テクスチャ設定枠 | `.texture-panel` | 高さ 1/8 |
| 背景色表示 | `.bg-color-indicator` | 背景色の確認 |
| テクスチャスロット | `.texture-slot` | 7つ存在、ラベル順序 |

## 7. テスト項目

### StandardBlockEditor クラス

- [ ] `init()` でシーン・カメラ・レンダラーが初期化される
- [ ] `loadBlock(blockData)` でブロックが3Dプレビューに表示される
- [ ] `setTexture(slot, url)` でテクスチャが反映される
- [ ] `getTextures()` で現在のテクスチャ設定が取得できる
- [ ] `setBackgroundColor(color)` で背景色が変更される
- [ ] `getScene()` でThree.jsシーンが取得できる
- [ ] `getCamera()` でThree.jsカメラが取得できる
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

### 単体テスト用HTML（spec_1-3_standard_block_editor.html）

- [ ] Github にパブリッシュしたエディタ画面が正常に表示される
- [ ] 2カラムの幅比率が 4:6 である
- [ ] 右カラムに3Dプレビューが表示される
- [ ] 背景色切り換えボタンクリックで背景色が変化する
- [ ] テクスチャ枠クリックで選択画面が表示される
- [ ] テクスチャ変更時に3Dプレビューが更新される
- [ ] 保存ボタンでGAS APIにデータを送信できる
