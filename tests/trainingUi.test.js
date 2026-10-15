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

  it('10カテゴリを表示し、位置関係・サイコロ・回転・立方体の見え方を選べる', () => {
    const navigate = vi.fn();
    mountCategoryScreen(container, { navigate });
    const cards = container.querySelectorAll('.category-card');
    expect(cards).toHaveLength(10);
    const position = container.querySelector('[data-category="position"]');
    expect(position.textContent).toContain('平行・垂直・ねじれ');
    expect(position.textContent).toContain('小学6年生～中学1年生');
    expect([...cards].filter((c) => !c.disabled).map((c) => c.dataset.category)).toEqual(['position', 'dice', 'projection']);
    container.querySelector('[data-category="net"]').click(); // 準備中
    position.click();
    container.querySelector('[data-category="dice"]').click();
    container.querySelector('[data-category="projection"]').click();
    expect(navigate.mock.calls).toEqual([
      ['setup', { category: 'position' }],
      ['setup', { category: 'dice' }],
      ['setup', { category: 'projection' }],
    ]);
  });

  it('難易度・問題数を選んで開始する（初期値は すべて・10問）', () => {
    const navigate = vi.fn();
    mountTrainingSetupScreen(container, { navigate, params: { category: 'position' } });
    const pressed = [...container.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent);
    expect(pressed).toEqual(['すべて', '10問']);
    buttonByText(container, '★2 標準').click();
    buttonByText(container, '5問').click();
    buttonByText(container, 'スタート').click();
    expect(store.getSettings()).toMatchObject({ category: 'position', difficulty: 2, questionLimit: 5 });
    expect(navigate).toHaveBeenCalledWith('question');
  });

  it('遊べないカテゴリはカテゴリ選択に戻す', () => {
    const navigate = vi.fn();
    mountTrainingSetupScreen(container, { navigate, params: { category: 'net' } });
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
    expect(container.textContent).toContain('★1 きほん');
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
    expect(container.textContent).toContain('★2 標準');
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

  it('サイコロ：装飾・向きを 3D に設定し、回答前は回転を止め、図を表示する', () => {
    start({ category: 'dice', difficulty: 1, questionLimit: 5 });
    const q = currentQuestion();
    expect(viewer.setFaceDecorations).toHaveBeenLastCalledWith(q.scene.faces);
    expect(viewer.setCubeOrientation).toHaveBeenLastCalledWith(q.scene.orientation);
    expect(viewer.setLabelsVisible).toHaveBeenLastCalledWith(false);
    expect(viewer.disableRotation).toHaveBeenCalled();
    expect(container.querySelector('.quiz-view__note').hidden).toBe(false);
    expect(container.querySelectorAll('.quiz-figures svg').length).toBeGreaterThanOrEqual(1);
    if (q.templateId === 'D01') expect(container.querySelector('.moves')).not.toBeNull();
  });

  it('回答すると回転の演出を再生し、そのあとは自由に回せる。リプレイも同じ演出', () => {
    start({ category: 'dice', difficulty: 2, questionLimit: 5 });
    const q = currentQuestion();
    viewer.enableRotation.mockClear();
    answer(container, { correct: false });
    expect(viewer.enableRotation).toHaveBeenCalled();
    expect(container.querySelector('.quiz-view__note').hidden).toBe(true);
    const call = viewer.playQuestionReveal.mock.calls.at(-1)[0];
    expect(call).toMatchObject({ orientation: q.scene.orientation, cameraPreset: q.scene.cameraPreset, steps: q.explanation.reveal.steps });
    expect(call.correct).toEqual(q.explanation.highlightElements);
    expect(call.wrong).toHaveLength(1); // 誤って選んだ数字の面
    buttonByText(container, 'もう一度見る').click();
    expect(viewer.playQuestionReveal).toHaveBeenCalledTimes(2);
    expect(viewer.playAnswerReveal).not.toHaveBeenCalled();
  });

  it('見え方 ★3：図の選択肢（ア〜エ）で回答できる', () => {
    start({ category: 'projection', difficulty: 3, questionLimit: 5 });
    const figures = container.querySelectorAll('.choice--figure');
    expect(figures).toHaveLength(4);
    expect([...figures].map((b) => b.querySelector('.choice__label--mark').textContent)).toEqual(['ア', 'イ', 'ウ', 'エ']);
    for (const b of figures) expect(b.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.choices').classList).toContain('choices--figures');
    answer(container);
    expect(container.querySelector('.feedback__title').textContent).toBe('正解！');
  });

  it('色の選択肢には色見本と色名を表示する（色だけに頼らない）', () => {
    start({ category: 'projection', difficulty: 1, questionLimit: 5 });
    const choice = choiceButtons(container)[0];
    expect(choice.querySelector('.swatch')).not.toBeNull();
    expect(choice.querySelector('.choice__label').textContent.length).toBeGreaterThan(0);
  });

  it('位置関係の問題では、従来どおりのふつうの立方体に戻る', () => {
    start({ category: 'position', difficulty: 1, questionLimit: 5 });
    expect(viewer.setFaceDecorations).toHaveBeenLastCalledWith(null);
    expect(viewer.setLabelsVisible).toHaveBeenLastCalledWith(true);
    expect(viewer.enableRotation).toHaveBeenCalled();
    expect(container.querySelector('.quiz-view__note').hidden).toBe(true);
    answer(container);
    expect(viewer.playAnswerReveal).toHaveBeenCalled();
    expect(viewer.playQuestionReveal).not.toHaveBeenCalled();
  });

  it('見え方の5問を最後まで進められ、結果に反映される', () => {
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
