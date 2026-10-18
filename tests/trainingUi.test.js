// @vitest-environment jsdom
// トレーニング画面の結線テスト。3D ビューアはモックに置き換える（WebGL 描画は手動確認項目）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../src/core/eventBus.js';
import { createRng } from '../src/utils/random.js';

vi.mock('../src/ui/answerSound.js', () => ({ playAnswerSound: vi.fn(), playFinishSound: vi.fn() }));
vi.mock('../src/three/cubeViewer.js', () => ({
  FACE_DISPLAY_MODES: { OPAQUE: 'opaque', TRANSLUCENT: 'translucent', WIREFRAME: 'wireframe' },
  createCubeViewer: () => globalThis.__createFakeViewer(),
}));

const { mountCategoryScreen } = await import('../src/ui/categoryScreen.js');
const { mountTrainingSetupScreen } = await import('../src/ui/trainingSetupScreen.js');
const { mountQuestionScreen } = await import('../src/ui/questionScreen.js');
const { mountTrainingResultScreen } = await import('../src/ui/trainingResultScreen.js');
const store = await import('../src/ui/trainingStore.js');
const { answerSplash } = await import('../src/ui/answerSplash.js');
const sounds = await import('../src/ui/answerSound.js');
const learning = await import('../src/ui/learningStore.js');
const { mountReviewResultScreen } = await import('../src/ui/reviewScreen.js');
const { mountLearningHistoryScreen } = await import('../src/ui/learningHistoryScreen.js');
const { createMemoryBackend } = await import('../src/core/storageManager.js');

// 回答直後の「○△×」は、専用のテスト以外では出さずにすぐ結果を表示する
const SPLASH_DURATION = answerSplash.duration;
answerSplash.duration = 0;

let viewer;
globalThis.__createFakeViewer = () => {
  viewer = {
    events: createEventBus(),
    animations: { cancel: vi.fn(), skip: vi.fn() },
    setSelectionEnabled: vi.fn(),
    setFaceDisplayMode: vi.fn(),
    clearHighlights: vi.fn(),
    clearSelection: vi.fn(),
    highlightElements: vi.fn(),
    setCameraPreset: vi.fn(),
    resetCamera: vi.fn(),
    playAnswerReveal: vi.fn(),
    dispose: vi.fn(),
    // Phase 2
    setFaceDecorations: vi.fn(),
    setCubeOrientation: vi.fn(),
    setLabelsVisible: vi.fn(),
    enableRotation: vi.fn(),
    disableRotation: vi.fn(),
    enableZoom: vi.fn(),
    disableZoom: vi.fn(),
    playQuestionReveal: vi.fn(),
    setBlocks: vi.fn(),
    setNet: vi.fn(),
    getNetFold: vi.fn(() => 1),
    playNetFold: vi.fn(),
    // Phase 4
    setSubcubes: vi.fn(),
    getSubcubeSeparation: vi.fn(() => 1),
    playSubcubeSeparation: vi.fn(),
  };
  return viewer;
};

const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const choiceButtons = (root) => [...root.querySelectorAll('.choice')];
// 復習中は復習の問題、そうでなければトレーニングの問題
const currentQuestion = () => (store.getReview()?.session ?? store.getSession()).state.currentQuestion;

/** 現在の問題に答える（correct=false なら誤答を1つ選ぶ） */
function answer(root, { correct = true } = {}) {
  const q = currentQuestion();
  const ids = correct ? q.correctAnswers : [q.choices.find((c) => !q.correctAnswers.includes(c.id)).id];
  for (const id of ids) root.querySelector(`[data-choice="${id}"]`).click();
  buttonByText(root, '回答する').click();
  return q;
}

describe('カテゴリ選択・設定画面', () => {
  let container;
  beforeEach(() => {
    store.resetTrainingStore();
    container = document.createElement('main');
  });

  it('10カテゴリを表示し、すべて選べる', () => {
    const navigate = vi.fn();
    mountCategoryScreen(container, { navigate });
    const cards = container.querySelectorAll('.category-card');
    expect(cards).toHaveLength(10);
    const position = container.querySelector('[data-category="position"]');
    // ボタンは名前だけ（説明・対象学年は書かない）
    expect(position.querySelector('.category-card__name').textContent).toBe('位置関係');
    expect(position.textContent).toBe('⑦位置関係');
    expect(position.textContent).not.toContain('小学6年生～中学1年生');
    expect([...cards].filter((c) => !c.disabled).map((c) => c.dataset.category)).toEqual(['paintedCube', 'dice', 'projection', 'netPuzzle', 'netMapping', 'cubeCutting', 'position', 'inscribedSolid', 'cubeGeometryChallenge', 'surfacePath']);
    expect([...cards].map((c) => c.querySelector('.category-card__num').textContent).join('')).toBe('①②③④⑤⑥⑦⑧⑨⑩');
    expect(container.querySelectorAll('.category-card .badge')).toHaveLength(0); // 「準備中」はない
    // はじめは下の説明と「次へ」を出さない
    const detail = container.querySelector('.category-detail');
    expect(detail.hidden).toBe(true);
    // 押すと下に説明・対象学年と「次へ」が出る（まだ移動しない）
    position.click();
    expect(navigate).not.toHaveBeenCalled();
    expect(detail.hidden).toBe(false);
    expect(position.getAttribute('aria-pressed')).toBe('true');
    expect(detail.textContent).toContain('平行・垂直・ねじれ');
    expect(detail.textContent).not.toContain('小学6年生～中学1年生'); // 対象学年は出さない
    expect(detail.textContent).not.toContain('対象：');
    // 説明と「次へ」は、スクロールする部分の外（画面下に固定）
    expect(container.querySelector('.category-scroll').contains(detail)).toBe(false);
    buttonByText(container, '次へ').click();
    container.querySelector('[data-category="dice"]').click();
    expect(position.getAttribute('aria-pressed')).toBe('false');
    expect(detail.querySelector('.category-detail__name').textContent).toBe('② サイコロ・回転');
    buttonByText(container, '次へ').click();
    container.querySelector('[data-category="projection"]').click();
    buttonByText(container, '次へ').click();
    expect(navigate.mock.calls).toEqual([
      ['setup', { category: 'position' }],
      ['setup', { category: 'dice' }],
      ['setup', { category: 'projection' }],
    ]);
  });

  it('設定画面から戻ると、前に選んだカテゴリが選ばれた状態', () => {
    store.startTraining({ category: 'dice' });
    mountCategoryScreen(container, { navigate: vi.fn() });
    expect(container.querySelector('[data-category="dice"]').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.category-detail').hidden).toBe(false);
  });

  it('難易度・問題数を選んで開始する（初期値は 基本・5問。問題数はスライダーで1〜20問）', () => {
    const navigate = vi.fn();
    mountTrainingSetupScreen(container, { navigate, params: { category: 'position' } });
    const pressed = [...container.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent);
    expect(pressed).toEqual(['基本', '問題数を選ぶ']);
    expect([...container.querySelectorAll('.segmented__item')].map((b) => b.textContent)).toEqual(['基本', '標準', '応用', 'すべて', '問題数を選ぶ', '1分チャレンジ']);
    expect(container.textContent).not.toContain('対象：');
    // 難易度ごとの問題の種類は画面に出さず、「難易度」の右の「？」でポップアップ
    expect(container.textContent).not.toContain('基本：辺と辺');
    const q = container.querySelector('.field__label .help-q');
    expect(q.parentElement.textContent).toContain('難易度');
    q.click();
    const dialog = document.querySelector('.dialog');
    expect([...dialog.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['基本：辺と辺・面と面の平行・垂直など', '標準：辺と面の関係・ねじれの位置', '応用：2つの条件を組み合わせた問題']);
    buttonByText(dialog, '閉じる').click();
    expect(document.querySelector('.dialog')).toBeNull();
    const range = container.querySelector('input[type="range"]');
    expect([range.min, range.max, range.value]).toEqual(['1', '20', '5']);
    expect(container.querySelector('.slider__value').textContent).toBe('5問');
    // 説明は「スタート」のすぐ下（出題のしかたに合わせて切りかわる）
    const startBtn = buttonByText(container, 'スタート');
    const visibleNotes = () => [...container.querySelectorAll('.setup-note--after-start')].filter((n) => !n.hidden);
    expect(visibleNotes()).toHaveLength(1);
    expect(startBtn.nextElementSibling).toBe(visibleNotes()[0]);
    expect(visibleNotes()[0].textContent).toContain('タイマーはありません');
    buttonByText(container, '1分チャレンジ').click();
    expect(visibleNotes()[0].textContent).toContain('10秒へります');
    expect(startBtn.compareDocumentPosition(visibleNotes()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    buttonByText(container, '問題数を選ぶ').click();
    buttonByText(container, '標準').click();
    range.value = '13';
    range.dispatchEvent(new Event('input'));
    expect(container.querySelector('.slider__value').textContent).toBe('13問');
    buttonByText(container, 'スタート').click();
    expect(store.getSettings()).toMatchObject({ category: 'position', difficulty: 2, questionLimit: 13 });
    expect(navigate).toHaveBeenCalledWith('question');
  });

  it('遊べないカテゴリはカテゴリ選択に戻す', () => {
    const navigate = vi.fn();
    mountTrainingSetupScreen(container, { navigate, params: { category: 'cutting' } });
    expect(navigate).toHaveBeenCalledWith('categories');
  });
});

describe('問題画面', () => {
  let container;
  let navigate;
  let screen;

  const start = (settings) => {
    store.startTraining({ category: 'position', ...settings }, { rng: createRng(42) });
    screen = mountQuestionScreen(container, { navigate });
  };

  beforeEach(() => {
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
    navigate = vi.fn();
  });

  afterEach(() => {
    screen?.unmount();
    container.remove();
    document.querySelectorAll('.dialog-backdrop').forEach((d) => d.remove());
  });

  it('問題番号・難易度・問題文・選択肢を表示し、基準要素をオレンジで強調する', () => {
    start({ difficulty: 1, questionLimit: 5 });
    const q = currentQuestion();
    expect(container.querySelector('.quiz-progress').textContent).toBe('第1問 / 5問');
    expect(container.textContent).toContain('基本');
    expect(container.querySelector('.quiz-text').textContent).toBe(q.question);
    expect(choiceButtons(container).map((b) => b.dataset.choice)).toEqual(q.choices.map((c) => c.id));
    expect(viewer.setSelectionEnabled).toHaveBeenCalledWith(false);
    expect(viewer.highlightElements).toHaveBeenLastCalledWith(q.scene.referenceElements, { layer: 'reference' });
    expect(viewer.setCameraPreset).toHaveBeenLastCalledWith(q.scene.cameraPreset, { animate: false });
  });

  it('未選択では回答できず、回答後は選択を変更できない', () => {
    start({ difficulty: 2, questionLimit: 5 });
    const submit = buttonByText(container, '回答する');
    expect(submit.disabled).toBe(true);
    const q = answer(container);
    expect(store.getSession().state.answerLocked).toBe(true);
    for (const b of choiceButtons(container)) expect(b.disabled).toBe(true);
    // ロック後にクリックしても回答は変わらない
    const other = q.choices.find((c) => !q.correctAnswers.includes(c.id));
    container.querySelector(`[data-choice="${other.id}"]`).click();
    expect(store.getSession().state.selectedAnswers.sort()).toEqual([...q.correctAnswers].sort());
  });

  it('単一回答はラジオ形式・複数回答はチェック形式', () => {
    start({ difficulty: 1, questionLimit: 20 });
    // ★1 には単一(P03)と複数の問題がある。いくつか進めて両方を確認する
    const seen = new Set();
    for (let i = 0; i < 10 && seen.size < 2; i++) {
      const q = currentQuestion();
      const role = choiceButtons(container)[0].getAttribute('role');
      expect(role).toBe(q.type === 'single' ? 'radio' : 'checkbox');
      seen.add(q.type);
      if (q.type === 'single') {
        const [a, b] = q.choices;
        container.querySelector(`[data-choice="${a.id}"]`).click();
        container.querySelector(`[data-choice="${b.id}"]`).click();
        expect(choiceButtons(container).filter((x) => x.getAttribute('aria-checked') === 'true')).toHaveLength(1);
      }
      answer(container);
      buttonByText(container, '次の問題へ').click();
    }
    expect(seen).toEqual(new Set(['single', 'multiple']));
  });

  it('正解すると「正解！」・解説を表示し、正解箇所を3Dで演出する', () => {
    start({ difficulty: 1, questionLimit: 5 });
    const q = answer(container);
    expect(container.querySelector('.feedback__title').textContent).toBe('正解！');
    expect(container.querySelector('.feedback__explanation').textContent).toBe(q.explanation.text);
    expect(viewer.playAnswerReveal).toHaveBeenCalledWith({ wrong: [], correct: q.explanation.highlightElements });
    expect(container.querySelector('.quiz-score').textContent).toBe('正解 1');
    for (const id of q.correctAnswers) expect(container.querySelector(`[data-choice="${id}"]`).classList).toContain('choice--correct');
  });

  it('不正解では誤選択を赤・正解を緑で演出し、正解を文章でも示す', () => {
    start({ difficulty: 1, questionLimit: 5 });
    const q = currentQuestion();
    const wrong = q.choices.find((c) => !q.correctAnswers.includes(c.id));
    answer(container, { correct: false });
    expect(container.querySelector('.feedback__title').textContent).toBe('不正解');
    expect(container.querySelector('.feedback__detail').textContent).toContain('正解は');
    expect(viewer.playAnswerReveal).toHaveBeenCalledWith({ wrong: [wrong.elementId], correct: q.explanation.highlightElements });
    expect(container.querySelector(`[data-choice="${wrong.id}"]`).classList).toContain('choice--wrong');
    expect(container.querySelector('.quiz-score').textContent).toBe('正解 0');
  });

  it('「もう一度見る」でリプレイする。「スキップ」ボタンはない。頂点の記号（A〜H）が出る問題では「図のみ表示」を出す', () => {
    start({ difficulty: 1, questionLimit: 5 });
    answer(container);
    expect(buttonByText(container, 'スキップ')).toBeUndefined();
    expect(buttonByText(container, '図のみ表示').hidden).toBe(false);
    buttonByText(container, 'もう一度見る').click();
    expect(viewer.playAnswerReveal).toHaveBeenCalledTimes(2);
  });

  it('次の問題へ進むと、演出を止めて強調・選択をクリアし、新しい問題を表示する', () => {
    start({ difficulty: 'all', questionLimit: 5 });
    const first = answer(container);
    viewer.clearHighlights.mockClear();
    buttonByText(container, '次の問題へ').click();
    const second = currentQuestion();
    expect(second.id).not.toBe(first.id);
    expect(viewer.animations.cancel).toHaveBeenCalled();
    expect(viewer.clearHighlights).toHaveBeenCalled();
    expect(viewer.clearSelection).toHaveBeenCalled();
    expect(viewer.highlightElements).toHaveBeenLastCalledWith(second.scene.referenceElements, { layer: 'reference' });
    expect(container.querySelector('.quiz-progress').textContent).toBe('第2問 / 5問');
    expect(container.querySelector('.feedback').hidden).toBe(true);
    expect(buttonByText(container, '回答する').disabled).toBe(true);
  });

  it('最後の問題のあとは「結果を見る」で結果画面へ', () => {
    start({ difficulty: 'all', questionLimit: 5 });
    for (let i = 0; i < 5; i++) {
      answer(container, { correct: i < 4 });
      const next = buttonByText(container, i < 4 ? '次の問題へ' : '結果を見る');
      expect(next).toBeTruthy();
      next.click();
    }
    expect(navigate).toHaveBeenCalledWith('result');
    expect(store.getSummary()).toMatchObject({ answeredCount: 5, correctCount: 4 });
  });

  it('「やめる」は確認してから、回答済み分の結果を表示する', async () => {
    start({ difficulty: 'all', questionLimit: 10 });
    answer(container);
    buttonByText(container, '次の問題へ').click();
    buttonByText(container, 'やめる').click();
    // 「つづける」なら何もしない
    buttonByText(document.body, 'つづける').click();
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();

    buttonByText(container, 'やめる').click();
    buttonByText(document.querySelector('.dialog'), 'やめる').click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('result'));
    expect(store.getSummary()).toMatchObject({ answeredCount: 1, correctCount: 1 });
  });

  it('エンドレスは問題数を表示せず、「終了する」で結果へ', async () => {
    start({ difficulty: 3, questionLimit: 'endless' });
    expect(container.querySelector('.quiz-progress').textContent).toBe('第1問');
    for (let i = 0; i < 25; i++) {
      answer(container);
      buttonByText(container, '次の問題へ').click();
    }
    expect(container.querySelector('.quiz-progress').textContent).toBe('第26問');
    buttonByText(container, '終了する').click();
    buttonByText(document.querySelector('.dialog'), '終了する').click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('result'));
    expect(store.getSummary()).toMatchObject({ answeredCount: 25, correctCount: 25, questionLimit: 'endless' });
  });

  it('画面を開き直しても、同じ問題・回答結果から続けられる', () => {
    start({ difficulty: 1, questionLimit: 5 });
    const q = answer(container);
    screen.unmount();
    expect(viewer.dispose).toHaveBeenCalled();
    container.replaceChildren();
    screen = mountQuestionScreen(container, { navigate });
    expect(container.querySelector('.quiz-text').textContent).toBe(q.question);
    expect(container.querySelector('.feedback').hidden).toBe(false);
    expect(viewer.animations.skip).toHaveBeenCalled(); // 演出は最終状態で表示
    expect(store.getSession().state.answeredCount).toBe(1);
  });

  it('トレーニングを始めずに開くとカテゴリ選択へ戻す', () => {
    screen = mountQuestionScreen(container, { navigate });
    expect(navigate).toHaveBeenCalledWith('categories');
  });
});

describe('結果画面', () => {
  let container;
  beforeEach(() => {
    store.resetTrainingStore();
    container = document.createElement('main');
  });

  function finishWith(correctFlags, settings = { difficulty: 2, questionLimit: 5 }) {
    const session = store.startTraining({ category: 'position', ...settings }, { rng: createRng(9) });
    for (const ok of correctFlags) {
      const q = session.nextQuestion();
      session.submit(ok ? q.correctAnswers : [q.choices.find((c) => !q.correctAnswers.includes(c.id)).id]);
    }
    store.finishTraining();
  }

  it('正解数・出題数・正答率・難易度を表示する', () => {
    finishWith([true, true, false, true, false]);
    mountTrainingResultScreen(container, { navigate: vi.fn() });
    expect(container.querySelector('[data-testid="correct-count"]').textContent).toBe('3');
    expect(container.textContent).toContain('/ 5 問正解');
    expect(container.textContent).toContain('正答率 60%');
    expect(container.querySelector('h1').textContent).toBe('トレーニング結果');
    expect(container.textContent).toContain('標準');
    expect(container.querySelectorAll('.result-history__item')).toHaveLength(5);
  });

  it('もう一度挑戦・設定を変更・カテゴリ選択・タイトルへ（難易度と「第◯問」の間に2行×2列）', () => {
    finishWith([true]);
    const navigate = vi.fn();
    mountTrainingResultScreen(container, { navigate });
    const grid = container.querySelector('.result-grid-actions');
    expect([...grid.children].map((b) => b.textContent)).toEqual(['もう一度挑戦', '設定を変更', 'カテゴリ選択', 'タイトルへ']);
    // 難易度（result-meta）のすぐ下、「第◯問」（result-history）の上
    expect(grid.previousElementSibling.classList).toContain('result-meta');
    expect(grid.nextElementSibling.classList).toContain('result-history');
    const before = store.getSession();
    buttonByText(container, 'もう一度挑戦').click();
    expect(store.getSession()).not.toBe(before);
    expect(store.getSession().state).toMatchObject({ answeredCount: 0, difficulty: 2, questionLimit: 5 });
    buttonByText(container, '設定を変更').click();
    buttonByText(container, 'カテゴリ選択').click();
    buttonByText(container, 'タイトルへ').click();
    expect(navigate.mock.calls).toEqual([['question'], ['setup', { category: 'position' }], ['categories'], ['home']]);
  });

  it('「第◯問」のカードを押すと、同じ問題をもう一度解ける。解いても結果は変わらず、「結果に戻る」で戻る', () => {
    finishWith([true, false, true]);
    const summaryBefore = store.getSummary();
    const navigate = vi.fn();
    mountTrainingResultScreen(container, { navigate });
    const cards = container.querySelectorAll('button.result-history__item');
    expect(cards).toHaveLength(3);
    expect(cards[1].getAttribute('aria-label')).toBe('第2問（不正解）をもう一度解く');
    cards[1].click();
    expect(navigate).toHaveBeenCalledWith('question', { review: '2' });
    const original = summaryBefore.history[1].question;
    expect(store.getReview().number).toBe(2);

    // 復習の問題画面：同じ問題（同じ選択肢の並び）
    const screenEl = document.createElement('main');
    document.body.append(screenEl);
    const back = vi.fn();
    const screen = mountQuestionScreen(screenEl, { navigate: back, params: { review: '2' } });
    expect(store.getReview().session.state.currentQuestion).toBe(original);
    expect(screenEl.querySelector('.quiz-text').textContent).toBe(original.question);
    expect([...screenEl.querySelectorAll('.choice')].map((c) => c.dataset.choice)).toEqual(original.choices.map((c) => c.id));
    expect(screenEl.querySelector('.quiz-progress').textContent).toBe('復習：第2問');
    for (const id of original.correctAnswers) screenEl.querySelector(`[data-choice="${id}"]`).click();
    buttonByText(screenEl, '回答する').click();
    expect(screenEl.querySelector('.feedback__title').textContent).toBe('正解！');
    // もとの結果・トレーニングは変わらない
    expect(store.getSummary()).toBe(summaryBefore);
    expect(store.getSummary().correctCount).toBe(2);
    buttonByText(screenEl, '結果に戻る').click();
    expect(back).toHaveBeenCalledWith('result');
    expect(store.getReview()).toBeNull();
    screen.unmount();
    screenEl.remove();
  });

  it('復習の途中でも「結果に戻る」で確認なしに戻れる。復習のデータがなければ結果画面へ', () => {
    finishWith([false]);
    store.startReview(1);
    const screenEl = document.createElement('main');
    const back = vi.fn();
    const screen = mountQuestionScreen(screenEl, { navigate: back, params: { review: '1' } });
    expect(buttonByText(screenEl, 'やめる')).toBeUndefined();
    buttonByText(screenEl, '結果に戻る').click();
    expect(back).toHaveBeenCalledWith('result');
    screen.unmount();
    const again = vi.fn();
    mountQuestionScreen(document.createElement('main'), { navigate: again, params: { review: '1' } });
    expect(again).toHaveBeenCalledWith('result');
  });

  it('結果がなければカテゴリ選択へ戻す', () => {
    const navigate = vi.fn();
    mountTrainingResultScreen(container, { navigate });
    expect(navigate).toHaveBeenCalledWith('categories');
  });
});

describe('問題画面（Phase 2：サイコロ・見え方）', () => {
  let container;
  let navigate;
  let screen;

  const start = (settings) => {
    store.startTraining(settings, { rng: createRng(7) });
    screen = mountQuestionScreen(container, { navigate });
  };

  beforeEach(() => {
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
    navigate = vi.fn();
  });

  afterEach(() => {
    screen?.unmount();
    container.remove();
  });

  it('サイコロ：装飾・向きを 3D に設定し、回答前は立方体を表示せず、図だけを表示する', () => {
    start({ category: 'dice', difficulty: 1, questionLimit: 5 });
    const q = currentQuestion();
    expect(viewer.setFaceDecorations).toHaveBeenLastCalledWith(q.scene.faces);
    expect(viewer.setCubeOrientation).toHaveBeenLastCalledWith(q.scene.orientation);
    expect(viewer.setLabelsVisible).toHaveBeenLastCalledWith(false);
    expect(viewer.disableRotation).toHaveBeenCalled();
    expect(container.querySelector('.quiz-view').hidden).toBe(true);
    expect(container.querySelector('.quiz').classList).toContain('quiz--no-view');
    expect(container.querySelectorAll('.quiz-figures svg').length).toBeGreaterThanOrEqual(1);
    if (q.templateId === 'D01') expect(container.querySelector('.moves')).not.toBeNull();
  });

  it('回答すると立方体が現れて回転の演出を再生し、そのあとは自由に回せる。リプレイも同じ演出', () => {
    start({ category: 'dice', difficulty: 2, questionLimit: 5 });
    const q = currentQuestion();
    viewer.enableRotation.mockClear();
    answer(container, { correct: false });
    expect(viewer.enableRotation).toHaveBeenCalled();
    expect(container.querySelector('.quiz-view').hidden).toBe(false);
    expect(container.querySelector('.quiz').classList).not.toContain('quiz--no-view');
    const call = viewer.playQuestionReveal.mock.calls.at(-1)[0];
    expect(call).toMatchObject({ orientation: q.scene.orientation, cameraPreset: q.scene.cameraPreset, steps: q.explanation.reveal.steps });
    expect(call.correct).toEqual(q.explanation.highlightElements);
    expect(call.wrong).toHaveLength(1); // 誤って選んだ数字の面
    buttonByText(container, 'もう一度見る').click();
    expect(viewer.playQuestionReveal).toHaveBeenCalledTimes(2);
    expect(viewer.playAnswerReveal).not.toHaveBeenCalled();
  });

  it('積み木 ★3：図の選択肢（ア〜エ）で回答できる', () => {
    start({ category: 'projection', difficulty: 3, questionLimit: 5 });
    const figures = container.querySelectorAll('.choice--figure');
    expect(figures).toHaveLength(4);
    expect([...figures].map((b) => b.querySelector('.choice__label--mark').textContent)).toEqual(['ア', 'イ', 'ウ', 'エ']);
    for (const b of figures) expect(b.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.choices').classList).toContain('choices--figures');
    answer(container);
    expect(container.querySelector('.feedback__title').textContent).toBe('正解！');
  });

  it('目・マークを答える選択肢は面の絵で表示し、読み上げ用の文字（「3の目」「「〇」」）を持つ', () => {
    start({ category: 'dice', difficulty: 1, questionLimit: 5 });
    const choice = choiceButtons(container)[0];
    expect(choice.querySelector('svg.pip-icon')).not.toBeNull();
    expect(choice.querySelector('.choice__label').textContent).toMatch(/^([1-6]の目|「[〇◎×●◇◆]」)$/);
    // 次の問題へ進むと、回答前の問題では立方体がまた隠れる
    answer(container);
    expect(container.querySelector('.quiz-view').hidden).toBe(false);
    buttonByText(container, '次の問題へ').click();
    expect(container.querySelector('.quiz-view').hidden).toBe(true);
  });

  it('位置関係の問題では、従来どおりのふつうの立方体に戻る', () => {
    start({ category: 'position', difficulty: 1, questionLimit: 5 });
    expect(viewer.setFaceDecorations).toHaveBeenLastCalledWith(null);
    expect(viewer.setLabelsVisible).toHaveBeenLastCalledWith(true);
    expect(viewer.enableRotation).toHaveBeenCalled();
    expect(container.querySelector('.quiz-view').hidden).toBe(false); // 位置関係は回答前から立方体を表示
    answer(container);
    expect(viewer.playAnswerReveal).toHaveBeenCalled();
    expect(viewer.playQuestionReveal).not.toHaveBeenCalled();
  });

  it('積み木の5問を最後まで進められ、結果に反映される', () => {
    start({ category: 'projection', difficulty: 'all', questionLimit: 5 });
    for (let i = 0; i < 5; i++) {
      answer(container);
      buttonByText(container, i < 4 ? '次の問題へ' : '結果を見る').click();
    }
    expect(navigate).toHaveBeenCalledWith('result');
    expect(store.getSummary()).toMatchObject({ answeredCount: 5, correctCount: 5, category: 'projection' });
  });

  it('WebGL が使えなくても、図と選択肢だけで回答できる', () => {
    const original = globalThis.__createFakeViewer;
    globalThis.__createFakeViewer = () => {
      throw new Error('WebGL2 unavailable');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      start({ category: 'dice', difficulty: 3, questionLimit: 5 });
      expect(container.textContent).toContain('3D 表示を利用できない端末です');
      expect(container.querySelectorAll('.quiz-figures svg').length).toBeGreaterThanOrEqual(1);
      answer(container);
      expect(container.querySelector('.feedback__title').textContent).toBe('正解！');
      buttonByText(container, '次の問題へ').click();
      expect(store.getSession().state.answeredCount).toBe(1);
    } finally {
      globalThis.__createFakeViewer = original;
      spy.mockRestore();
    }
  });
});

describe('問題画面（積み木の見え方・投影図）', () => {
  let container;
  let navigate;
  let screen;

  const start = (settings) => {
    store.startTraining({ category: 'projection', questionLimit: 5, ...settings }, { rng: createRng(13) });
    screen = mountQuestionScreen(container, { navigate });
  };

  beforeEach(() => {
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
    navigate = vi.fn();
  });

  afterEach(() => {
    screen?.unmount();
    container.remove();
  });

  it('回答前は 3D の場所に見取図（赤い矢印つき）を表示し、3D は隠す。積み木を 3D に設定する', () => {
    start({ difficulty: 1 });
    const q = currentQuestion();
    expect(viewer.setBlocks).toHaveBeenLastCalledWith(q.scene.blocks, { arrows: q.scene.arrows });
    expect(viewer.setFaceDecorations).toHaveBeenLastCalledWith(null);
    const view = container.querySelector('.quiz-view');
    expect(view.hidden).toBe(false);
    expect(container.querySelector('.quiz-preview').hidden).toBe(false);
    expect(container.querySelector('.viewport').hidden).toBe(true);
    const drawing = container.querySelector('.quiz-preview svg');
    expect(drawing.querySelectorAll('[data-cube]')).toHaveLength(q.scene.blocks.length);
    expect(drawing.querySelectorAll('.block-arrow')).toHaveLength(q.scene.arrows.length);
    expect(container.querySelector('.quiz').classList).not.toContain('quiz--no-view');
  });

  it('回答すると同じ場所が 3D に切りかわり、視点移動の演出を再生する', () => {
    start({ difficulty: 2 });
    const q = currentQuestion();
    answer(container, { correct: false });
    expect(container.querySelector('.quiz-preview').hidden).toBe(true);
    expect(container.querySelector('.viewport').hidden).toBe(false);
    const call = viewer.playQuestionReveal.mock.calls.at(-1)[0];
    expect(call.steps).toEqual(q.explanation.reveal.steps);
    expect(call.cameraPreset).toEqual(q.scene.cameraPreset);
    expect(viewer.enableRotation).toHaveBeenCalled();
  });

  it('次の問題がほかのカテゴリでなくても、積み木は毎回設定し直され、前の問題が残らない', () => {
    start({ difficulty: 'all' });
    const first = currentQuestion();
    answer(container);
    buttonByText(container, '次の問題へ').click();
    const second = currentQuestion();
    expect(second.id).not.toBe(first.id);
    expect(viewer.setBlocks).toHaveBeenLastCalledWith(second.scene.blocks, { arrows: second.scene.arrows });
    expect(container.querySelector('.quiz-preview').hidden).toBe(false);
  });

  it('位置関係の問題では積み木を消して、ふつうの立方体に戻る', () => {
    store.startTraining({ category: 'position', difficulty: 1, questionLimit: 5 }, { rng: createRng(2) });
    screen = mountQuestionScreen(container, { navigate });
    expect(viewer.setBlocks).toHaveBeenLastCalledWith(null, { arrows: [] });
    expect(container.querySelector('.quiz-preview').hidden).toBe(true);
    expect(container.querySelector('.viewport').hidden).toBe(false);
  });

  it('WebGL が使えなくても、回答後も見取図を表示したまま回答できる', () => {
    const original = globalThis.__createFakeViewer;
    globalThis.__createFakeViewer = () => {
      throw new Error('WebGL2 unavailable');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      start({ difficulty: 3 });
      answer(container);
      expect(container.querySelector('.feedback__title').textContent).toBe('正解！');
      expect(container.querySelector('.quiz-preview').hidden).toBe(false);
    } finally {
      globalThis.__createFakeViewer = original;
      spy.mockRestore();
    }
  });
});

describe('回答ボタンが「次の問題へ」に変わる', () => {
  let container;
  let screen;
  beforeEach(() => {
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
  });
  afterEach(() => {
    screen?.unmount();
    container.remove();
  });

  it('回答すると同じボタンが「次の問題へ」になり、最後の問題では「結果を見る」になる', () => {
    const navigate = vi.fn();
    store.startTraining({ category: 'position', difficulty: 1, questionLimit: 2 }, { rng: createRng(3) });
    screen = mountQuestionScreen(container, { navigate });
    const btn = buttonByText(container, '回答する');
    answer(container);
    expect(btn.textContent).toBe('次の問題へ');
    expect(btn.disabled).toBe(false);
    expect(buttonByText(container, '回答する')).toBeUndefined();
    expect([...container.querySelectorAll('button')].filter((b) => b.textContent === '次の問題へ')).toHaveLength(1);
    // 選択肢のすぐ下（解説より上）にある
    expect(btn.compareDocumentPosition(container.querySelector('.feedback')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(buttonByText(container, 'パス')).toBeUndefined(); // パスは段位認定だけ
    expect(container.querySelector('[data-testid="play-mode"]').textContent).toBe('トレーニング'); // プレイ形式がわかる
    btn.click();
    expect(btn.textContent).toBe('回答する');
    expect(btn.disabled).toBe(true);
    answer(container);
    expect(btn.textContent).toBe('結果を見る');
    sounds.playFinishSound.mockClear();
    btn.click();
    expect(sounds.playFinishSound).toHaveBeenCalledTimes(1); // 解き終えて結果画面へ進むときの効果音
    expect(navigate).toHaveBeenCalledWith('result');
  });
});

describe('問題画面（展開図）', () => {
  let container;
  let navigate;
  let screen;
  const start = (settings) => {
    store.startTraining({ questionLimit: 5, ...settings }, { rng: createRng(21) });
    screen = mountQuestionScreen(container, { navigate });
  };
  beforeEach(() => {
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
    navigate = vi.fn();
  });
  afterEach(() => {
    screen?.unmount();
    container.remove();
  });

  it('回答前は 3D の場所に展開図を表示し、3D の展開図を設定する', () => {
    start({ category: 'netMapping', difficulty: 1 });
    const q = currentQuestion();
    expect(viewer.setNet).toHaveBeenLastCalledWith(q.scene.net);
    expect(container.querySelector('.quiz-preview').hidden).toBe(false);
    expect(container.querySelector('.quiz-preview svg.net-figure')).not.toBeNull();
    expect(container.querySelector('.viewport').hidden).toBe(true);
  });

  it('回答すると 3D に切りかわって折りたたみの演出を再生し、「展開図に戻す」で逆再生できる', () => {
    start({ category: 'netMapping', difficulty: 2 });
    const q = currentQuestion();
    answer(container);
    expect(container.querySelector('.viewport').hidden).toBe(false);
    const call = viewer.playQuestionReveal.mock.calls.at(-1)[0];
    expect(call.steps).toEqual(q.explanation.reveal.steps);
    const toggle = buttonByText(container, '展開図に戻す');
    expect(toggle.hidden).toBe(false);
    toggle.click();
    expect(viewer.playNetFold).toHaveBeenLastCalledWith({ to: 0, duration: 1800 });
    expect(toggle.textContent).toBe('組み立てる');
  });

  it('展開図パズル：解説の選択肢の記号が置きかわり、立方体にならない図の重なるマスは回答後に示す', () => {
    start({ category: 'netPuzzle', difficulty: 1 });
    let q = currentQuestion();
    for (let i = 0; i < 5 && q.templateId !== 'C01'; i++) {
      answer(container);
      buttonByText(container, '次の問題へ').click();
      q = currentQuestion();
    }
    expect(q.templateId).toBe('C01');
    expect(container.querySelector('.choices').classList).not.toContain('choices--answered');
    answer(container);
    expect(container.querySelector('.choices').classList).toContain('choices--answered');
    const text = container.querySelector('.feedback__explanation').textContent;
    expect(text).not.toContain('〔choice:');
    expect(text).toMatch(/立方体の展開図になるのは[アイウエ・]+です/);
  });

  it('ほかのカテゴリの問題では展開図を消す', () => {
    start({ category: 'dice', difficulty: 1 });
    expect(viewer.setNet).toHaveBeenLastCalledWith(null);
    expect(buttonByText(container, '展開図に戻す').hidden).toBe(true);
  });

  it('サイコロのはじめの向きの図には「上・前・右」が書いてある', () => {
    start({ category: 'dice', difficulty: 2 });
    const figure = container.querySelector('.quiz-figures svg');
    expect([...figure.querySelectorAll('[data-direction-label]')].map((t) => t.textContent).sort()).toEqual(['上', '前', '右'].sort());
  });
});

describe('回答直後の「○」「△」「×」', () => {
  let container;
  let screen;
  beforeEach(() => {
    vi.useFakeTimers();
    answerSplash.duration = SPLASH_DURATION;
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
  });
  afterEach(() => {
    screen?.unmount();
    container.remove();
    answerSplash.duration = 0;
    vi.useRealTimers();
  });
  const start = () => {
    store.startTraining({ category: 'position', difficulty: 1, questionLimit: 3 }, { rng: createRng(5) });
    screen = mountQuestionScreen(container, { navigate: vi.fn() });
  };

  it('約1秒、前面に大きく表示し、消えてから正誤・解説・3D の演出・回答後のボタンを出す', () => {
    start();
    expect(answerSplash.duration).toBe(1000);
    expect(buttonByText(container, 'もう一度見る').hidden).toBe(true);
    answer(container, { correct: true });
    const splash = container.querySelector('.answer-splash');
    expect(splash.classList).toContain('answer-splash--correct');
    expect(splash.getAttribute('aria-label')).toBe('正解！');
    expect(splash.querySelector('circle')).not.toBeNull();
    // 表示中は、まだ結果を出さない
    expect(container.querySelector('.feedback').hidden).toBe(true);
    expect(container.querySelector('.choice--correct')).toBeNull();
    expect(viewer.playAnswerReveal).not.toHaveBeenCalled();
    expect(container.querySelector('.btn--primary').disabled).toBe(true);
    vi.advanceTimersByTime(999);
    expect(container.querySelector('.answer-splash')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(container.querySelector('.answer-splash')).toBeNull();
    expect(container.querySelector('.feedback').hidden).toBe(false);
    expect(container.querySelector('.feedback__title').textContent).toBe('正解！');
    expect(viewer.playAnswerReveal).toHaveBeenCalledTimes(1);
    expect(buttonByText(container, '次の問題へ').disabled).toBe(false);
    // もう一度見るは「視点リセット」と同じ、立方体の下のボタン列にある
    const tools = container.querySelector('.quiz-view__tools');
    for (const label of ['もう一度見る', '視点リセット']) expect(tools.contains(buttonByText(container, label))).toBe(true);
    expect(buttonByText(container, 'もう一度見る').hidden).toBe(false);
    expect(container.querySelector('.feedback').contains(buttonByText(container, 'もう一度見る'))).toBe(false);
  });

  it('不正解は「×」。タップするとすぐ閉じて結果を出す', () => {
    start();
    answer(container, { correct: false });
    const splash = container.querySelector('.answer-splash');
    expect(splash.classList).toContain('answer-splash--incorrect');
    expect(splash.querySelectorAll('line')).toHaveLength(2);
    splash.click();
    expect(container.querySelector('.answer-splash')).toBeNull();
    expect(container.querySelector('.feedback__title').textContent).toBe('不正解');
    vi.advanceTimersByTime(2000);
    expect(viewer.playAnswerReveal).toHaveBeenCalledTimes(1); // 二重に出さない
  });

  it('表示中に画面を閉じても、あとから結果を出そうとしない', () => {
    start();
    answer(container);
    screen.unmount();
    screen = null;
    vi.advanceTimersByTime(2000);
    expect(container.querySelector('.answer-splash')).toBeNull();
    expect(viewer.playAnswerReveal).not.toHaveBeenCalled();
  });
});

describe('問題画面（立方体の個数・着色：小立方体）', () => {
  let container;
  let screen;
  beforeEach(() => {
    learning.configureLearningStorage(createMemoryBackend());
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
  });
  afterEach(() => {
    screen?.unmount();
    container.remove();
  });
  const start = (settings = {}) => {
    store.startTraining({ category: 'paintedCube', difficulty: 1, questionLimit: 5, ...settings }, { rng: createRng(4) });
    screen = mountQuestionScreen(container, { navigate: vi.fn() });
  };

  it('回答前は静的な見取図（分割線・着色）、回答すると 3D に切りかわり、分割 → 分離 → 強調の演出を再生する', () => {
    start();
    // 積み木の個数の問題（B09）が先に出たら、小立方体の問題まで進める
    while (currentQuestion().scene.model !== 'subcubes') {
      answer(container);
      buttonByText(container, '次の問題へ').click();
    }
    const q = currentQuestion();
    expect(q.scene.model).toBe('subcubes');
    expect(viewer.setSubcubes).toHaveBeenLastCalledWith(q.scene.subcubes);
    const preview = container.querySelector('.quiz-preview');
    expect(preview.hidden).toBe(false);
    expect(preview.querySelector('svg.subcube-figure')).not.toBeNull();
    expect(preview.querySelectorAll('[data-painted]').length).toBeGreaterThan(0);
    expect(container.querySelector('.viewport').hidden).toBe(true);
    expect(viewer.disableRotation).toHaveBeenCalled();
    answer(container);
    expect(container.querySelector('.viewport').hidden).toBe(false);
    const spec = viewer.playQuestionReveal.mock.calls.at(-1)[0];
    expect(spec.steps.map((st) => st.type)).toEqual(['pause', 'divide', 'separate', 'highlightSubcubes']);
    expect(viewer.enableRotation).toHaveBeenCalled();
    // 「元に戻す」⇄「分離して見る」
    const toggle = buttonByText(container, '元に戻す');
    expect(toggle.hidden).toBe(false);
    toggle.click();
    expect(viewer.playSubcubeSeparation).toHaveBeenCalledWith({ to: 0 });
    expect(toggle.textContent).toBe('分離して見る');
    // 次の問題では前の問題の表示を残さない
    buttonByText(container, '次の問題へ').click();
    const next = currentQuestion();
    expect(viewer.setSubcubes).toHaveBeenLastCalledWith(next.scene.model === 'subcubes' ? next.scene.subcubes : null);
    expect(buttonByText(container, '分離して見る').hidden).toBe(true);
  });

  it('ほかのカテゴリに切りかえると、小立方体は消える', () => {
    store.startTraining({ category: 'position', difficulty: 1, questionLimit: 2 }, { rng: createRng(1) });
    screen = mountQuestionScreen(container, { navigate: vi.fn() });
    expect(viewer.setSubcubes).toHaveBeenLastCalledWith(null);
  });
});

describe('ヒント', () => {
  let container;
  let screen;
  beforeEach(() => {
    learning.configureLearningStorage(createMemoryBackend());
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
  });
  afterEach(() => {
    screen?.unmount();
    container.remove();
  });

  it.each(['position', 'netMapping', 'netPuzzle', 'dice', 'paintedCube', 'projection'])('%s：回答前に「ヒントを見る」で表示でき、回答すると消える', (category) => {
    store.startTraining({ category, difficulty: 'all', questionLimit: 3 }, { rng: createRng(6) });
    screen = mountQuestionScreen(container, { navigate: vi.fn() });
    const q = currentQuestion();
    const hintButton = buttonByText(container, 'ヒントを見る');
    const hint = container.querySelector('.quiz-hint');
    expect(hintButton.hidden).toBe(false);
    expect(hint.hidden).toBe(true);
    hintButton.click();
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe(`ヒント：${q.hint.text}`);
    expect(store.getSession().state.hintUsed).toBe(true);
    hintButton.click(); // 隠す
    expect(hint.hidden).toBe(true);
    hintButton.click(); // もう一度見ても同じ
    expect(hint.textContent).toBe(`ヒント：${q.hint.text}`);
    answer(container, { correct: true });
    expect(container.querySelector('.feedback__title').textContent).toBe('正解！'); // ヒントを使っても正誤は同じ
    expect(hintButton.hidden).toBe(true);
    expect(hint.hidden).toBe(true);
    buttonByText(container, '次の問題へ').click();
    expect(store.getSession().state.hintUsed).toBe(false);
    expect(buttonByText(container, 'ヒントを見る').hidden).toBe(false);
    expect(container.querySelector('.quiz-hint').hidden).toBe(true);
  });
});

describe('間違えた問題の復習', () => {
  let container;
  const screens = [];
  beforeEach(() => {
    learning.configureLearningStorage(createMemoryBackend());
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
  });
  afterEach(() => {
    for (const sc of screens.splice(0)) sc.unmount();
    container.remove();
  });
  const mount = (fn, params) => {
    container.replaceChildren();
    const navigate = vi.fn();
    screens.push(fn(container, { navigate, params }));
    return navigate;
  };
  function finishWith(flags, category = 'position') {
    const session = store.startTraining({ category, difficulty: 'all', questionLimit: flags.length }, { rng: createRng(9) });
    for (const ok of flags) {
      const q = session.nextQuestion();
      session.submit(ok ? q.correctAnswers : [q.choices.find((c) => !q.correctAnswers.includes(c.id)).id]);
    }
    store.finishTraining();
  }

  it('全問正解なら「間違えた問題を復習」を出さない', () => {
    finishWith([true, true]);
    mount(mountTrainingResultScreen);
    expect([...container.querySelectorAll('button')].some((b) => b.textContent.startsWith('間違えた問題を復習'))).toBe(false);
  });

  it('不正解・部分正解の問題だけを、同じ問題のまま解き直し、復習の結果を表示する（もとの結果は変わらない）', () => {
    finishWith([true, false, true, false]);
    const summary = store.getSummary();
    const wrong = summary.history.filter((h) => !h.isCorrect).map((h) => h.question);
    let navigate = mount(mountTrainingResultScreen);
    buttonByText(container, '間違えた問題を復習（2問）').click();
    expect(navigate).toHaveBeenCalledWith('question', { review: 'mistakes' });

    navigate = mount(mountQuestionScreen, { review: 'mistakes' });
    expect(container.querySelector('.quiz-progress').textContent).toBe('復習 1 / 2');
    expect(store.getReview().session.state.currentQuestion).toBe(wrong[0]);
    answer(container, { correct: true });
    buttonByText(container, '次の問題へ').click();
    expect(store.getReview().session.state.currentQuestion).toBe(wrong[1]);
    expect(container.querySelector('.quiz-progress').textContent).toBe('復習 2 / 2');
    answer(container, { correct: false });
    buttonByText(container, '復習の結果を見る').click();
    expect(navigate).toHaveBeenCalledWith('review-result');
    expect(store.getSummary()).toBe(summary); // 通常の結果は上書きしない
    expect(summary.correctCount).toBe(2);

    navigate = mount(mountReviewResultScreen);
    expect(container.querySelector('[data-testid="review-answered"]').textContent).toBe('2問');
    expect(container.querySelector('[data-testid="review-correct"]').textContent).toBe('1問');
    expect(container.querySelector('[data-testid="review-rate"]').textContent).toBe('50%');
    // まだ間違えている問題をさらに復習
    buttonByText(container, 'まだ間違えている問題を復習（1問）').click();
    expect(navigate).toHaveBeenCalledWith('question', { review: 'retry' });
    expect(store.getReview().session.state.currentQuestion ?? store.getReview().session.nextQuestion()).toBe(wrong[1]);
    store.endReview();
    buttonByText(container, '結果に戻る').click();
    expect(navigate).toHaveBeenCalledWith('result');
  });

  it('「復習をやめる」でも、そこまでの復習の結果を表示する', () => {
    finishWith([false, false]);
    store.startMistakeReview();
    const navigate = mount(mountQuestionScreen, { review: 'mistakes' });
    answer(container, { correct: true });
    buttonByText(container, '復習をやめる').click();
    expect(navigate).toHaveBeenCalledWith('review-result');
    expect(store.getReviewSummary()).toMatchObject({ answeredCount: 1, correctCount: 1 });
  });
});

describe('学習記録', () => {
  let container;
  let backend;
  const screens = [];
  beforeEach(() => {
    backend = createMemoryBackend();
    learning.configureLearningStorage(backend);
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
  });
  afterEach(() => {
    for (const sc of screens.splice(0)) sc.unmount();
    container.remove();
  });
  const mount = (fn, params) => {
    container.replaceChildren();
    const navigate = vi.fn();
    screens.push(fn(container, { navigate, params }));
    return navigate;
  };
  function finishWith(flags, category = 'dice') {
    const session = store.startTraining({ category, difficulty: 'all', questionLimit: flags.length }, { rng: createRng(12) });
    for (const ok of flags) {
      const q = session.nextQuestion();
      if (!ok) session.useHint();
      session.submit(ok ? q.correctAnswers : [q.choices.find((c) => !q.correctAnswers.includes(c.id)).id]);
    }
    store.finishTraining();
    return session;
  }
  const card = (id) => container.querySelector(`.history-card[data-category="${id}"]`);

  it('カテゴリ選択から開け、カテゴリ別の累計・正答率・復習待ちを表示する。未プレイは「まだ記録がありません」', () => {
    const nav = mount(mountCategoryScreen);
    buttonByText(container, '学習記録').click();
    expect(nav).toHaveBeenCalledWith('history');

    finishWith([true, false, true]);
    mount(mountLearningHistoryScreen);
    const dice = card('dice');
    expect(dice.querySelector('[data-testid="answered"]').textContent).toBe('3問');
    expect(dice.querySelector('[data-testid="correct"]').textContent).toBe('2問');
    expect(dice.querySelector('[data-testid="accuracy"]').textContent).toBe('67%');
    expect(dice.querySelector('[data-testid="pending"]').textContent).toBe('復習待ち 1問');
    expect(dice.textContent).toContain('ヒント1回');
    expect(card('position').textContent).toContain('まだ記録がありません');
    expect(container.querySelectorAll('.history-card')).toHaveLength(10);
  });

  it('ブラウザを開き直しても記録が残り、保存した問題を同じ問題のまま復習できる。正解すると復習待ちから外れる', () => {
    const session = finishWith([false, true]);
    const wrong = session.getSummary().history[0].question;
    // 開き直し（同じ保存先から読み込みなおす）
    learning.configureLearningStorage(backend);
    store.resetTrainingStore();
    let navigate = mount(mountLearningHistoryScreen);
    expect(card('dice').querySelector('[data-testid="answered"]').textContent).toBe('2問');
    buttonByText(card('dice'), '復習する').click();
    expect(navigate).toHaveBeenCalledWith('question', { review: 'saved' });
    navigate = mount(mountQuestionScreen, { review: 'saved' });
    const q = store.getReview().session.state.currentQuestion;
    expect(q).toEqual(JSON.parse(JSON.stringify(wrong)));
    expect(q.correctAnswers).toEqual(wrong.correctAnswers);
    answer(container, { correct: true });
    buttonByText(container, '復習の結果を見る').click();
    expect(navigate).toHaveBeenCalledWith('review-result');
    expect(learning.getSavedReviewCount('dice')).toBe(0);
    navigate = mount(mountReviewResultScreen);
    buttonByText(container, '学習記録に戻る').click();
    expect(navigate).toHaveBeenCalledWith('history');
    // 復習の結果は、通常の累計に入れない
    expect(learning.getLearningStats('dice')).toMatchObject({ answeredCount: 2, correctCount: 1, reviewAnswered: 1, reviewCorrect: 1 });
  });

  it('「学習記録を消去」は確認してから、CUBE MASTER のデータだけを消す', async () => {
    backend.setItem('otherApp:keep', '1');
    finishWith([false]);
    mount(mountLearningHistoryScreen);
    buttonByText(container, '学習記録を消去').click();
    const dialog = document.querySelector('.dialog-backdrop');
    expect(dialog.textContent).toContain('学習記録を消去しますか？');
    buttonByText(dialog, 'やめる').click();
    await Promise.resolve();
    expect(learning.getLearningStats('dice')).not.toBeNull();
    buttonByText(container, '学習記録を消去').click();
    buttonByText(document.querySelector('.dialog-backdrop'), '消去する').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(learning.getLearningStats('dice')).toBeNull();
    expect(learning.getSavedReviewCount('dice')).toBe(0);
    expect(card('dice').textContent).toContain('まだ記録がありません');
    expect(backend.getItem('otherApp:keep')).toBe('1');
  });

  it('保存できない環境でも練習でき、その旨を表示する', () => {
    learning.configureLearningStorage(null);
    finishWith([true, false]);
    expect(store.getSummary().answeredCount).toBe(2);
    mount(mountLearningHistoryScreen);
    expect(container.textContent).toContain('この端末では記録を保存できません');
    expect(learning.isLearningStorageAvailable()).toBe(false);
  });
});

describe('問題画面（立方体の個数・着色：積み木の個数）', () => {
  let container;
  let screen;
  beforeEach(() => {
    learning.configureLearningStorage(createMemoryBackend());
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
  });
  afterEach(() => {
    screen?.unmount();
    container.remove();
  });
  /** 指定したテンプレートの問題まで進める */
  function startAt(templateId, difficulty) {
    store.startTraining({ category: 'paintedCube', difficulty, questionLimit: 20 }, { rng: createRng(5) });
    screen = mountQuestionScreen(container, { navigate: vi.fn() });
    while (currentQuestion().templateId !== templateId) {
      answer(container);
      buttonByText(container, '次の問題へ').click();
    }
    return currentQuestion();
  }

  it('B09：回答前は見取図、回答すると 3D の積み木（上に余白）で段ごとに数える演出', () => {
    const q = startAt('B09', 1);
    expect(container.querySelector('.quiz-preview svg.block-figure')).not.toBeNull();
    expect(viewer.setBlocks).toHaveBeenLastCalledWith(q.scene.blocks, { arrows: [], countingRoom: true });
    answer(container);
    const spec = viewer.playQuestionReveal.mock.calls.at(-1)[0];
    expect(spec.steps.map((st) => st.type)).toEqual(['camera', 'countLayers']);
    expect(container.querySelector('.feedback__explanation').textContent).toMatch(/1段目\d+個/);
  });

  it('B12：今の形と完成形を、矢印をはさんで並べて表示する', () => {
    startAt('B12', 3);
    const pair = container.querySelector('.quiz-preview .blocks-pair');
    expect([...pair.querySelectorAll('figcaption')].map((f) => f.textContent)).toEqual(['今の形', '完成形']);
    expect(pair.querySelectorAll('svg.block-figure')).toHaveLength(2);
    expect(pair.querySelector('.blocks-pair__arrow').textContent).toBe('→');
  });
});
