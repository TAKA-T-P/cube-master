// @vitest-environment jsdom
// トレーニングの「1分チャレンジ」：進行（1分・不正解 −10 秒）・最高記録・設定画面・プレイ画面・結果画面
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../src/core/eventBus.js';
import { createRng } from '../src/utils/random.js';

vi.mock('../src/ui/answerSound.js', () => ({ playAnswerSound: vi.fn(), playFinishSound: vi.fn(), playRankUpSound: vi.fn(), playTimeUpSound: vi.fn(), playCountdownSound: vi.fn() }));
vi.mock('../src/three/cubeViewer.js', () => ({
  FACE_DISPLAY_MODES: { OPAQUE: 'opaque', TRANSLUCENT: 'translucent', WIREFRAME: 'wireframe' },
  createCubeViewer: () => globalThis.__createFakeViewer(),
}));

const { TimedChallengeSession, CHALLENGE_RULES: R } = await import('../src/core/timedChallengeSession.js');
const { createEmptyHistory, recordChallengeResult, getChallengeBest, normalizeHistory, recordTrainingResult } = await import('../src/core/learningHistory.js');
const { getTemplates } = await import('../src/questions/questionRegistry.js');
const { mountTrainingSetupScreen } = await import('../src/ui/trainingSetupScreen.js');
const { mountChallengeQuestionScreen } = await import('../src/ui/challengeQuestionScreen.js');
const { mountChallengeResultScreen } = await import('../src/ui/challengeResultScreen.js');
const store = await import('../src/ui/trainingStore.js');
const learning = await import('../src/ui/learningStore.js');
const { answerSplash } = await import('../src/ui/answerSplash.js');
const { createMemoryBackend } = await import('../src/core/storageManager.js');
const { getQuestionErrors } = await import('../src/core/questionSchema.js');

answerSplash.duration = 0;

globalThis.__createFakeViewer = () => ({
  events: createEventBus(),
  animations: { cancel: vi.fn(), skip: vi.fn(), setSpeed: vi.fn() },
  ...Object.fromEntries(
    ['setSelectionEnabled', 'setFaceDisplayMode', 'clearHighlights', 'clearSelection', 'highlightElements', 'setCameraPreset', 'resetCamera', 'dispose', 'setFaceDecorations', 'setCubeOrientation', 'setLabelsVisible', 'enableRotation', 'disableRotation', 'enableZoom', 'disableZoom', 'setBlocks', 'setNet', 'playNetFold', 'setSubcubes', 'playSubcubeSeparation'].map((k) => [k, vi.fn()]),
  ),
  playAnswerReveal: vi.fn(() => Promise.resolve({ status: 'completed' })),
  playQuestionReveal: vi.fn(() => Promise.resolve({ status: 'completed' })),
  getNetFold: vi.fn(() => 1),
  getSubcubeSeparation: vi.fn(() => 1),
});

function fakeClock(start = 1000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => (t += ms);
  return now;
}
const wrongOf = (q) => [q.choices.find((c) => !q.correctAnswers.includes(c.id)).id];

describe('1分チャレンジの進行', () => {
  it('1分間。選んだカテゴリ・難易度の問題が出て、不正解（部分正解をふくむ）は残り時間 −10 秒。正解数が記録になる', () => {
    expect(R.durationMs).toBe(60000);
    expect(R.mistakePenaltyMs).toBe(10000);
    const now = fakeClock();
    const s = new TimedChallengeSession({ category: 'dice', templates: getTemplates('dice'), difficulty: 2, rng: createRng(3), now });
    const q1 = s.nextQuestion();
    expect(s.timer.state).toBe('ready');
    s.startAnswering();
    now.advance(5000);
    expect(s.submit(q1.correctAnswers).isCorrect).toBe(true);
    expect(s.timer.getRemainingMs()).toBe(55000);
    now.advance(9000); // 答え合わせの間は止まっている
    const q2 = s.nextQuestion();
    s.startAnswering();
    now.advance(2000);
    expect(s.submit(wrongOf(q2)).isCorrect).toBe(false);
    expect(s.timer.getRemainingMs()).toBe(43000);
    expect(s.state.lastScore).toEqual({ penaltyMs: 10000 });
    for (const q of [q1, q2]) {
      expect(q.category).toBe('dice');
      expect(q.difficulty).toBe(2);
      expect(getQuestionErrors(q)).toEqual([]);
    }
    expect(s.useHint()).toBeNull();
    expect(s.pass()).toBeNull();
    const summary = s.finish();
    expect(summary).toMatchObject({ category: 'dice', difficulty: 2, correctCount: 1, answeredCount: 2, penaltyTotalMs: 10000, aborted: false });
  });

  it('時間切れ：回答中の問題は数えず、1分を過ぎた回答は受け付けない。ペナルティで 0 秒になれば終了', () => {
    const now = fakeClock();
    const s = new TimedChallengeSession({ category: 'position', templates: getTemplates('position'), difficulty: 1, rng: createRng(2), now });
    const q = s.nextQuestion();
    s.startAnswering();
    now.advance(60001);
    expect(s.submit(q.correctAnswers)).toBeNull();
    expect(s.isFinished).toBe(true);
    expect(s.getSummary().answeredCount).toBe(0);
    const t = new TimedChallengeSession({ category: 'position', templates: getTemplates('position'), difficulty: 1, rng: createRng(2), now });
    const q2 = t.nextQuestion();
    t.startAnswering();
    now.advance(55000);
    t.submit(wrongOf(q2));
    expect(t.timer.getRemainingMs()).toBe(0);
    expect(t.hasNextQuestion()).toBe(false);
    expect(t.nextQuestion()).toBeNull();
  });
});

describe('1分チャレンジの最高記録（学習記録）', () => {
  const summary = (difficulty, correctCount, extra = {}) => ({ category: 'dice', difficulty, correctCount, answeredCount: correctCount + 1, aborted: false, ...extra });

  it('難易度（基本・標準・応用・すべて）ごとに最高記録を残し、低い記録で下がらない。中断は記録しない', () => {
    let r = recordChallengeResult(createEmptyHistory(), summary(1, 7));
    expect(r).toMatchObject({ previousBest: 0, newBest: 7, improved: true });
    r = recordChallengeResult(r.history, summary(1, 5));
    expect(r).toMatchObject({ previousBest: 7, newBest: 7, improved: false });
    r = recordChallengeResult(r.history, summary('all', 4));
    r = recordChallengeResult(r.history, summary(3, 20, { aborted: true }));
    expect([1, 2, 3, 'all'].map((d) => getChallengeBest(r.history, 'dice', d))).toEqual([7, 0, 0, 4]);
    expect(r.history.categories.dice.challengeAttempts).toBe(3);
    // 通常の累計には入れない
    expect(r.history.categories.dice).toMatchObject({ answeredCount: 0, playedSessions: 0 });
  });

  it('前のバージョンの保存データ（1分チャレンジの記録がない）でも読み込める', () => {
    const old = recordTrainingResult(createEmptyHistory(), { category: 'dice', difficulty: 1, answeredCount: 2, correctCount: 1, history: [] });
    delete old.categories.dice.challengeBest;
    delete old.categories.dice.challengeAttempts;
    const loaded = normalizeHistory(JSON.parse(JSON.stringify(old)));
    expect(loaded.categories.dice.challengeBest).toEqual({ 1: 0, 2: 0, 3: 0, all: 0 });
    expect(loaded.categories.dice.answeredCount).toBe(2);
  });
});

// ---------------- 画面 ----------------
const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
let container;
let screens;
beforeEach(() => {
  vi.useFakeTimers();
  learning.configureLearningStorage(createMemoryBackend());
  store.resetTrainingStore();
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
  screens.push(fn(container, { navigate, params }));
  return navigate;
};

describe('設定画面：問題数を選ぶ ⇄ 1分チャレンジ', () => {
  it('同じ行に2つのボタン。問題数を選ぶではスライダー、1分チャレンジでは選んだ難易度の最高記録を出す', () => {
    learning.recordChallenge({ category: 'position', difficulty: 2, correctCount: 7, answeredCount: 9, aborted: false });
    const navigate = mount(mountTrainingSetupScreen, { category: 'position' });
    const modeGroup = container.querySelector('.setup-mode .segmented');
    expect([...modeGroup.children].map((b) => b.textContent)).toEqual(['問題数を選ぶ', '1分チャレンジ']);
    const slider = container.querySelector('input[type="range"]');
    const record = container.querySelector('[data-testid="challenge-record"]');
    expect(slider.closest('.setup-mode-panel').hidden).toBe(false);
    expect(record.closest('.setup-mode-panel').hidden).toBe(true);
    buttonByText(container, '1分チャレンジ').click();
    expect(slider.closest('.setup-mode-panel').hidden).toBe(true);
    expect(record.closest('.setup-mode-panel').hidden).toBe(false);
    expect(record.textContent).toBe('最高記録：まだありません'); // 「すべて」はまだ記録がない
    buttonByText(container, '標準').click();
    expect(record.textContent).toBe('最高記録：7問正解');
    buttonByText(container, 'スタート').click();
    expect(navigate).toHaveBeenCalledWith('challenge-play');
    expect(store.getChallengeSession()).toMatchObject({ category: 'position', difficulty: 2 });
    // 問題数を選ぶに戻すと、ふつうのトレーニング
    buttonByText(container, '問題数を選ぶ').click();
    buttonByText(container, 'スタート').click();
    expect(navigate).toHaveBeenLastCalledWith('question');
  });
});

describe('1分チャレンジの画面', () => {
  const COUNTDOWN = R.countdownMs + 500;
  const current = () => store.getChallengeSession().state.currentQuestion;
  function answer(correct) {
    const q = current();
    const ids = correct ? q.correctAnswers : wrongOf(q);
    for (const id of ids) container.querySelector(`[data-choice="${id}"]`).click();
    buttonByText(container, '回答する').click();
  }

  it('カウントダウンのあと1分。正解数を上に出し、不正解で −10 秒。パス・ヒントはない。時間切れで結果画面へ・最高記録を保存', async () => {
    store.startChallenge({ category: 'dice', difficulty: 1 }, { rng: createRng(5), now: () => Date.now() });
    const navigate = mount(mountChallengeQuestionScreen);
    expect(container.querySelector('.cert-countdown')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    expect(container.querySelector('[data-testid="cert-timer"]').textContent).toBe('60.0秒');
    expect(buttonByText(container, 'パス')).toBeUndefined();
    expect(buttonByText(container, 'ヒントを見る').hidden).toBe(true);
    answer(true);
    expect(container.querySelector('[data-testid="challenge-correct"]').textContent).toBe('1問正解');
    await vi.advanceTimersByTimeAsync(R.revealMaxMs + R.advanceDelayMs + 50);
    const before = store.getChallengeSession().timer.getRemainingMs();
    answer(false);
    expect(store.getChallengeSession().timer.getRemainingMs()).toBe(before - 10000);
    expect(container.querySelector('.cert-timer__bonus').textContent).toBe('−10秒');
    expect(container.querySelector('.feedback__detail').textContent).toContain('残り時間 −10秒');
    await vi.advanceTimersByTimeAsync(R.revealMaxMs + R.advanceDelayMs + 50);
    await vi.advanceTimersByTimeAsync(60000);
    expect(container.querySelector('.cert-timeup')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1400);
    expect(navigate).toHaveBeenCalledWith('challenge-result');
    expect(learning.getChallengeBest('dice', 1)).toBe(1);

    const nav = mount(mountChallengeResultScreen);
    expect(container.querySelector('[data-testid="challenge-result-correct"]').textContent).toBe('1');
    expect(container.querySelector('[data-testid="challenge-best-updated"]').textContent).toBe('自己ベスト更新！');
    const grid = container.querySelector('.result-grid-actions');
    expect([...grid.children].map((b) => b.textContent)).toEqual(['もう一度挑戦', '設定を変更', 'カテゴリ選択', 'タイトルへ']);
    buttonByText(container, '間違えた問題を復習（1問）').click();
    expect(nav).toHaveBeenCalledWith('question', { review: 'challenge' });
    buttonByText(container, 'もう一度挑戦').click();
    expect(nav).toHaveBeenLastCalledWith('challenge-play');
  });

  it('タブを切りかえると中断し、記録に残さない。設定画面にお知らせを出す', async () => {
    store.startChallenge({ category: 'dice', difficulty: 1 }, { rng: createRng(5), now: () => Date.now() });
    const navigate = mount(mountChallengeQuestionScreen);
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    answer(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
    expect(navigate).toHaveBeenCalledWith('setup', { category: 'dice' });
    expect(learning.getChallengeBest('dice', 1)).toBe(0);
    mount(mountTrainingSetupScreen, { category: 'dice' });
    expect(container.querySelector('.cert-notice').textContent).toContain('中断');
    // 前回が1分チャレンジなら、1分チャレンジが選ばれた状態
    expect(buttonByText(container, '1分チャレンジ').getAttribute('aria-pressed')).toBe('true');
  });
});
