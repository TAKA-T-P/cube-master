// @vitest-environment jsdom
// トレーニング画面の結線テスト。3D ビューアはモックに置き換える（WebGL 描画は手動確認項目）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../src/core/eventBus.js';
import { createRng } from '../src/utils/random.js';

vi.mock('../src/three/cubeViewer.js', () => ({
  FACE_DISPLAY_MODES: { OPAQUE: 'opaque', TRANSLUCENT: 'translucent', WIREFRAME: 'wireframe' },
  createCubeViewer: () => globalThis.__createFakeViewer(),
}));

const { mountCategoryScreen } = await import('../src/ui/categoryScreen.js');
const { mountTrainingSetupScreen } = await import('../src/ui/trainingSetupScreen.js');
const { mountQuestionScreen } = await import('../src/ui/questionScreen.js');
const { mountTrainingResultScreen } = await import('../src/ui/trainingResultScreen.js');
const store = await import('../src/ui/trainingStore.js');

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
  };
  return viewer;
};

const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const choiceButtons = (root) => [...root.querySelectorAll('.choice')];
const currentQuestion = () => store.getSession().state.currentQuestion;

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

  it('10カテゴリを表示し、遊べる5カテゴリだけを選べる', () => {
    const navigate = vi.fn();
    mountCategoryScreen(container, { navigate });
    const cards = container.querySelectorAll('.category-card');
    expect(cards).toHaveLength(10);
    const position = container.querySelector('[data-category="position"]');
    expect(position.textContent).toContain('平行・垂直・ねじれ');
    expect(position.textContent).toContain('小学6年生～中学1年生');
    expect([...cards].filter((c) => !c.disabled).map((c) => c.dataset.category)).toEqual(['netMapping', 'position', 'netPuzzle', 'dice', 'projection']);
    container.querySelector('[data-category="cutting"]').click(); // 準備中
    position.click();
    container.querySelector('[data-category="dice"]').click();
    container.querySelector('[data-category="projection"]').click();
    expect(navigate.mock.calls).toEqual([
      ['setup', { category: 'position' }],
      ['setup', { category: 'dice' }],
      ['setup', { category: 'projection' }],
    ]);
  });

  it('難易度・問題数を選んで開始する（初期値は すべて・5問。問題数はスライダーで1〜20問）', () => {
    const navigate = vi.fn();
    mountTrainingSetupScreen(container, { navigate, params: { category: 'position' } });
    const pressed = [...container.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent);
    expect(pressed).toEqual(['すべて']);
    expect([...container.querySelectorAll('.segmented__item')].map((b) => b.textContent)).toEqual(['基本', '標準', '応用', 'すべて']);
    const range = container.querySelector('input[type="range"]');
    expect([range.min, range.max, range.value]).toEqual(['1', '20', '5']);
    expect(container.querySelector('.slider__value').textContent).toBe('5問');
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

  it('「もう一度見る」でリプレイし、再生中だけスキップできる', () => {
    start({ difficulty: 1, questionLimit: 5 });
    answer(container);
    const skip = buttonByText(container, 'スキップ');
    viewer.events.emit('animation:state', { playing: true, paused: false });
    expect(skip.disabled).toBe(false);
    skip.click();
    expect(viewer.animations.skip).toHaveBeenCalled();
    viewer.events.emit('animation:state', { playing: false, paused: false });
    expect(skip.disabled).toBe(true);
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
    expect(container.textContent).toContain('標準');
    expect(container.querySelectorAll('.result-history__item')).toHaveLength(5);
  });

  it('もう一度挑戦・設定を変更・カテゴリ選択に戻る', () => {
    finishWith([true]);
    const navigate = vi.fn();
    mountTrainingResultScreen(container, { navigate });
    const before = store.getSession();
    buttonByText(container, 'もう一度挑戦').click();
    expect(store.getSession()).not.toBe(before);
    expect(store.getSession().state).toMatchObject({ answeredCount: 0, difficulty: 2, questionLimit: 5 });
    buttonByText(container, '設定を変更').click();
    buttonByText(container, 'カテゴリ選択に戻る').click();
    expect(navigate.mock.calls).toEqual([['question'], ['setup', { category: 'position' }], ['categories']]);
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
    btn.click();
    expect(btn.textContent).toBe('回答する');
    expect(btn.disabled).toBe(true);
    answer(container);
    expect(btn.textContent).toBe('結果を見る');
    btn.click();
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
