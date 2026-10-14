# CUBE MASTER（仮）

立方体をテーマにした算数・数学の学習 Web アプリです（対象：小学4年生〜中学3年生）。
立方体の展開図・切断・位置関係・サイコロの回転・体積などの空間図形問題を扱う予定です。

**現在は Phase 0（Ver.0.1.0）**：3D 立方体の表示・操作・選択・強調表示と、Web アプリの共通基盤を実装しています。
問題の出題・正誤判定・スコア・段位認定はまだありません。

- 技術：HTML / CSS / JavaScript（ES Modules）、Vite、Three.js（OrbitControls・Raycaster・CSS2DRenderer）、Vitest
- サーバー・データベース不要の静的サイト（GitHub Pages で公開）
- UI フレームワーク・TypeScript は不使用。外部 CDN にも依存しません

## 動作環境

- Node.js 22.12 以上（推奨：24 LTS。`.nvmrc` 参照）
- WebGL2 に対応したブラウザ（Chrome / Edge / Safari / Firefox の最新版）

## 起動方法

```bash
npm install        # 依存関係のインストール（CI では npm ci）
npm run dev        # 開発サーバー起動 → http://localhost:5173/
npm run test       # 自動テスト（Vitest）
npm run build      # 本番ビルド（dist/ に出力。base は /cube-master/）
npm run preview    # ビルド結果の確認 → http://localhost:4173/cube-master/
```

## 操作方法

| 操作 | パソコン | スマホ・タブレット |
|---|---|---|
| 回転（カメラが立方体のまわりを回る） | ドラッグ | 1本指でなぞる |
| 拡大・縮小 | マウスホイール | ピンチ |
| 頂点・辺・面をえらぶ | クリック（もう一度で解除） | タップ（もう一度で解除） |
| はじめの向きに戻す | 「視点リセット」 | 「視点リセット」 |

3D プレビュー画面の操作パネル：

- **選択**：頂点／辺／面の切り替え、1つだけ／複数、選択をクリア
- **表示**：不透明／半透明／ワイヤー、頂点ラベル ON/OFF、自由回転 ON/OFF、視点リセット
- **デモ**：90°回転デモ、面の色変化デモ、強調表示デモ、強調を解除、演出をスキップ
- **開発者向け情報**：選択中 ID・強調中 ID・カメラ位置・アニメーション状態など

補足：

- 面が「不透明」のときは、裏に隠れた頂点・辺は選べません（見えているものだけ選べる）。「半透明」なら選べます。
- 「ワイヤー」のときは面が非表示になり、面は選べません（選択中の面だけは表示されます）。
- パン（平行移動）は無効です。立方体は常に画面中央にあります。

### ブラウザのコンソールから API を試す

3D プレビュー画面を開いている間は `window.cubeMaster.viewer` からビューア API を呼べます。

```js
const v = window.cubeMaster.viewer;
v.highlightEdge('AB');                                   // 辺 AB を緑で強調
v.highlightFace('BCGF', { color: '#ff8c1a', opacity: 0.4, duration: 3000 });
v.highlightElements(['A', 'CG', 'EFGH']);                // 種類の混在も可
v.clearHighlights();
v.setMultipleSelection(true); v.select('A'); v.select('GH');
v.getSelected();                                          // → ['A', 'GH']
v.disableRotation(); v.resetCamera();
await v.playRotationDemo();                               // → { status: 'completed' }
```

## フォルダ構成

```text
cube-master/
├── .github/workflows/deploy.yml   GitHub Pages 自動デプロイ（テスト → ビルド → 公開）
├── public/favicon.svg
├── src/
│   ├── main.js                    エントリー（ハッシュルーティング・グローバルエラー処理）
│   ├── styles/                    base.css（トークン・部品） / layout.css（画面・レスポンシブ）
│   ├── core/                      ★ Three.js 非依存（数学データ・状態管理）
│   │   ├── cubeConstants.js       頂点・辺・面の定義（唯一のデータソース）、色
│   │   ├── cubeGeometry.js        ID 正規化・位置関係・座標計算
│   │   ├── selectionState.js      選択状態（Set、複数選択、順序非依存）
│   │   ├── inputLock.js           操作ロック（理由キーごと）
│   │   └── eventBus.js            イベントバス
│   ├── three/                     3D 描画・操作
│   │   ├── cubeViewer.js          3D 機能の窓口（UI はこの API だけを使う）
│   │   ├── sceneManager.js        シーン・カメラ・レンダラー・オンデマンド描画・リサイズ
│   │   ├── cubeModel.js           数学データから 3D オブジェクトを生成（各グループに分離）
│   │   ├── cubeControls.js        OrbitControls ラッパー（回転・ズームの可否、視点リセット）
│   │   ├── cubeSelection.js       Raycaster によるポインター選択
│   │   ├── cubeHighlight.js       解説用の強調表示（選択とは別管理）
│   │   ├── animationManager.js    アニメーション共通基盤（Three.js 非依存）
│   │   └── cubeAnimations.js      演出（90°回転・面の色変化）
│   ├── ui/                        画面（homeScreen / previewScreen / helpScreen）
│   └── utils/                     DOM ヘルパー・イージング
├── tests/                         Vitest
├── index.html
├── vite.config.js
└── package.json
```

依存の向き：`ui → three/cubeViewer → three/* → core`。`core` は Three.js にも DOM にも依存しません。

## 座標系と立方体の定義

Three.js の右手系。X = 左右、Y = 上下、Z = 奥行き（+Z が手前）。中心は原点、一辺は 2。

| 頂点 | 座標 | | 頂点 | 座標 |
|---|---|---|---|---|
| A | (-1, -1, +1) | | E | (-1, +1, +1) |
| B | (+1, -1, +1) | | F | (+1, +1, +1) |
| C | (+1, -1, -1) | | G | (+1, +1, -1) |
| D | (-1, -1, -1) | | H | (-1, +1, -1) |

- 辺（12）：AB, BC, CD, DA, EF, FG, GH, HE, AE, BF, CG, DH
- 面（6）：ABCD(-Y), EFGH(+Y), ABFE(+Z), BCGF(+X), CDHG(-Z), DAEH(-X)

ID は表記ゆれを正規化して扱います（`"BA"` → 辺 `AB`、`"FGCB"` → 面 `BCGF`）。
存在しない ID（`"AC"` など）は `CubeElementError` になります。

## 自動テスト

`npm run test` で以下を検証します（6 ファイル / 55 テスト）。

| ファイル | 内容 |
|---|---|
| `cubeGeometry.test.js` | 頂点8・辺12・面6、辺が異なる2頂点を結ぶ、辺の長さ2、面が4頂点、各頂点に3辺、各辺に2面、法線、向かい合う面、ID 正規化と無効 ID |
| `selectionState.test.js` | 選択・複数選択・解除・順序非依存・無効 ID |
| `cubeHighlight.test.js` | 3D モデルの ID 付与・表示モード、強調表示の指定・解除・自動解除・無効 ID |
| `animationManager.test.js` | 再生・一時停止・スキップ・キャンセル・エラー時に操作ロックが残らないこと、90°回転デモ |
| `cubeInteraction.test.js` | Raycaster 選択（隠れた要素の除外・判定領域・回転後）、カメラ初期位置・視点リセット・操作ロック |
| `ui.test.js` | 画面の結線（ボタン → API、選択表示、演出中のボタン無効化、WebGL 非対応時の表示） |

### 手動確認項目（自動テストが難しいもの）

実機ブラウザで以下を確認してください。

- [ ] 立方体が表示され、前面・右側面・上面が見える初期角度になっている
- [ ] 頂点ラベル A〜H が正しい頂点の近くに表示される（A は手前左下、G は奥右上）
- [ ] マウスドラッグ／1本指ドラッグで回転し、離すと慣性で少し回って止まる
- [ ] ホイール／ピンチで拡大縮小でき、極端に近づく・遠ざかることはない
- [ ] 「視点リセット」でなめらかに初期の向きに戻る
- [ ] 頂点・辺・面をクリック／タップで選択するとオレンジになり、「選択中：辺 AB」のように表示される
- [ ] 回転のためのドラッグでは選択されない。ピンチ中も選択されない
- [ ] 半透明・ワイヤー表示で辺と頂点ラベルが識別できる
- [ ] 90°回転デモ中はドラッグ回転・選択ができず、終了後は元どおり操作できる
- [ ] 強調表示デモで辺 AB・面 BCGF・頂点 G が緑になり、約4秒後に元の見た目に戻る
- [ ] PC（横長）・タブレット（縦/横）・スマホ（縦/横）でレイアウトが崩れず、立方体がはみ出さない
- [ ] 画面回転・ウィンドウサイズ変更で立方体がゆがまない
- [ ] 開発者ツールのコンソールに警告・エラーが出ない
- [ ] GitHub Pages 上で CSS・JS・favicon が読み込まれる

## GitHub Pages への公開

`main` ブランチに push すると GitHub Actions（`.github/workflows/deploy.yml`）が
`npm ci → npm run test → npm run build → dist を公開` を実行します。テストかビルドが失敗すると公開されません。
Actions 画面の「Run workflow」から手動実行もできます。

### 初回の手順

1. GitHub で `cube-master` という名前のリポジトリを作成する（README などは追加しない空のリポジトリ）
2. ローカルで最初のコミットを作って push する

   ```bash
   git config user.name "あなたの名前"        # 未設定の場合のみ
   git config user.email "you@example.com"    # 未設定の場合のみ
   git add -A
   git commit -m "Phase 0: 3D cube viewer foundation"
   git remote add origin https://github.com/<ユーザー名>/cube-master.git
   git push -u origin main
   ```

3. GitHub のリポジトリで **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする
4. **Actions** タブでワークフローが成功したら `https://<ユーザー名>.github.io/cube-master/` で表示される
   （手順3より前に push してワークフローが失敗した場合は、Actions から「Re-run jobs」してください）

リポジトリ名を変える場合、ワークフローはリポジトリ名から base パスを自動設定します。
ローカルで別名用にビルドする場合は `BASE_PATH=/別名/ npm run build` を使います。
（`<ユーザー名>.github.io` という名前のリポジトリに置く場合は `BASE_PATH=/` にしてください）
Windows の Git Bash で `BASE_PATH` を指定すると、パスが Windows 形式に変換されてしまいます。
その場合は `MSYS_NO_PATHCONV=1 BASE_PATH=/別名/ npm run build` としてください。

## Phase 1 以降で使う API

### 数学データ（`src/core`）

```js
import { VERTICES, EDGES, FACES } from './core/cubeConstants.js';
import {
  resolveElement,      // 'BA' → { type: 'edge', id: 'AB' }（無効なら CubeElementError）
  getEdgesOfVertex, getFacesOfVertex, getFacesOfEdge, getEdgesOfFace, getOppositeFace,
  getVertexPosition, getEdgeEndpoints, getEdgeMidpoint, getFaceCenter, getFaceNormal,
  sortElementIds, vecDot, vecCross, vecSub,
} from './core/cubeGeometry.js';
```

正解判定は、ユーザーの選択（`viewer.getSelected()` は標準順序の正規 ID 配列）と、
`cubeGeometry` で計算した正解 ID 配列を比較するだけで行えます。

### ビューア（`createCubeViewer(container)`）

| 分類 | API |
|---|---|
| カメラ | `enableRotation()` `disableRotation()` `enableZoom()` `disableZoom()` `resetCamera({ animate })` `getCameraState()` |
| 選択 | `setSelectionMode('vertex'｜'edge'｜'face')` `setSelectionEnabled(bool)` `setMultipleSelection(bool)` `select(id)` `deselect(id)` `toggleSelection(id)` `clearSelection(type?)` `getSelected(type?)` `getSelectedByType()` `pickAt(x, y)` |
| 強調 | `highlightVertex/Edge/Face(id, { color, opacity, duration })` `highlightElements(ids, options)` `clearHighlights(ids?)` `getHighlighted()` |
| 表示 | `setFaceDisplayMode('opaque'｜'translucent'｜'wireframe')` `setLabelsVisible(bool)` |
| 演出 | `animations.play(anim, { lockInput })` → `Promise<{ status }>`、`pause()` `resume()` `skip()` `cancel()` `isPlaying()` |
| イベント | `events.on('selection:change' ｜ 'highlight:change' ｜ 'camera:change' ｜ 'animation:state' ｜ 'input-lock:change', fn)` |
| 破棄 | `dispose()`（画面離脱時に必ず呼ぶ） |

- 強調色 `color` は `'correct'`（緑・既定）・`'selected'`（オレンジ）・`'#rrggbb'`・`0xrrggbb` が使えます。
- 強調表示は選択とは独立したオーバーレイ（`highlightsGroup`）なので、解除すれば元の見た目に戻ります。
- 3D オブジェクトは `userData.elementType / elementId` に数学的 ID を持ちます（`viewer.model.getElement(id)`）。
- 新しい演出は `{ duration, start?, update(progress), cancel?, end? }` 形式のオブジェクトを作り、
  `animations.play()` に渡します。`tween()` `wait()` `sequence()` ヘルパーで組み立てられます。
  再生中はユーザー操作が自動でロックされ、完了・スキップ・キャンセル・エラーのどれで終わっても解除されます。
- 問題ごとの操作ロックは `viewer.inputLock.lock('question')` / `unlock('question')` のように理由キーを分けて使えます。

## 今後の拡張方針

- **Phase 1（位置関係）**：`cubeGeometry` に平行・垂直・ねじれの判定関数を追加し、問題画面（`src/ui/`）と
  問題データ（例：`src/questions/`）を新設する。既存の頂点・辺・面の定義と 3D 描画は変更せずに使う。
- トップ画面のメニューは `homeScreen.js` の `MENU_ITEMS` の `enabled` を true にして画面を `main.js` の `ROUTES` に追加する。
- 展開図・切断などで新しい 3D オブジェクトが必要になったら、`cubeModel` とは別のモジュールで生成し、
  `model.root` か専用グループに追加する（数学データは `core` に置く）。
- 段位認定・タイマー・成績管理・効果音などは後続 Phase で実装する（Phase 0 では未実装）。
