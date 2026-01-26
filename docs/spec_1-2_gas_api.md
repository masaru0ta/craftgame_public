# 仕様書: 1-2 GAS API

## 1. 概要
1-1 で作成したスプレッドシートのデータを読み書きする API を GAS 上で作成する

## 2. 仕様

### 2.1 読み取りAPI（GET）
- getBlocks: ブロック状態リスト取得
- getTextures: テクスチャリスト取得
- getAll: 全データ取得

### 2.2 書き込みAPI（POST）
- createBlock: ブロックの新規作成
- saveBlock: ブロックの更新
- deleteBlock: ブロックの削除
- saveTexture: テクスチャの追加/更新
- deleteTexture: テクスチャの削除

### getBlocks - ブロック状態リスト取得

**リクエスト:** `?action=getBlocks`

**レスポンス:**
```json
{
  "success": true,
  "data": [
    {
      "block_id": 1,
      "block_str_id": "stone",
      "name": "石",
      "shape_type": "normal",
      "is_transparent": false,
      "light_level": 0,
      "drop_item": "", //※
      "tex_default": "stone",
      "tex_top": "", //※
      "tex_bottom": "", //※
      "tex_front": "", //※
      "tex_back": "", //※
      "tex_left": "", //※
      "tex_right": "", //※
      "voxel_look": "", //※
      "voxel_collision": "", //※
      "material_1": "", //※
      "material_2": "", //※
      "material_3": "" //※
    }
  ]
}
```
※の項目は空の場合は省略される

#### getTextures - テクスチャリスト取得

**リクエスト:** `?action=getTextures`

**レスポンス:**
```json
{
  "success": true,
  "data": [
    {
      "texture_id": 1,
      "file_name": "stone",
      "color_hex": "#808080",
      "image_base64": "data:image/png;base64,iVBORw0KGgo..."
    }
  ]
}
```

- `image_base64`: スプレッドシートに直接保存されたBase64エンコード画像データ

#### getAll - 全データ取得

**リクエスト:** `?action=getAll`

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "blocks": [...],
    "textures": [...]
  }
}
```

### エラーレスポンス

```json
{
  "success": false,
  "error": "エラーメッセージ"
}
```

### createBlock - ブロックの新規作成

**リクエスト:** POST `?action=createBlock`

**リクエストボディ:**
```json
{
  "block_str_id": "new_block",
  "name": "新しいブロック",
  "shape_type": "normal"
}
```

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| block_str_id | ○ | ブロックの文字列ID（英数字とアンダースコアのみ） |
| name | ○ | 表示名 |
| shape_type | ○ | "normal" または "custom" |

**バリデーション:**
- block_str_id が空でないこと
- block_str_id が既存のブロックと重複しないこと
- block_str_id が英数字とアンダースコアのみで構成されること
- name が空でないこと
- shape_type が "normal" または "custom" であること

**レスポンス:**
```json
{
  "success": true,
  "data": { "block_id": 10 }
}
```

**エラーレスポンス:**
```json
{
  "success": false,
  "error": "block_str_id already exists"
}
```

### saveBlock - ブロックの更新

**リクエスト:** POST `?action=saveBlock`

**リクエストボディ:**
```json
{
  "block_id": 1,
  "block_str_id": "stone",
  "name": "石",
  "shape_type": "normal",
  "is_transparent": false,
  "light_level": 0,
  "tex_default": "stone"
}
```
- block_id は必須（既存ブロックの更新のみ）

**レスポンス:**
```json
{
  "success": true,
  "data": { "block_id": 1 }
}
```

### deleteBlock - ブロックの削除

**リクエスト:** POST `?action=deleteBlock`

**リクエストボディ:**
```json
{
  "block_id": 1
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

### saveTexture - テクスチャの追加/更新

**リクエスト:** POST `?action=saveTexture`

**リクエストボディ:**
```json
{
  "texture_id": 1,
  "file_name": "stone",
  "color_hex": "#808080",
  "image_base64": "data:image/png;base64,..."
}
```
- texture_idが既存の場合は更新、存在しない場合は追加

**レスポンス:**
```json
{
  "success": true,
  "data": { "texture_id": 1 }
}
```

### deleteTexture - テクスチャの削除

**リクエスト:** POST `?action=deleteTexture`

**リクエストボディ:**
```json
{
  "texture_id": 1
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

## 3. テスト方針

- 読み取りAPI、書き込みAPI の要件を一通りテストする。
- 正常系、異常系をテストする。
