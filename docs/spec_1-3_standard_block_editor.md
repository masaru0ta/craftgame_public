# 仕様書: 1-3 標準ブロックエディタ

## 1. 概要

標準ブロック（shape_type="normal"）を編集するシンプルな Webベースのエディタを作る。
細かな項目編集はここでは行わず、テクスチャ設定だけを作る。
細かな項目編集や新規作成・削除などは、別の管理ツールで行うのでここでは考慮しない。

ここで作る重要な部品は、
・GAS API の読み書きライブラリ（ゲーム本体、管理ツールで利用）
・通常ブロックのメッシュ生成ライブラリ（ゲーム本体で利用）
・通常ブロックのテクスチャ編集UI（管理ツールで利用）

src/test/ 及び src/game/ のディレクトリは公開用の Github リポジトリにプッシュする
公開用リポジトリ: https://github.com/masaru0ta/craftgame_public

## 2. 関連資料

- spec_1-1_block_data_sheet.md: データ構造
- spec_1-2_gas_api.md: API仕様

## 3. 機能詳細

### 3.1 画面構成

- ２カラム。比率 4:6
- 左カラムに block_id 選択のプルダウン、block_str_id（表示のみ）、name（表示のみ）、保存ボタンを表示
- 右カラムに 3Dプレビュー兼編集。

### 3.2 3Dプレビュー レイアウト

- Three.jsを使用して 3Dプレビューを表示
- 3Dプレビュー枠の横:縦 = 3:4 のやや縦長の領域
- 3Dプレビュー枠は右カラムの横幅いっぱいに表示
- 3Dプレビュー枠内 上部 1/8 の領域に黒い帯を敷く。ここにツールボタンを置く枠とする
  - ツールボタン枠右端に、背景色切り換えボタン（四角い枠１つの下にBGと表記）。内部は現在の背景色で塗りつぶし。
  - 背景色切り換えボタンは下部のテクスチャ設定枠と同じ大きさ
- 3Dプレビュー枠内 下部 1/8 の領域に黒い帯を敷く。ここにテクスチャ設定を置く枠とする
- テクスチャ設定は７つあり、テクスチャ枠とラベルが表示されている。
- テクスチャ設定のラベルは default, front, top, bottom, left, right, back
- 3Dプレビュー枠の中央に立方体のブロックを表示
- 初期表示はFRONTが正面、垂直角度20度（少し上から見下ろす）、カメラ距離3（ブロックサイズの3倍）
- 床面となる高さにブロックと同じ大きさの白い枠線と、その枠線の外側に FRONT, RIGHT, LEFT, BACK をテキスト表示
- ウィンドウ幅が狭くなっても3Dプレビュー枠のサイズを自動調整するレスポンシブ設計
- テクスチャ未設定の面は default の指定があれば default のテクスチャを使用する。テクスチャ画像枠は未設定状態（黒）のまま。

### 3.3 3Dプレビュー 操作

- 背景色切り換えボタンクリックで背景色変化（黒 ＞ 青 ＞ 緑 ＞ 黒）
- 背景色変更時にBGボタン内部の色も更新される
- マウスドラッグで視点を回転させる。左右回転と上下の傾き変更が可能。
- 上下の傾きは上側90度下側90度まで。マウスを右にドラッグすると、ブロックが右に回転する。
- マウスのホイールスクロールで拡大縮小

### 3.4 テクスチャ選択

- テクスチャ枠をクリックするとテクスチャの選択画面を表示
- テクスチャ選択画面ではテクスチャをタイル表示
- タイルの最初に「テクスチャなし」があり、それをクリックするとテクスチャ選択が未設定状態になる
- タイルの最後に「テクスチャ追加」があり、それをクリックするとテクスチャをローカルからアップロードする
- アップロードしたテクスチャは、APIを通じてスプレッドシートに保存される

### 3.5 レスポンシブ対応

- ウィンドウ幅が狭くなって 3Dプレビュー枠が小さくなってもブロックとテクスチャ枠のサイズを自動調整する

## 4. ファイル構成

```
src/
  test/
    spec_1-3_standard_block_editor.html       # メインHTML
    spec_1-3_standard_block_editor_style.css  # スタイル
    spec_1-3_standard_block_editor_main.js    # メインスクリプト
  game/
    standard_block_editor.js                  # 通常ブロック用エディターUI
    gas_api.js                                # API通信
    standard_block_mesh_builder.js            # 通常ブロック用メッシュ生成
```

## 5. テスト用CSSセレクタ定義

テストで数値検証が必要な要素のセレクタを定義する。実装はこれらのセレクタを使用すること。

|   要素           | セレクタ                | 検証内容                    |
|:-----------------|:-----------------------|:----------------------------|
| 右カラム           | `.right-column`         | 全幅の基準                  |
| 3Dプレビュー枠      | `.preview-container`    | アスペクト比 3:4            |
| ツールボタン枠      | `.toolbar`              | 高さ 1/8                    |
| 3Dプレビュー領域    | `.preview-3d`           | 高さ 6/8                    |
| テクスチャ設定枠    | `.texture-panel`        | 高さ 1/8                    |
| 背景色表示         | `.bg-color-indicator`   | 背景色の確認                |
| テクスチャスロット  | `.texture-slot`         | 7つ存在、ラベル順序         |

## 6. テスト項目

### 画面構成
- [ ] Github にパブリッシュしたエディタ画面が正常に表示される
- [ ] 2カラムの幅比率が 4:6 である（左カラム flex:4、右カラム flex:6）
- [ ] 左カラムにblock_id選択プルダウンが表示される
- [ ] 左カラムにblock_str_id、name、保存ボタンが表示される
- [ ] 右カラムに3Dプレビューが表示される

### 3Dプレビュー レイアウト（数値検証必須）
- [ ] `.preview-container`が`.right-column`の横幅いっぱいに表示される
  - 検証: `.preview-container`の幅 === `.right-column`のコンテンツ幅（誤差1px以内）
- [ ] `.preview-container`のアスペクト比が 横:縦 = 3:4 である
  - 検証: 幅 / 高さ === 0.75（誤差1%以内）
- [ ] `.toolbar`の高さが`.preview-container`の1/8である
  - 検証: `.toolbar`の高さ / `.preview-container`の高さ === 0.125（誤差1%以内）
- [ ] `.texture-panel`の高さが`.preview-container`の1/8である
  - 検証: `.texture-panel`の高さ / `.preview-container`の高さ === 0.125（誤差1%以内）
- [ ] `.preview-3d`の高さが`.preview-container`の6/8である
  - 検証: `.preview-3d`の高さ / `.preview-container`の高さ === 0.75（誤差1%以内）
- [ ] `.toolbar`の背景色が黒（#000000）である
- [ ] `.texture-panel`の背景色が黒（#000000）である
- [ ] `#bg-btn`が`.toolbar`内の右端に表示される
- [ ] `.bg-color-indicator`が現在の背景色で塗りつぶされている
- [ ] 床面にブロックと同じ大きさの白い枠線が表示される
- [ ] 床面の高さにFRONT, RIGHT, LEFT, BACKのテキストが表示されている
- [ ] 立方体が表示される
- [ ] 初期表示でFRONTが正面になっている
- [ ] 初期表示で垂直角度20度（少し上から見下ろす）になっている
- [ ] 初期表示でカメラ距離3（ブロックサイズの3倍）になっている
- [ ] 各面にテクスチャが正しく表示される
- [ ] テクスチャ未設定の面はdefaultテクスチャが使用される（テクスチャ枠は未設定状態のまま）

### 3Dプレビュー 操作
- [ ] 背景色切り換えボタンクリックで背景色が変化する（黒 → 青 → 緑 → 黒の3色サイクル）
- [ ] 背景色変更時にBGボタン内部の色も更新される
- [ ] マウスドラッグで視点を回転できる
- [ ] 上下の傾きが上側90度、下側90度までに制限される
- [ ] マウスホイールで拡大縮小できる

### テクスチャ選択
- [ ] テクスチャ枠が7つ表示されている
- [ ] テクスチャ設定のラベルが default, front, top, bottom, left, right, back の順で表示される
- [ ] テクスチャ指定が未選択の場合は黒（#000000）で表示される
- [ ] テクスチャ枠クリックで選択画面（モーダル）が表示される
- [ ] テクスチャがタイル表示される
- [ ] 「テクスチャなし」選択で未設定状態になる
- [ ] 「テクスチャ追加」でローカルファイルをアップロードできる
- [ ] アップロードしたテクスチャがスプレッドシートに保存される
- [ ] テクスチャ変更時に3Dプレビューが更新される

### データ読込
- [ ] 起動時にGAS APIからブロック一覧を取得できる
- [ ] 起動時にGAS APIからテクスチャ一覧を取得できる
- [ ] ブロック選択時にblock_str_id、nameが表示される
- [ ] ブロック選択時にテクスチャ設定が反映される

### データ保存
- [ ] 保存ボタンでGAS APIにデータを送信できる
- [ ] 保存後にブロック一覧が更新される

## 7. テスト検証コード例

```javascript
// レイアウト数値検証
function verifyLayout() {
  const container = document.querySelector('.preview-container');
  const toolbar = document.querySelector('.toolbar');
  const preview3d = document.querySelector('.preview-3d');
  const texturePanel = document.querySelector('.texture-panel');
  const rightColumn = document.querySelector('.right-column');

  const containerRect = container.getBoundingClientRect();
  const rightColumnStyle = window.getComputedStyle(rightColumn);
  const rightColumnPadding = parseFloat(rightColumnStyle.paddingLeft) + parseFloat(rightColumnStyle.paddingRight);
  const rightColumnContentWidth = rightColumn.getBoundingClientRect().width - rightColumnPadding;

  return {
    // 全幅検証（誤差1px以内）
    isFullWidth: Math.abs(containerRect.width - rightColumnContentWidth) < 1,
    // アスペクト比検証（誤差1%以内）
    isAspectRatioCorrect: Math.abs(containerRect.width / containerRect.height - 0.75) < 0.01,
    // ツールバー1/8検証（誤差1%以内）
    isToolbarCorrect: Math.abs(toolbar.getBoundingClientRect().height / containerRect.height - 0.125) < 0.01,
    // プレビュー6/8検証（誤差1%以内）
    isPreview3dCorrect: Math.abs(preview3d.getBoundingClientRect().height / containerRect.height - 0.75) < 0.01,
    // テクスチャパネル1/8検証（誤差1%以内）
    isTexturePanelCorrect: Math.abs(texturePanel.getBoundingClientRect().height / containerRect.height - 0.125) < 0.01
  };
}
```
