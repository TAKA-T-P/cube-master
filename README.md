# CUBE MASTER（仮）

立方体をテーマにした算数・数学の学習 Web アプリです（対象：小学4年生〜中学3年生）。
立方体の展開図・切断・位置関係・サイコロの回転・体積などの空間図形問題を扱う予定です。

公開ページ：https://taka-t-p.github.io/cube-master/

**現在は Phase 1（Ver.0.2.0）**：Phase 0 の 3D 立方体ビューアに加えて、
「位置関係」カテゴリのトレーニング（15 種類の問題テンプレート）と、カテゴリ共通の問題エンジンを実装しています。
段位認定・タイマー・成績の保存・効果音はまだありません。

- 技術：HTML / CSS / JavaScript（ES Modules）、Vite、Three.js（OrbitControls・Raycaster・CSS2DRenderer）、Vitest
- サーバー・データベース不要の静的サイト（GitHub Pages で公開）
- UI フレームワーク・TypeScript は不使用。外部 CDN にも依存しません

## 動作環境

- Node.js 22.12 以上（推奨：24 LTS。`.nvmrc` 参照）
- WebGL2 に対応したブラウザ（Chrome / Edge / Safari / Firefox の最新版）
  - WebGL2 が使えない端末でも、トレーニングは問題文と選択肢だけで回答できます

## 起動方法

```bash
npm install        # 依存関係のインストール（CI では npm ci）
npm run dev        # 開発サーバー起動 → http://localhost:5173/
npm run test       # 自動テスト（Vitest）
npm run build      # 本番ビルド（dist/ に出力。base は /cube-master/）
npm run preview    # ビルド結果の確認 → http://localhost:4173/cube-master/
```

## 画面と操作

```text
トップ ─┬─ 3D立方体をためす（Phase 0 のプレビュー）
        ├─ トレーニング → カテゴリ選択 → 設定（難易度・問題数）→ 問題 ⇄ 解答・解説 → 結果
        ├─ 段位認定（準備中）
        └─ あそびかた
```

### トレーニング

1. **カテゴリ選択**：10 カテゴリを表示。Phase 1 で遊べるのは「位置関係」だけ（ほかは準備中）
2. **設定**：難易度（★1 きほん／★2 標準／★3 チャレンジ／すべて）と問題数（5／10／20／エンドレス）
3. **問題**：問題文を読み、選択肢から答えて「回答する」
   - 問題の基準になる辺・面は **オレンジ** で表示され、正解表示中も消えません
   - 立方体は自由に回せます（面は半透明で表示。「面を不透明に」で切り替え）。回答は選択肢ボタンで行います
   - 「すべて選ぼう」の問題はチェック形式、「1つ選ぼう」の問題はラジオ形式
4. **解答・解説**：「正解！」「おしい！」「不正解」と解説を表示
   - 3D では、誤って選んだ要素が **赤**、正解の要素が **緑** で1つずつ光ります
   - 「もう一度見る」でリプレイ、「スキップ」で演出を飛ばせます
   - 「おしい！」は正解・不正解のちがいが1つだけのとき。正答率には完全正解だけを数えます
5. **結果**：正解数・出題数・正答率・難易度。「もう一度挑戦」「設定を変更」「カテゴリ選択に戻る」
   - 「やめる」（エンドレスは「終了する」）は確認のうえ、回答済みの分の結果を表示します

### 3D 立方体の操作

| 操作 | パソコン | スマホ・タブレット |
|---|---|---|
| 回転（カメラが立方体のまわりを回る） | ドラッグ | 1本指でなぞる |
| 拡大・縮小 | マウスホイール | ピンチ |
| 頂点・辺・面をえらぶ（3D プレビューのみ） | クリック（もう一度で解除） | タップ（もう一度で解除） |
| はじめの向きに戻す | 「視点リセット」 | 「視点リセット」 |

3D プレビュー画面の操作パネル：選択（頂点／辺／面、1つだけ／複数、クリア）、表示（不透明／半透明／ワイヤー、
頂点ラベル、自由回転、視点リセット）、デモ（90°回転・面の色変化・強調表示）、開発者向け情報。

- 面が「不透明」のときは、裏に隠れた頂点・辺は選べません。「半透明」なら選べます。
- 「ワイヤー」のときは面が非表示になり、面は選べません（選択中の面だけは表示されます）。

### ブラウザのコンソールから API を試す

3D プレビュー画面・問題画面を開いている間は `window.cubeMaster.viewer` からビューア API を呼べます
（問題画面では `window.cubeMaster.session` で進行状態も見られます）。

```js
const v = window.cubeMaster.viewer;
v.highlightEdge('AB');                                    // 辺 AB を緑で強調
v.highlightElements(['AB'], { layer: 'reference' });     // 基準要素としてオレンジで強調
await v.playAnswerReveal({ wrong: ['AE'], correct: ['CD', 'EF', 'GH'] });
v.clearHighlightLayer('correct');
v.setCameraPreset([-4, 3, -5]);                           // 視点を変えて、その向きを「視点リセット」の戻り先にする
```

## 位置関係の問題テンプレート

正解は手で書かず、座標とベクトルから計算します（`src/core/cubeRelations.js`）。基準の辺・面は毎回ランダムに変わります。

| ID | 難易度 | 内容 | 例 | 正解数 | 選択肢 |
|---|---|---|---|---|---|
| P01 | ★1 | 辺と平行な辺 | 辺ABと平行な辺をすべて | 3 | 5 |
| P02 | ★1 | 辺と交わる辺 | 辺ABと交わる辺をすべて | 4 | 6 |
| P03 | ★1 | 面と平行な面 | 面ABCDと平行な面は？ | 1 | 4 |
| P04 | ★1 | 面と垂直な面 | 面ABCDと垂直な面をすべて | 4 | 5 |
| P05 | ★1 | 辺を含む面 | 辺ABを含む面をすべて | 2 | 4 |
| P06 | ★2 | 辺と平行な面 | 辺ABと平行な面をすべて | 2 | 4 |
| P07 | ★2 | 辺と垂直な面 | 辺ABと垂直な面をすべて | 2 | 4 |
| P08 | ★2 | ねじれの位置にある辺 | 辺ABとねじれの位置にある辺をすべて | 4 | 6 |
| P09 | ★2 | 面に垂直な辺 | 面ABCDに垂直な辺をすべて | 4 | 6 |
| P10 | ★2 | 2本の辺の位置関係 | 辺ABと辺CGの位置関係は？ | 1 | 3（平行／交わる／ねじれの位置） |
| P11 | ★3 | 2面に共通して垂直な辺 | 面ABCDと面ABFEの両方に垂直な辺はある？ | 1 | 2（ある／ない） |
| P12 | ★3 | 2本の辺の両方と平行な面 | 辺ABと辺CDの両方に平行な面をすべて | 1 | 5（「あてはまる面はない」を含む） |
| P13 | ★3 | 交わらず平行でもない辺 | 辺ABと交わらず、平行でもない辺をすべて | 4 | 6 |
| P14 | ★3 | 2つの条件を満たす辺 | 面ABCDに垂直で、辺EFと交わる辺をすべて | 2 | 6 |
| P15 | ★3 | 辺と面の関係の説明 | 辺ABと面EFGHの位置関係で正しい説明は？ | 1 | 4（文章） |

用語の定義（`cubeRelations.js` の冒頭にも記載）：

- 辺と辺が「平行」：自分自身は含めない。「交わる」：線分として共有点をもつ（立方体では共通の頂点）。
  `doEdgesIntersect(a, b, { as: 'line' })` で、延長した直線としての交わりも判定できる
- 「垂直」（辺と辺）：交わって直角。ねじれの位置で直角の組は含めない
- 「ねじれの位置」：同じ平面上にない2直線
- 辺と面が「平行」：辺を含む面は平行に数えない
- 内積・外積の比較には許容誤差 `EPSILON = 1e-9` を使う

出題のバランス：

- 「すべて」では ★1〜★3 を均等に出題。出題回数の少ないテンプレートを優先し、同じテンプレートは3問以上連続しない
- 重複判定は「テンプレート ID + 基準要素」（例 `P01:AB`）。直前の問題と同じ基準要素は避ける
- 答えの種類が偏りやすいテンプレート（P10・P11・P12・P15）は、答えの種類ごとに均等に出題
- 有限のパターンを一巡したら再出題を許可（エンドレス）

## フォルダ構成

```text
cube-master/
├── .github/workflows/deploy.yml   GitHub Pages 自動デプロイ（テスト → ビルド → 公開）
├── public/favicon.svg
├── src/
│   ├── main.js                    エントリー（ハッシュルーティング・グローバルエラー処理）
│   ├── styles/                    base.css / layout.css / training.css
│   ├── core/                      ★ Three.js・DOM 非依存（数学・状態・問題エンジン）
│   │   ├── cubeConstants.js       頂点・辺・面の定義（唯一のデータソース）、色
│   │   ├── cubeGeometry.js        ID 正規化・座標計算
│   │   ├── cubeRelations.js       平行・垂直・交わる・ねじれ・包含の判定と一覧
│   │   ├── questionSchema.js      問題データの共通スキーマとバリデーション
│   │   ├── questionEngine.js      QuestionPicker（抽出・重複管理・シャッフル）/ TrainingSession（進行）
│   │   ├── answerValidator.js     正誤判定（集合比較・差分）
│   │   ├── answerSelection.js     回答の選択状態（UI から独立）
│   │   ├── selectionState.js      3D の頂点・辺・面の選択状態
│   │   ├── inputLock.js           操作ロック（理由キーごと）
│   │   └── eventBus.js            イベントバス
│   ├── questions/                 問題データ（カテゴリごと）
│   │   ├── questionRegistry.js    カテゴリ一覧（10）・難易度・問題数の定義
│   │   ├── questionUtils.js       表示名・選択肢生成・初期視点の計算
│   │   └── position/              位置関係：positionGenerators（P01〜P15）/ positionRelations / positionExplanations
│   ├── three/                     3D 描画・操作
│   │   ├── cubeViewer.js          3D 機能の窓口（UI はこの API だけを使う）
│   │   ├── sceneManager.js / cubeModel.js / cubeControls.js / cubeSelection.js
│   │   ├── cubeHighlight.js       強調表示（レイヤー：reference / default / wrong / correct）
│   │   ├── animationManager.js    アニメーション共通基盤
│   │   └── cubeAnimations.js      演出（90°回転・面の色変化・正解演出）
│   ├── ui/                        画面
│   │   ├── homeScreen / previewScreen / helpScreen
│   │   ├── categoryScreen / trainingSetupScreen / questionScreen / trainingResultScreen
│   │   ├── trainingStore.js       トレーニングの進行状態（メモリのみ）
│   │   └── components.js          ボタン・切替・確認ダイアログ
│   └── utils/                     DOM ヘルパー・イージング・乱数（シード指定可）
├── tests/                         Vitest
└── index.html / vite.config.js / package.json
```

依存の向き：`ui → (questions, three/cubeViewer) → core`。`core` と `questions` は Three.js にも DOM にも依存しません。

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

`npm run test` で 11 ファイル / 219 テストを実行します（Phase 0 の 55 テストを含む）。

| ファイル | 内容 |
|---|---|
| `cubeGeometry.test.js` | 頂点8・辺12・面6、辺の長さ、法線、向かい合う面、ID 正規化 |
| `cubeRelations.test.js` | 全12辺の平行3・交わる4・ねじれ4、全6面の平行1・垂直4、辺と面の包含2・平行2・垂直2、面に垂直な辺4、対称性、自分自身、線分と直線の区別、無効 ID |
| `positionQuestions.test.js` | P01〜P15 の全基準で生成・スキーマ適合、正解がすべて選択肢に含まれる、重複なし、正解数、問題文と基準要素の一致、正解が数学的関係と一致 |
| `questionEngine.test.js` | 難易度別抽出、「すべて」の均等出題、同じテンプレートが3連続しない、一巡後の再出題、選択肢シャッフル、進行・集計・エンドレス・途中終了 |
| `answerValidator.test.js` | 単一・複数・順序違い・回答不足・誤答混入・未選択・重複回答、回答の選択状態とロック |
| `selectionState.test.js` | 3D の選択・複数選択・解除・無効 ID |
| `cubeHighlight.test.js` | 強調表示の指定・解除、レイヤーと優先順位、正解演出（リプレイ・スキップ・操作ロック解除） |
| `animationManager.test.js` | 再生・一時停止・スキップ・キャンセル・エラー時に操作ロックが残らない、90°回転デモ |
| `cubeInteraction.test.js` | Raycaster 選択、カメラ初期位置・視点リセット・操作ロック |
| `ui.test.js` | トップ・ヘルプ・3D プレビュー画面の結線 |
| `trainingUi.test.js` | カテゴリ選択・設定・問題表示・回答確定とロック・正誤表示・リプレイ・次の問題・結果・途中終了・エンドレス・画面の開き直し |

### 手動確認項目（自動テストが難しいもの）

実機ブラウザで以下を確認してください。

- [ ] 3D プレビュー：立方体・ラベル A〜H・回転・ズーム・視点リセット・選択・半透明/ワイヤー・デモが Phase 0 と同じく動く
- [ ] トレーニング：基準の辺・面がオレンジで表示され、別の問題では基準の位置に合わせて視点が変わる
- [ ] 回答後、誤選択が赤 → 正解が緑で1つずつ光り、基準のオレンジは残る。演出中は回転できず、終わると回せる
- [ ] 「もう一度見る」「スキップ」が動作する
- [ ] スマホ縦：問題文 → 3D → 選択肢 → 回答ボタンの順に並び、選択肢が押しやすい
- [ ] PC・タブレット横：3D が左、問題文と回答エリアが右に並ぶ。長い文章の選択肢（P15）は1列になる
- [ ] 「やめる」の確認ダイアログ、結果画面の各ボタン
- [ ] 開発者ツールのコンソールに警告・エラーが出ない

## GitHub Pages への公開

`main` ブランチに push すると GitHub Actions（`.github/workflows/deploy.yml`）が
`npm ci → npm run test → npm run build → dist を公開` を実行します。テストかビルドが失敗すると公開されません。
Actions 画面の「Run workflow」から手動実行もできます。

初回のみ、GitHub のリポジトリで **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にしてください（設定済み）。

リポジトリ名を変える場合、ワークフローはリポジトリ名から base パスを自動設定します。
ローカルで別名用にビルドする場合は `BASE_PATH=/別名/ npm run build` を使います
（Windows の Git Bash では `MSYS_NO_PATHCONV=1 BASE_PATH=/別名/ npm run build`）。

## 後続 Phase で使う API

### 問題データの形（カテゴリ共通。`src/core/questionSchema.js`）

```js
{
  id, templateId: 'P01', key: 'P01:AB', category: 'position', difficulty: 1, type: 'multiple',
  question: '辺ABと平行な辺をすべて選びなさい。',
  scene: { model: 'cube', referenceElements: ['AB'], cameraPreset: 'default' },
  choices: [{ id: 'CD', label: '辺CD', elementId: 'CD' }, { id: 'none', label: 'あてはまる面はない', fixed: true }],
  correctAnswers: ['CD', 'EF', 'GH'],
  explanation: { text: '…', highlightElements: ['CD', 'EF', 'GH'], animation: 'highlightElements' },
}
```

- 選択肢の `id` は任意の文字列（サイコロの目・形の名前・分数などでもよい）。正誤は選択肢 ID の集合で比較する
- `elementId` は 3D 上で対応する要素（誤選択を赤く表示するのに使う）。文章の選択肢では省略
- `fixed: true` の選択肢はシャッフルせず末尾に置く

### 問題テンプレート（`src/questions/<category>/`）

```js
{ id: 'P01', difficulty: 1, title: '…',
  bases: () => [{ key: 'AB', refs: ['AB'], group?: '…', ...params }],  // 出題できる基準の一覧
  build: (base, rng) => 問題オブジェクト（id 以外） }
```

### 問題エンジン（`src/core/questionEngine.js`）

```js
const session = new TrainingSession({ category, templates, difficulty: 1|2|3|'all', questionLimit: 10|'endless', rng });
const q = session.nextQuestion();      // 問題（終了していれば null）
const result = session.submit(['CD', 'EF', 'GH']); // { status: 'correct'|'partial'|'incorrect', hits, missing, wrong }
session.hasNextQuestion(); session.finish(); session.getSummary(); // { answeredCount, correctCount, accuracy, history }
```

### 数学（`src/core/cubeRelations.js`）

`areEdgesParallel` `doEdgesIntersect(a, b, { as })` `areEdgesPerpendicular` `areEdgesSkew` `classifyEdgePair`
`areFacesParallel` `areFacesPerpendicular` `isEdgeContainedInFace` `isEdgeParallelToFace` `isEdgePerpendicularToFace` `classifyEdgeFace`
`getCommonVertex` `getCommonEdge` `getEdgeFaceMeetingVertex` と、それぞれの一覧取得（`getParallelEdges(edge)` など）。

### ビューア（`createCubeViewer(container)`）

| 分類 | API |
|---|---|
| カメラ | `enableRotation()` `disableRotation()` `enableZoom()` `disableZoom()` `resetCamera({ animate })` `setCameraPreset(direction, { animate })` `getCameraState()` |
| 選択（3D） | `setSelectionMode()` `setSelectionEnabled(bool)` `setMultipleSelection(bool)` `select(id)` `toggleSelection(id)` `clearSelection()` `getSelected()` `pickAt(x, y)` |
| 強調 | `highlightVertex/Edge/Face(id, { color, opacity, duration, layer })` `highlightElements(ids, options)` `clearHighlights(ids?, { layer })` `clearHighlightLayer(layer)` `getHighlighted()` |
| 演出 | `playAnswerReveal({ wrong, correct })` `animations.play/pause/resume/skip/cancel/isPlaying` |
| 表示 | `setFaceDisplayMode('opaque'｜'translucent'｜'wireframe')` `setLabelsVisible(bool)` |
| イベント | `events.on('selection:change'｜'highlight:change'｜'camera:change'｜'animation:state'｜'input-lock:change', fn)` |
| 破棄 | `dispose()` |

強調のレイヤーは `reference`（基準・オレンジ）`default`（解説・緑）`wrong`（誤選択・赤）`correct`（正解・緑）。
同じ要素が複数レイヤーにあるときは **correct > wrong > default > reference** の1つだけを表示し、上位を消すと下位の表示に戻ります。
3D プレビューの選択色（オレンジ `#ff8c1a`）は選択状態の表示で、強調レイヤーとは別管理です。

## 今後の拡張方針

- **新しいカテゴリ**：`src/questions/<category>/` にテンプレートを作り、`questionRegistry.js` の `CATEGORIES` で
  `templates` を設定して `enabled: true` にする。問題画面・エンジン・判定はそのまま使える
- **3D をタップして回答**：`AnswerSelection.toggle(id)` を `viewer.events.on('selection:change')` から呼べば、
  選択肢ボタンと同じ回答状態を共有できる（選択肢 ID に要素 ID を使う問題）
- **展開図・切断**など新しい 3D オブジェクトが必要になったら、`cubeModel` とは別のモジュールで生成し、
  数学データは `core` に置く。問題データの `scene.model` に新しいモデル名を追加する
- 段位認定・90秒タイマー・成績の保存・効果音は後続 Phase で実装する
