// @vitest-environment jsdom
// トライアルの画面：タイトルのメニュー・選択・ルール説明・プレイ（カウントダウン・LEVEL・タイマー・○×・答え合わせ・次の問題・TIME UP）・結果・中断・入力の部品
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../src/core/eventBus.js';
import { createRng } from '../src/utils/random.js';

vi.mock('../src/ui/answerSound.js', () => ({ playAnswerSound: vi.fn(), playFinishSound: vi.fn(), playRankUpSound: vi.fn(), playTimeUpSound: vi.fn(), playCountdownSound: vi.fn(), playClickSound: vi.fn() }));
vi.mock('../src/three/cubeViewer.js', () => ({
  FACE_DISPLAY_MODES: { OPAQUE: 'opaque', TRANSLUCENT: 'translucent', WIREFRAME: 'wireframe' },
  createCubeViewer: () => globalThis.__createFakeViewer(),
}));
vi.mock('../src/three/trial/trialNetViewer.js', () => ({ createTrialNetViewer: () => globalThis.__createFakeNetViewer() }));
vi.mock('../src/ui/homeCube.js', () => ({ createHomeCube: () => ({ el: document.createElement('div'), destroy: () => {} }) }));

const store = await import('../src/ui/trial/trialStore.js');
const { mountTrialSelectScreen, mountTrialSetupScreen } = await import('../src/ui/trial/trialSelectScreen.js');
const { mountTrialPlayScreen } = await import('../src/ui/trial/trialPlayScreen.js');
const { mountTrialResultScreen } = await import('../src/ui/trial/trialResultScreen.js');
const { mountHomeScreen } = await import('../src/ui/homeScreen.js');
const { createGridPainter } = await import('../src/ui/trial/gridPainter.js');
const { createNumberInput } = await import('../src/ui/trial/numberInput.js');
const { TRIAL_RULES } = await import('../src/core/trial/trialRules.js');
const { expectedGrid } = await import('../src/core/trial/projectionTrial.js');
const { answerSplash } = await import('../src/ui/answerSplash.js');
const { createMemoryBackend } = await import('../src/core/storageManager.js');
const learning = await import('../src/ui/learningStore.js');
const certStore = await import('../src/ui/certificationStore.js');

answerSplash.duration = 0;

let viewer;
globalThis.__createFakeViewer = () => {
  viewer = {
    events: createEventBus(),
    animations: { cancel: vi.fn(), skip: vi.fn(), setSpeed: vi.fn() },
    ...Object.fromEntries(['setSelectionEnabled', 'setFaceDisplayMode', 'clearHighlights', 'setFaceDecorations', 'setCubeOrientation', 'setLabelsVisible', 'setCameraPreset', 'setBlocks', 'setNet', 'dispose'].map((k) => [k, vi.fn()])),
    playQuestionReveal: vi.fn(() => Promise.resolve({ status: 'completed' })),
  };
  return viewer;
};
let netViewer;
globalThis.__createFakeNetViewer = () => {
  netViewer = { set: vi.fn(), play: vi.fn(() => Promise.resolve()), skip: vi.fn(), seek: vi.fn(), dispose: vi.fn() };
  return netViewer;
};

const COUNTDOWN = TRIAL_RULES.countdownMs + 500; // 3・2・1・START! のあと、回答できるようになるまで
const AFTER_ANSWER = TRIAL_RULES.advanceDelayMs + 800;
const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const pointer = (el, type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true }));

let container;
let screens;
let backend;
beforeEach(() => {
  backend = createMemoryBackend();
  store.configureTrialStorage(backend);
  store.resetTrialStore();
  learning.configureLearningStorage(createMemoryBackend());
  container = document.createElement('main');
  document.body.append(container);
  screens = [];
});
afterEach(() => {
  for (const s of screens) s.unmount();
  container.remove();
  document.body.replaceChildren();
  vi.useRealTimers();
});
const mount = (fn, params) => {
  container.replaceChildren();
  const navigate = vi.fn();
  screens.push(fn(container, { navigate, params, version: 'test' }));
  return navigate;
};
const current = () => store.getTrialSession().state.currentQuestion;

/** 今の問題に答える（入力の部品を操作する） */
function answer({ correct = true } = {}) {
  const q = current();
  if (q.mode === 'blockCount') {
    for (const d of String(correct ? q.answer : q.answer + 1)) key(d);
    key('Enter');
  } else if (q.mode === 'diceRoll') {
    // 目のボタンを押すと、すぐに回答する
    container.querySelector(`.trial-dice__btn[data-value="${correct ? q.answer : (q.answer % 6) + 1}"]`).click();
  } else if (q.mode === 'projectionDraw') {
    const grid = expectedGrid(q, 0);
    if (!correct) {
      // まちがい：正しい形から1マス足りない
      const r = grid.findIndex((row) => row.some(Boolean));
      grid[r][grid[r].indexOf(true)] = false;
    }
    grid.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v) return;
        const el = container.querySelector(`.trial-cell[data-r="${r}"][data-c="${c}"]`);
        pointer(el, 'pointerdown');
        pointer(el, 'pointerup');
      }),
    );
    buttonByText(container, '決定').click();
  } else if (q.mode === 'netPartition') {
    for (const cell of q.cells) {
      const color = correct ? q.solution[cell.id] : 0;
      container.querySelector(`.trial-palette__color[data-color="${color}"]`).click();
      const el = container.querySelector(`.trial-cell[data-r="${cell.y}"][data-c="${cell.x}"]`);
      pointer(el, 'pointerdown');
      pointer(el, 'pointerup');
    }
    buttonByText(container, '決定').click();
  }
}

describe('タイトル・選択・ルール説明', () => {
  it('タイトルのメニューのいちばん上に「トライアル」。トレーニングは「ドリルモード」', () => {
    const navigate = mount(mountHomeScreen);
    expect([...container.querySelectorAll('[data-menu]')].map((b) => b.textContent)).toEqual(['トライアル', 'ドリルモード', '段位認定', '3D立方体をためす', 'あそびかた']);
    container.querySelector('[data-menu="trial"]').click();
    expect(navigate).toHaveBeenCalledWith('trial');
  });

  it('4種類のカード（名前・説明・絵・最高到達 LEVEL・挑戦する）。記録はモードごと', () => {
    backend.setItem('cubeMaster:trial', JSON.stringify({ version: 1, modes: { diceRoll: { bestLevel: 15, attempts: 8 } } }));
    store.configureTrialStorage(backend);
    const navigate = mount(mountTrialSelectScreen);
    const cards = [...container.querySelectorAll('.trial-card')];
    expect(cards.map((c) => c.querySelector('.trial-card__name').textContent)).toEqual(['積み木の数はいくつ？', '3方向から見ると？', 'サイコロを転がすと？', '展開図に分けろ！']);
    expect(cards.map((c) => c.querySelector('[data-testid="trial-best"]').textContent)).toEqual(['まだ記録がありません', 'まだ記録がありません', '最高到達 LEVEL 15', 'まだ記録がありません']);
    for (const c of cards) expect(c.querySelector('.trial-card__icon svg')).not.toBeNull();
    buttonByText(cards[3], '挑戦する').click();
    expect(navigate).toHaveBeenCalledWith('trial-setup', { mode: 'netPartition' });
  });

  it('種類ごとのルール説明と自己ベスト。スタートで挑戦が始まる（まだタイマーは動かない）', () => {
    const navigate = mount(mountTrialSetupScreen, { mode: 'netPartition' });
    // 種類ごとのルールだけ（4種類に共通の LEVEL の説明は出さない）
    expect(container.textContent).toContain('LEVEL +2');
    expect(container.textContent).not.toContain('LEVEL 1 からスタート');
    expect(container.querySelectorAll('.trial-setup__rules')).toHaveLength(1);
    expect(container.querySelector('[data-testid="trial-best"]').textContent).toBe('自己ベスト：まだ記録がありません');
    buttonByText(container, 'スタート').click();
    expect(navigate).toHaveBeenCalledWith('trial-play');
    expect(store.getTrialSession()).toMatchObject({ mode: 'netPartition' });
    expect(store.getTrialSession().timer.state).toBe('ready');
    // ない種類は選択画面へ
    expect(mount(mountTrialSetupScreen, { mode: 'nope' })).toHaveBeenCalledWith('trial');
  });
});

describe('プレイ画面', () => {
  beforeEach(() => vi.useFakeTimers());

  it.each(['blockCount', 'projectionDraw', 'diceRoll', 'netPartition'])('%s：カウントダウン → 回答 → ○×・LEVEL・正しい答えの演出（タイマー停止）→ 次の問題で再開', async (mode) => {
    store.startTrial(mode, { rng: createRng(3), now: () => Date.now() });
    mount(mountTrialPlayScreen);
    const session = store.getTrialSession();
    expect(container.querySelector('.cert-countdown')).not.toBeNull();
    expect(container.querySelector('[data-testid="trial-level"]').textContent).toBe('LEVEL 1');
    expect(container.querySelector('.trial-stars').textContent).toBe('★');
    // 上の帯に「最高 LEVEL」は出さない
    expect(container.querySelector('[data-testid="trial-highest"]')).toBeNull();
    expect(container.querySelector('.trial-play__header').textContent).not.toContain('最高');
    expect(session.timer.state).toBe('ready');
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    expect(session.timer.state).toBe('running');
    expect(container.querySelector('[data-testid="trial-question"]').textContent).not.toBe('');
    await vi.advanceTimersByTimeAsync(2000);
    // 正解
    answer({ correct: true });
    const gain = mode === 'netPartition' ? 2 : 1;
    expect(session.timer.state).toBe('paused');
    const remaining = session.timer.getRemainingMs();
    expect(remaining).toBe(88000);
    await vi.advanceTimersByTimeAsync(0);
    expect(container.querySelector('.trial-feedback__title').textContent).toBe('正解！');
    expect(container.querySelector('.trial-feedback__level').textContent).toBe(`LEVEL 1 → ${1 + gain}（+${gain}）`);
    expect(container.querySelector('[data-testid="trial-level"]').textContent).toBe(`LEVEL ${1 + gain}`);
    if (mode === 'netPartition') expect(netViewer.play).toHaveBeenCalled();
    else expect(viewer.playQuestionReveal).toHaveBeenCalled();
    // 演出の間は時間が減らない
    await vi.advanceTimersByTimeAsync(400);
    expect(session.timer.getRemainingMs()).toBe(remaining);
    await vi.advanceTimersByTimeAsync(AFTER_ANSWER);
    expect(session.state.answerLocked).toBe(false);
    expect(session.timer.state).toBe('running');
    expect(container.querySelector('.trial-feedback').hidden).toBe(true);
    // 不正解でも正しい答えの演出があり、LEVEL −1
    answer({ correct: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(container.querySelector('.trial-feedback__title').textContent).toBe('不正解');
    expect(container.querySelector('[data-testid="trial-level"]').textContent).toBe(`LEVEL ${gain}`);
    expect(store.getTrialSession().highestLevel).toBe(1 + gain);
    expect(container.querySelector('.trial-feedback__answer').textContent).not.toBe('');
  });

  it('「次の問題へ」で演出を待たずに進める。連打しても2回進まない', async () => {
    store.startTrial('diceRoll', { rng: createRng(4), now: () => Date.now() });
    mount(mountTrialPlayScreen);
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    const first = current();
    answer();
    await vi.advanceTimersByTimeAsync(0);
    const next = buttonByText(container, '次の問題へ');
    next.click();
    next.click();
    expect(current()).not.toBe(first);
    expect(current().number).toBe(2);
    expect(store.getTrialSession().timer.state).toBe('running');
  });

  it('90秒で TIME UP。結果画面へ進み、自己ベストを保存する（ほかの記録は変わらない）', async () => {
    store.startTrial('blockCount', { rng: createRng(5), now: () => Date.now() });
    const navigate = mount(mountTrialPlayScreen);
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    answer();
    await vi.advanceTimersByTimeAsync(TRIAL_RULES.revealMaxMs + AFTER_ANSWER);
    answer();
    await vi.advanceTimersByTimeAsync(TRIAL_RULES.revealMaxMs + AFTER_ANSWER);
    await vi.advanceTimersByTimeAsync(TRIAL_RULES.durationMs);
    expect(container.querySelector('.cert-timeup').textContent).toBe('TIME UP！');
    await vi.advanceTimersByTimeAsync(1500);
    expect(navigate).toHaveBeenCalledWith('trial-result');
    const saved = JSON.parse(backend.getItem('cubeMaster:trial'));
    expect(saved.modes.blockCount).toMatchObject({ bestLevel: 3, attempts: 1 });
    expect(saved.modes.diceRoll).toMatchObject({ bestLevel: 0, attempts: 0 });
    // トレーニング・段位認定の記録には入らない
    expect(learning.getLearningStats('paintedCube')).toBeNull();
    expect(backend.getItem('cubeMaster:certification')).toBeNull();
    expect(typeof certStore.getCertificationResult).toBe('function');
  });

  it('タブを切りかえると中断（記録しない）。やめるも中断', async () => {
    store.startTrial('diceRoll', { rng: createRng(6), now: () => Date.now() });
    const navigate = mount(mountTrialPlayScreen);
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    answer();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    expect(navigate).toHaveBeenCalledWith('trial-setup', { mode: 'diceRoll' });
    expect(store.getTrialSession()).toBeNull();
    expect(backend.getItem('cubeMaster:trial')).toBeNull();
    expect(store.takeTrialNotice()).toContain('中断');
  });

  it('時間切れのあとは回答できない', async () => {
    store.startTrial('blockCount', { rng: createRng(7), now: () => Date.now() });
    mount(mountTrialPlayScreen);
    await vi.advanceTimersByTimeAsync(COUNTDOWN + TRIAL_RULES.durationMs + 200);
    const session = store.getTrialResult();
    expect(session.summary.answeredCount).toBe(0);
    for (const d of '12') key(d);
    key('Enter');
    expect(store.getTrialResult().summary.answeredCount).toBe(0);
  });
});

describe('サイコロの目のボタン', () => {
  beforeEach(() => vi.useFakeTimers());

  it('1〜6 のボタンを押した時点で回答する（「決定」ボタンはない）。キーボードの数字でも回答できる', async () => {
    store.startTrial('diceRoll', { rng: createRng(11), now: () => Date.now() });
    mount(mountTrialPlayScreen);
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    expect(buttonByText(container, '決定')).toBeUndefined();
    const session = store.getTrialSession();
    const q = current();
    container.querySelector(`.trial-dice__btn[data-value="${q.answer}"]`).click();
    expect(session.state.answeredCount).toBe(1);
    expect(session.state.lastResult.isCorrect).toBe(true);
    // 回答したあとは押せない（二重に回答しない）
    container.querySelector('.trial-dice__btn[data-value="1"]').click();
    expect(session.state.answeredCount).toBe(1);
    expect(container.querySelector(`.trial-dice__btn[data-value="${q.answer}"]`).getAttribute('aria-checked')).toBe('true');
    await vi.advanceTimersByTimeAsync(TRIAL_RULES.revealMaxMs + AFTER_ANSWER);
    const q2 = current();
    key(String((q2.answer % 6) + 1));
    expect(session.state.answeredCount).toBe(2);
    expect(session.state.lastResult.isCorrect).toBe(false);
  });
});

describe('結果画面', () => {
  it('いちばん大きく最高到達 LEVEL（終了時の LEVEL は出さない）・正解数・不正解数・自己ベスト更新。もう一度・別のトライアル・タイトルへ', () => {
    const now = () => 0;
    const session = store.startTrial('diceRoll', { rng: createRng(8), now });
    for (const ok of [true, true, true, false, false]) {
      const q = session.nextQuestion();
      session.startAnswering();
      session.submit(ok ? q.answer : (q.answer % 6) + 1);
    }
    store.finishTrial();
    const navigate = mount(mountTrialResultScreen);
    expect(container.querySelector('[data-testid="trial-result-level"]').textContent).toBe('LEVEL 4');
    expect(container.textContent).not.toContain('LEVEL 2');
    expect(container.querySelector('[data-testid="trial-correct"]').textContent).toBe('3問');
    expect(container.querySelector('[data-testid="trial-incorrect"]').textContent).toBe('2問');
    expect(container.querySelector('[data-testid="trial-best-updated"]').textContent).toBe('自己ベスト更新！');
    buttonByText(container, '別のトライアル').click();
    expect(navigate).toHaveBeenCalledWith('trial');
    buttonByText(container, 'タイトルへ').click();
    expect(navigate).toHaveBeenCalledWith('home');
    buttonByText(container, 'もう一度挑戦').click();
    expect(navigate).toHaveBeenCalledWith('trial-play');
    expect(store.getTrialSession().mode).toBe('diceRoll');
  });
});

describe('入力の部品', () => {
  it('テンキー：数字・1文字消す・全消去。何も入れていないと決定できない。キーボードでも入力できる', () => {
    const onSubmit = vi.fn();
    const input = createNumberInput({ unit: '個', onSubmit });
    container.append(input.el);
    const submit = buttonByText(container, '決定');
    expect(submit.disabled).toBe(true);
    container.querySelector('[data-key="1"]').click();
    container.querySelector('[data-key="2"]').click();
    expect(input.getValue()).toBe('12');
    expect(container.querySelector('[data-testid="number-display"]').textContent).toBe('12個');
    container.querySelector('[data-key="⌫"]').click();
    expect(input.getValue()).toBe('1');
    container.querySelector('[data-key="全消去"]').click();
    expect(input.getValue()).toBe('');
    key('Enter');
    expect(onSubmit).not.toHaveBeenCalled();
    key('3');
    key('0');
    key('Backspace');
    key('5');
    key('Enter');
    expect(onSubmit).toHaveBeenCalledWith('35');
    input.destroy();
  });

  it('マス目：押した最初のマスで塗る／消すを決め、なぞっている間は同じ操作。同じマスを通っても反転しない', () => {
    const painter = createGridPainter({
      rows: 2,
      cols: 3,
      initial: () => false,
      resolve: (v) => !v,
      render: (el, v) => el.classList.toggle('on', v),
    });
    container.append(painter.el);
    const cell = (r, c) => container.querySelector(`.trial-cell[data-r="${r}"][data-c="${c}"]`);
    pointer(cell(0, 0), 'pointerdown');
    pointer(cell(0, 1), 'pointermove');
    pointer(cell(0, 0), 'pointermove'); // もう一度通っても消えない
    pointer(cell(0, 1), 'pointermove');
    pointer(cell(0, 1), 'pointerup');
    expect(painter.getValues()).toEqual([[true, true, false], [false, false, false]]);
    // 塗ってあるマスから始めると、消す操作になる
    pointer(cell(0, 1), 'pointerdown');
    pointer(cell(0, 2), 'pointermove'); // 白いマスを通っても塗らない
    pointer(cell(0, 0), 'pointermove');
    pointer(cell(0, 0), 'pointerup');
    expect(painter.getValues()).toEqual([[false, false, false], [false, false, false]]);
  });

  it('展開図：同じ色で7マス目はぬれず、お知らせを出す。消しゴムで消せる', async () => {
    vi.useFakeTimers();
    store.startTrial('netPartition', { rng: createRng(9), now: () => Date.now() });
    mount(mountTrialPlayScreen);
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    const q = current();
    const paint = (cell) => {
      const el = container.querySelector(`.trial-cell[data-r="${cell.y}"][data-c="${cell.x}"]`);
      pointer(el, 'pointerdown');
      pointer(el, 'pointerup');
      return el;
    };
    container.querySelector('.trial-palette__color[data-color="0"]').click();
    const els = q.cells.slice(0, 7).map(paint);
    expect(els.slice(0, 6).every((el) => el.classList.contains('trial-cell--on'))).toBe(true);
    expect(els[6].classList.contains('trial-cell--on')).toBe(false);
    expect(container.querySelector('.trial-notice').textContent).toContain('6マスまで');
    expect(container.querySelector('.trial-palette__color[data-color="0"] .trial-palette__count').textContent).toBe('6/6');
    container.querySelector('.trial-palette__eraser').click();
    paint(q.cells[0]);
    expect(els[0].classList.contains('trial-cell--on')).toBe(false);
    expect(container.querySelector('.trial-palette__color[data-color="0"] .trial-palette__count').textContent).toBe('5/6');
  });
});
