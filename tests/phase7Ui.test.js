// @vitest-environment jsdom
// Phase 7：切断・最短経路の画面への組み込み（図の描画・問題画面・1分チャレンジ・段位認定に入れないこと）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../src/core/eventBus.js';
import { createRng } from '../src/utils/random.js';

vi.mock('../src/ui/answerSound.js', () => ({ playAnswerSound: vi.fn(), playFinishSound: vi.fn(), playRankUpSound: vi.fn(), playTimeUpSound: vi.fn(), playCountdownSound: vi.fn() }));
vi.mock('../src/three/cubeViewer.js', () => ({
  FACE_DISPLAY_MODES: { OPAQUE: 'opaque', TRANSLUCENT: 'translucent', WIREFRAME: 'wireframe' },
  createCubeViewer: () => globalThis.__createFakeViewer(),
}));

const { mountQuestionScreen } = await import('../src/ui/questionScreen.js');
const store = await import('../src/ui/trainingStore.js');
const { answerSplash } = await import('../src/ui/answerSplash.js');
const { renderVisual } = await import('../src/ui/visualChoices.js');
const { getTemplates, getCategory } = await import('../src/questions/questionRegistry.js');
const { QuestionPicker } = await import('../src/core/questionEngine.js');
const { TimedChallengeSession, CHALLENGE_RULES } = await import('../src/core/timedChallengeSession.js');
const { CERTIFICATION_RULES } = await import('../src/core/certificationRules.js');
const { getQuestionErrors } = await import('../src/core/questionSchema.js');
const { snapshotQuestion } = await import('../src/core/reviewManager.js');

answerSplash.duration = 0;

let viewer;
globalThis.__createFakeViewer = () => {
  viewer = {
    events: createEventBus(),
    animations: { cancel: vi.fn(), skip: vi.fn(), setSpeed: vi.fn() },
    ...Object.fromEntries(
      ['setFigureOnly', 'setSelectionEnabled', 'setFaceDisplayMode', 'clearHighlights', 'clearSelection', 'highlightElements', 'setCameraPreset', 'resetCamera', 'dispose', 'setFaceDecorations', 'setCubeOrientation', 'setLabelsVisible', 'enableRotation', 'disableRotation', 'enableZoom', 'disableZoom', 'setBlocks', 'setNet', 'playNetFold', 'setSubcubes', 'playSubcubeSeparation', 'setCutting', 'setSurfacePath'].map((k) => [k, vi.fn()]),
    ),
    playAnswerReveal: vi.fn(() => Promise.resolve({ status: 'completed' })),
    playQuestionReveal: vi.fn(() => Promise.resolve({ status: 'completed' })),
    getNetFold: vi.fn(() => 1),
    getSubcubeSeparation: vi.fn(() => 1),
    isFigureOnly: vi.fn(() => viewer.setFigureOnly.mock.calls.at(-1)?.[0] ?? false),
  };
  return viewer;
};

const sample = (templateId, seed = 3) => {
  const category = templateId.startsWith('K') ? 'cubeCutting' : 'surfacePath';
  const t = getTemplates(category).find((x) => x.id === templateId);
  return new QuestionPicker({ templates: [t], rng: createRng(seed) }).next();
};

describe('図の描画', () => {
  it('切り口の形（K03）：多角形を1つ、頂点の数だけ点を描く', () => {
    const q = sample('K03');
    for (const c of q.choices) {
      const el = renderVisual(c.visual);
      const poly = el.querySelector('polygon');
      expect(el.classList.contains('figure--section')).toBe(true);
      expect(poly.getAttribute('points').split(' ')).toHaveLength(c.visual.points.length);
      expect(el.querySelectorAll('circle')).toHaveLength(c.visual.points.length);
    }
  });

  it('展開図の道（S04）：面の数だけ正方形、道の線、出発点・到着点', () => {
    const q = sample('S04');
    for (const c of q.choices) {
      const el = renderVisual(c.visual);
      expect(el.querySelectorAll('polygon')).toHaveLength(c.visual.faces.length);
      expect(el.querySelector('[data-path]').getAttribute('points').split(' ')).toHaveLength(c.visual.path.length);
      expect(el.querySelectorAll('[data-point]')).toHaveLength(2);
      // 同じ縮尺：どの図も同じ枠の大きさ
      expect(el.querySelector('svg').getAttribute('viewBox').split(' ').slice(2)).toEqual(renderVisual(q.choices[0].visual).querySelector('svg').getAttribute('viewBox').split(' ').slice(2));
    }
  });
});

describe('問題画面', () => {
  let container;
  beforeEach(() => {
    store.resetTrainingStore();
    container = document.createElement('main');
    document.body.append(container);
  });
  afterEach(() => {
    container.remove();
    document.body.replaceChildren();
  });

  it.each([
    ['cubeCutting', 'setCutting', 'cutting'],
    ['surfacePath', 'setSurfacePath', 'surfacePath'],
  ])('%s：半透明のふつうの立方体に点や道を重ね、回答前から回して見られる。回答すると正解の演出', async (category, setter, key) => {
    store.startTraining({ category, difficulty: 'all', questionLimit: 3 }, { rng: createRng(4) });
    mountQuestionScreen(container, { navigate: vi.fn(), params: {} });
    const q = store.getSession().state.currentQuestion;
    expect(viewer[setter]).toHaveBeenLastCalledWith(q.scene[key]);
    expect(viewer.setFaceDisplayMode).toHaveBeenLastCalledWith('translucent');
    expect(viewer.enableRotation).toHaveBeenCalled();
    expect(viewer.setLabelsVisible).toHaveBeenLastCalledWith(true);
    // 正解を選んで回答する
    for (const id of q.correctAnswers) container.querySelector(`[data-choice="${id}"]`).click();
    [...container.querySelectorAll('button')].find((b) => b.textContent === '回答する').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('.feedback__title').textContent).toBe('正解！');
    expect(viewer.playQuestionReveal).toHaveBeenCalledWith(expect.objectContaining({ steps: q.explanation.reveal.steps }));
  });

  it('切断・最短経路の問題も、保存した形（JSON）から同じ問題を作り直せる（復習用）', () => {
    for (const id of ['K01', 'K02', 'K03', 'K04', 'K05', 'K06', 'S01', 'S02', 'S03', 'S04', 'S05', 'S06']) {
      const q = sample(id, 12);
      const copy = snapshotQuestion(q);
      expect(copy).toEqual(q);
      expect(getQuestionErrors(copy)).toEqual([]);
    }
  });
});

describe('図の右側の文字と「図のみ表示」', () => {
  it('段ごとの個数・合計は3D の中ではなく右側の表示へ（合計が上、段は上の段から）。1個ずつの番号だけ 3D に残す', async () => {
    const { createBlockModel } = await import('../src/three/blockModel.js');
    const onInfo = vi.fn();
    const blocks = createBlockModel({ labels: false, onInfo });
    blocks.setLabels([
      { text: '1段目 8個', position: [3, 0.5, 1], kind: 'layer' },
      { text: '2段目 6個', position: [3, 1.5, 1], kind: 'layer' },
      { text: '合計 14個', position: [1, 3, 1], kind: 'total' },
      { text: '1個目', position: [0, 1, 0], kind: 'cube' },
    ]);
    expect(onInfo).toHaveBeenLastCalledWith([
      { text: '合計 14個', kind: 'total' },
      { text: '2段目 6個', kind: 'layer' },
      { text: '1段目 8個', kind: 'layer' },
    ]);
    blocks.resetCounting();
    expect(onInfo).toHaveBeenLastCalledWith([]);
    blocks.dispose();
  });

  it('個数の文字が出る問題では、回答後に「図のみ表示」で文字を隠せる（押すと「文字も表示」）。次の問題では文字を表示に戻す', async () => {
    store.resetTrainingStore();
    const container = document.createElement('main');
    document.body.append(container);
    store.startTraining({ category: 'paintedCube', difficulty: 1, questionLimit: 3 }, { rng: createRng(4) });
    mountQuestionScreen(container, { navigate: vi.fn(), params: {} });
    const btn = () => [...container.querySelectorAll('button')].find((b) => b.textContent === '図のみ表示' || b.textContent === '文字も表示');
    expect(btn().hidden).toBe(true);
    const q = store.getSession().state.currentQuestion;
    for (const id of q.correctAnswers) container.querySelector(`[data-choice="${id}"]`).click();
    [...container.querySelectorAll('button')].find((b) => b.textContent === '回答する').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(btn().hidden).toBe(false);
    btn().click();
    expect(viewer.setFigureOnly).toHaveBeenLastCalledWith(true);
    expect(btn().textContent).toBe('文字も表示');
    btn().click();
    expect(viewer.setFigureOnly).toHaveBeenLastCalledWith(false);
    btn().click();
    [...container.querySelectorAll('button')].find((b) => b.textContent === '次の問題へ').click();
    expect(viewer.setFigureOnly).toHaveBeenLastCalledWith(false);
    expect(btn().textContent).toBe('図のみ表示');
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'スキップ')).toBe(false);
    container.remove();
  });
});

describe('1分チャレンジ・段位認定', () => {
  it('新しい2カテゴリは、1分チャレンジで遊べる（どの難易度でも問題が出る）', () => {
    for (const category of ['cubeCutting', 'surfacePath']) {
      for (const difficulty of [1, 2, 3, 'all']) {
        const session = new TimedChallengeSession({ category, templates: getTemplates(category), difficulty, rng: createRng(2), now: () => 0 });
        const q = session.nextQuestion();
        expect(q.category).toBe(category);
        if (difficulty !== 'all') expect(q.difficulty).toBe(difficulty);
      }
    }
  });

  it('1分チャレンジから外すテンプレートを決められる（rules.excludedTemplates）', () => {
    const rules = { ...CHALLENGE_RULES, excludedTemplates: ['K01'] };
    const session = new TimedChallengeSession({ category: 'cubeCutting', templates: getTemplates('cubeCutting'), difficulty: 1, rules, rng: createRng(1), now: () => 0 });
    for (let i = 0; i < 6; i++) {
      const q = session.nextQuestion();
      expect(q.templateId).toBe('K02');
      session.startAnswering?.();
      session.submit(q.correctAnswers);
    }
    expect(CHALLENGE_RULES.excludedTemplates).toEqual([]);
  });

  it('段位認定には、新しいカテゴリを自動では入れない（ルールも Phase 6 のまま）', () => {
    expect(CERTIFICATION_RULES.categories).toEqual(['netMapping', 'position', 'netPuzzle', 'dice', 'paintedCube', 'projection']);
    expect(CERTIFICATION_RULES.rulesVersion).toBe(3);
    expect(getCategory('cubeCutting').enabled).toBe(true);
    expect(getCategory('surfacePath').enabled).toBe(true);
  });
});
