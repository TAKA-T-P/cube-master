// @vitest-environment jsdom
// 段位認定の画面の結線（3D ビューアはモック。時計とタイマーは偽物にして、時間の進み方を確かめる）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '../src/core/eventBus.js';
import { createRng } from '../src/utils/random.js';

vi.mock('../src/ui/answerSound.js', () => ({ playAnswerSound: vi.fn(), playFinishSound: vi.fn(), playRankUpSound: vi.fn(), playTimeUpSound: vi.fn(), playCountdownSound: vi.fn() }));
vi.mock('../src/three/cubeViewer.js', () => ({
  FACE_DISPLAY_MODES: { OPAQUE: 'opaque', TRANSLUCENT: 'translucent', WIREFRAME: 'wireframe' },
  createCubeViewer: () => globalThis.__createFakeViewer(),
}));

const { mountCertificationSetupScreen } = await import('../src/ui/certificationSetupScreen.js');
const { mountCertificationQuestionScreen } = await import('../src/ui/certificationQuestionScreen.js');
const { mountCertificationResultScreen, rankHeadline } = await import('../src/ui/certificationResultScreen.js');
const { mountCertificationRecordsScreen } = await import('../src/ui/certificationRecordsScreen.js');
const certStore = await import('../src/ui/certificationStore.js');
const learning = await import('../src/ui/learningStore.js');
const trainingStore = await import('../src/ui/trainingStore.js');
const { answerSplash } = await import('../src/ui/answerSplash.js');
const sounds = await import('../src/ui/answerSound.js');
const { createMemoryBackend } = await import('../src/core/storageManager.js');
const { CERTIFICATION_RULES: R, getRankLabel } = await import('../src/core/certificationRules.js');

answerSplash.duration = 0; // 「○△×」は出さずにすぐ結果へ（短い表示は answerSplash のテストで確かめている）

let viewer;
globalThis.__createFakeViewer = () => {
  viewer = {
    events: createEventBus(),
    animations: { cancel: vi.fn(), skip: vi.fn(), setSpeed: vi.fn() },
    setSelectionEnabled: vi.fn(),
    setFaceDisplayMode: vi.fn(),
    clearHighlights: vi.fn(),
    clearSelection: vi.fn(),
    highlightElements: vi.fn(),
    setCameraPreset: vi.fn(),
    resetCamera: vi.fn(),
    playAnswerReveal: vi.fn(() => Promise.resolve({ status: 'completed' })),
    playQuestionReveal: vi.fn(() => Promise.resolve({ status: 'completed' })),
    dispose: vi.fn(),
    setFaceDecorations: vi.fn(),
    setCubeOrientation: vi.fn(),
    setLabelsVisible: vi.fn(),
    enableRotation: vi.fn(),
    disableRotation: vi.fn(),
    enableZoom: vi.fn(),
    disableZoom: vi.fn(),
    setBlocks: vi.fn(),
    setNet: vi.fn(),
    getNetFold: vi.fn(() => 1),
    playNetFold: vi.fn(),
    setSubcubes: vi.fn(),
    getSubcubeSeparation: vi.fn(() => 1),
    playSubcubeSeparation: vi.fn(),
  };
  return viewer;
};

const buttonByText = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const session = () => certStore.getCertificationSession();
const current = () => session().state.currentQuestion;
/** 今の問題に答える */
function answer(root, correct = true) {
  const q = current();
  const ids = correct ? q.correctAnswers : [q.choices.find((c) => !q.correctAnswers.includes(c.id)).id];
  for (const id of ids) root.querySelector(`[data-choice="${id}"]`).click();
  buttonByText(root, '回答する').click();
  return q;
}

let container;
let screens;
let backend;
beforeEach(() => {
  vi.useFakeTimers();
  backend = createMemoryBackend();
  certStore.configureCertificationStorage(backend);
  learning.configureLearningStorage(backend);
  certStore.resetCertificationStore();
  trainingStore.resetTrainingStore();
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
/** 偽物の時計（Date.now は vi の偽タイマーで進む） */
const start = (level = 'basic') => certStore.startCertification(level, { rng: createRng(4), now: () => Date.now() });
const COUNTDOWN = R.countdownMs + 500;
/** 回答してから、自動で次の問題へ進むまで */
const AUTO_ADVANCE = R.revealMaxMs + R.advanceDelayMs + 50;

describe('レベル選択', () => {
  it('3レベルを選んでスタートできる。ルールと記録への入口がある', () => {
    const navigate = mount(mountCertificationSetupScreen);
    const levels = [...container.querySelectorAll('.cert-level')];
    expect(levels.map((b) => b.dataset.level)).toEqual(['basic', 'standard', 'expert']);
    expect(levels.map((b) => b.querySelector('.cert-level__name').textContent)).toEqual(['ベーシック', 'スタンダード', 'エキスパート']);
    expect(container.textContent).toContain('100秒で何問解ける？');
    expect(container.textContent).toContain('ヒントは使えません');
    expect(container.textContent).toContain('1回目は50点、2回目は100点');
    // 対象学年は書かない（ボタンを小さく）。スタートはエキスパートのすぐ下
    expect(container.textContent).not.toContain('小学生向け');
    expect(container.querySelector('.cert-levels').nextElementSibling.contains(buttonByText(container, 'スタート'))).toBe(true);
    levels[2].click();
    expect(levels[2].getAttribute('aria-pressed')).toBe('true');
    buttonByText(container, 'スタート').click();
    expect(navigate).toHaveBeenCalledWith('certification-play', { level: 'expert' });
    expect(session().level).toBe('expert');
    buttonByText(container, '段位・記録').click();
    expect(navigate).toHaveBeenCalledWith('certification-records');
  });
});

describe('100秒チャレンジ', () => {
  it('3・2・1・START! の間は問題を隠してタイマーは止まったまま。そのあと回答でき、ヒントは出ない', async () => {
    start();
    mount(mountCertificationQuestionScreen, { level: 'basic' });
    const countdown = container.querySelector('.cert-countdown');
    expect(countdown.textContent).toContain('3');
    expect(sounds.playCountdownSound.mock.calls).toEqual([[false]]); // 表示に合わせて効果音
    expect(session().timer.state).toBe('ready');
    await vi.advanceTimersByTimeAsync(R.countdownMs / 3);
    expect(countdown.textContent).toContain('2');
    expect(sounds.playCountdownSound).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync((R.countdownMs * 2) / 3);
    expect(countdown.textContent).toContain('START!');
    expect(sounds.playCountdownSound.mock.calls).toEqual([[false], [false], [false], [true]]);
    expect(session().timer.getRemainingMs()).toBe(R.durationMs); // まだ減らない
    await vi.advanceTimersByTimeAsync(600);
    expect(container.querySelector('.cert-countdown')).toBeNull();
    expect(session().timer.state).toBe('running');
    expect(buttonByText(container, 'ヒントを見る').hidden).toBe(true);
    expect(container.querySelector('.quiz-header').textContent).toContain('段位認定・ベーシック'); // プレイ形式がわかる
    // START! のあと 0.1 秒たったところ（制限時間 100 秒）
    expect(container.querySelector('[data-testid="cert-timer"]').textContent).toBe('99.9秒');
    await vi.advanceTimersByTimeAsync(2500);
    expect(container.querySelector('[data-testid="cert-timer"]').textContent).toBe('97.4秒');
  });

  it('回答するとタイマーが止まり、得点を表示して自動で次の問題へ。次の問題で再開する。連打で2回答えない', async () => {
    start();
    mount(mountCertificationQuestionScreen, { level: 'basic' });
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    await vi.advanceTimersByTimeAsync(4000);
    const q1 = answer(container, true);
    const afterAnswer = session().timer.getRemainingMs();
    expect(session().timer.state).toBe('paused');
    expect(container.querySelector('[data-testid="cert-score"]').textContent).toBe(`${R.points[q1.difficulty]}点`);
    expect(container.querySelector('.feedback__detail').textContent).toContain(`+${R.points[q1.difficulty]}点`);
    expect(viewer.animations.setSpeed).toHaveBeenCalledWith(R.revealSpeed); // 演出は速く
    expect(session().state.answeredCount).toBe(1);
    // 演出のあいだは時間が減らない（演出が終わってから少し待って、次の問題へ）
    await vi.advanceTimersByTimeAsync(R.advanceDelayMs - 50);
    expect(current()).toBe(q1);
    expect(session().timer.getRemainingMs()).toBe(afterAnswer);
    await vi.advanceTimersByTimeAsync(100);
    expect(current()).not.toBe(q1);
    expect(session().state.answerLocked).toBe(false);
    expect(session().timer.state).toBe('running');
    // 次の問題を表示した時刻から、また減りはじめる
    expect(afterAnswer - session().timer.getRemainingMs()).toBeLessThanOrEqual(50);
    // 誤答：減点（1回目は 50 点）。残り時間は減らない
    const before = session().timer.getRemainingMs();
    const scoreBefore = session().state.score.score;
    answer(container, false);
    expect(session().timer.getRemainingMs()).toBe(before);
    expect(session().state.score.score).toBe(scoreBefore - 50);
    expect(container.querySelector('.feedback__detail').textContent).toContain('−50点');
    // 「次の問題へ」を連打しても、1問だけ進む（回答も増えない）
    const n = session().questionNumber;
    buttonByText(container, '次の問題へ').click();
    buttonByText(container, '次の問題へ')?.click();
    buttonByText(container, '回答する').click(); // まだ選んでいないので回答にならない
    expect(session().questionNumber).toBe(n + 1);
    expect(session().state.answeredCount).toBe(2);
    await vi.advanceTimersByTimeAsync(AUTO_ADVANCE); // 前の問題の自動の進行は取り消されている
    expect(session().questionNumber).toBe(n + 1);
  });

  it('時間切れで TIME UP! を出して結果画面へ。回答中の問題は数えず、記録を保存する（トレーニングの記録は変わらない）', async () => {
    start('standard');
    const navigate = mount(mountCertificationQuestionScreen, { level: 'standard' });
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    answer(container, true);
    await vi.advanceTimersByTimeAsync(AUTO_ADVANCE);
    await vi.advanceTimersByTimeAsync(session().timer.getRemainingMs() - 4000); // 残り 5 秒より少ない
    expect(container.querySelector('.cert-final-count').hidden).toBe(false);
    expect(container.querySelector('.cert-timer').classList).toContain('cert-timer--final');
    await vi.advanceTimersByTimeAsync(5000);
    expect(container.querySelector('.cert-timeup').textContent).toBe('TIME UP！');
    expect(sounds.playTimeUpSound).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1400);
    expect(navigate).toHaveBeenCalledWith('certification-result');
    const { summary, outcome } = certStore.getCertificationResult();
    expect(summary).toMatchObject({ answeredCount: 1, correctCount: 1, aborted: false });
    expect(outcome.recorded).toBe(true);
    expect(certStore.getCertificationRecords().levels.standard.attempts).toBe(1);
    for (const c of R.categories) expect(learning.getLearningStats(c)).toBeNull(); // トレーニングの記録には入らない
  });

  it('タブを切りかえると中断し、記録に残さない。レベル選択にお知らせを出す', async () => {
    start();
    const navigate = mount(mountCertificationQuestionScreen, { level: 'basic' });
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    answer(container, true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
    expect(navigate).toHaveBeenCalledWith('certification');
    expect(certStore.getCertificationSession()).toBeNull();
    expect(certStore.getCertificationRecords().levels.basic.attempts).toBe(0);
    mount(mountCertificationSetupScreen);
    expect(container.querySelector('.cert-notice').textContent).toContain('中断');
  });

  it('「やめる」は確認してから中断（記録に残さない）。画面を離れても中断', async () => {
    start();
    let navigate = mount(mountCertificationQuestionScreen, { level: 'basic' });
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    buttonByText(container, 'やめる').click();
    buttonByText(document.querySelector('.dialog-backdrop'), 'やめる').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).toHaveBeenCalledWith('certification');
    expect(certStore.getCertificationRecords().levels.basic.attempts).toBe(0);
    // 戻る操作などで画面を離れた
    start();
    navigate = mount(mountCertificationQuestionScreen, { level: 'basic' });
    screens.pop().unmount();
    expect(certStore.getCertificationSession()).toBeNull();
    expect(certStore.getCertificationRecords().levels.basic.attempts).toBe(0);
  });

  it('挑戦がなければレベル選択へ戻す', () => {
    const navigate = mount(mountCertificationQuestionScreen, { level: 'basic' });
    expect(navigate).toHaveBeenCalledWith('certification');
  });
});

describe('結果発表・段位・記録', () => {
  /** 決めたスコアで挑戦を終える */
  function finishWith(level, correctCount) {
    const s = start(level);
    for (let i = 0; i < correctCount; i++) {
      const q = s.nextQuestion();
      s.startAnswering();
      s.submit(q.correctAnswers);
    }
    certStore.finishCertification();
    return certStore.getCertificationResult();
  }

  it('得点をカウントアップしてから段位を大きく表示する。タップで演出をとばせる。昇段と自己ベスト', async () => {
    const { summary } = finishWith('expert', 6);
    mount(mountCertificationResultScreen);
    const scoreEl = container.querySelector('[data-testid="cert-final-score"]');
    expect(scoreEl.textContent).toBe('0');
    expect(container.querySelector('[data-testid="cert-rank"]').hidden).toBe(true);
    container.querySelector('.cert-result').click(); // とばす
    expect(scoreEl.textContent).toBe(String(summary.score));
    const rank = container.querySelector('[data-testid="cert-rank"]');
    expect(rank.hidden).toBe(false);
    expect(rank.textContent).toBe(rankHeadline(summary.rankLevel, 'expert'));
    expect(rank.textContent).toMatch(/★ (認定|達成)！$/);
    expect(container.querySelector('[data-testid="cert-rankup"]').textContent).toBe(`昇段！ 初めての認定 → ${getRankLabel(summary.rankLevel, 'expert')}`);
    expect(container.querySelector('[data-testid="cert-best"]')).not.toBeNull();
    expect(sounds.playRankUpSound).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="cert-correct"]').textContent).toBe('6問（6問中）');
    expect(container.textContent).not.toContain('TIME UP');
    expect(container.textContent).toContain('多答問題ボーナス');
    expect(container.textContent).not.toContain('多答問題の時間ボーナス');
  });

  it('同じ段位なら昇段の演出は出さない。低い成績で最高段位は下がらない', () => {
    finishWith('basic', 8);
    const best = certStore.getCertificationRecords().levels.basic.bestRank;
    finishWith('basic', 2);
    mount(mountCertificationResultScreen);
    container.querySelector('.cert-result').click();
    expect(container.querySelector('[data-testid="cert-rankup"]')).toBeNull();
    expect(container.querySelector('[data-testid="cert-best"]')).toBeNull();
    expect(certStore.getCertificationRecords().levels.basic.bestRank).toBe(best);
  });

  it('「認定なし」・「十段 達成！」・「皆伝★ 認定！」の見出し', () => {
    expect(rankHeadline(0, 'basic')).toBe('認定なし');
    expect(rankHeadline(20, 'basic')).toBe('十段 達成！');
    expect(rankHeadline(21, 'expert')).toBe('皆伝★ 認定！');
    expect(rankHeadline(15, 'standard')).toBe('五段＋ 認定！');
  });

  it('結果画面のボタン：もう一度挑戦・レベルを変更・記録を見る・タイトルへ（正解数のすぐ上に2行×2列）・間違えた問題の復習', () => {
    const s = start('basic');
    const q = s.nextQuestion();
    s.startAnswering();
    s.submit([q.choices.find((c) => !q.correctAnswers.includes(c.id)).id]);
    certStore.finishCertification();
    const navigate = mount(mountCertificationResultScreen);
    const grid = container.querySelector('.cert-result__actions');
    expect([...grid.children].map((b) => b.textContent)).toEqual(['もう一度挑戦', 'レベルを変更', '記録を見る', 'タイトルへ']);
    expect(grid.nextElementSibling.querySelector('dt').textContent).toBe('正解数'); // 「正解数」のすぐ上
    buttonByText(container, '間違えた問題を復習（1問）').click();
    expect(navigate).toHaveBeenCalledWith('question', { review: 'cert' });
    expect(trainingStore.getReview()).toMatchObject({ kind: 'cert', total: 1 });
    buttonByText(container, 'レベルを変更').click();
    buttonByText(container, '記録を見る').click();
    buttonByText(container, 'タイトルへ').click();
    buttonByText(container, 'もう一度挑戦').click();
    expect(navigate).toHaveBeenCalledWith('certification-play', { level: 'basic' });
    expect(navigate.mock.calls.map((c) => c[0])).toEqual(['question', 'certification', 'certification-records', 'home', 'certification-play']);
  });

  it('段位・記録：レベルごとの最高段位（＋・★）・次の段位まで・21段階の一覧（獲得・未獲得）', () => {
    finishWith('standard', 5);
    const rec = certStore.getCertificationRecords().levels.standard;
    mount(mountCertificationRecordsScreen);
    const card = (l) => container.querySelector(`.cert-record[data-level="${l}"]`);
    expect(card('standard').querySelector('[data-testid="best-rank"]').textContent).toBe(getRankLabel(rec.bestRank, 'standard'));
    expect(card('standard').querySelector('[data-testid="best-rank"]').textContent.endsWith('＋')).toBe(true);
    expect(card('standard').querySelector('[data-testid="attempts"]').textContent).toBe('1回');
    expect(card('standard').querySelector('[data-testid="next-rank"]').textContent).toContain(`自己ベストとの差 ${R.levels.standard.thresholds[rec.bestRank] - rec.bestScore}点`);
    const items = card('standard').querySelectorAll('.cert-rank-list__item');
    expect(items).toHaveLength(21);
    expect([...items].filter((li) => li.textContent.includes('未獲得'))).toHaveLength(21 - rec.bestRank);
    expect(items[20].textContent).toContain('皆伝＋');
    expect(card('basic').querySelector('[data-testid="best-rank"]').textContent).toBe('認定なし');
    expect(card('expert').textContent).toContain('まだ記録がありません');
    expect(card('expert').querySelectorAll('.cert-rank-list__item')[10].textContent).toContain('初段★');
  });

  it('レベル選択に、最高段位とハイスコアを並べて表示する（挑戦していないレベルはハイスコアなし）', () => {
    finishWith('standard', 5);
    const rec = certStore.getCertificationRecords().levels.standard;
    mount(mountCertificationSetupScreen);
    const level = (l) => container.querySelector(`.cert-level[data-level="${l}"]`);
    expect(level('standard').querySelector('[data-testid="best-rank"]').textContent).toBe(`最高段位：${getRankLabel(rec.bestRank, 'standard')}`);
    expect(level('standard').querySelector('[data-testid="high-score"]').textContent).toBe(`ハイスコア：${rec.bestScore}点`);
    expect(level('basic').querySelector('[data-testid="best-rank"]').textContent).toBe('まだ段位がありません');
    expect(level('basic').querySelector('[data-testid="high-score"]')).toBeNull();
  });

  it('保存できない環境でも挑戦できる', () => {
    certStore.configureCertificationStorage(null);
    const { outcome } = finishWith('basic', 3);
    expect(outcome.rankUp).toBe(true);
    mount(mountCertificationRecordsScreen);
    expect(container.textContent).toContain('この端末では記録を保存できません');
  });
});

describe('多答問題の時間ボーナスの表示', () => {
  it('答えが複数ある問題に一発で正解すると「+3秒」を出し、残り時間が増える', async () => {
    start('basic');
    mount(mountCertificationQuestionScreen, { level: 'basic' });
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    // 多答問題が出るまで進める（1つの答えの問題は正解して次へ）
    for (let i = 0; i < 20 && current().type !== 'multiple'; i++) {
      answer(container, true);
      await vi.advanceTimersByTimeAsync(AUTO_ADVANCE);
    }
    expect(current().type).toBe('multiple');
    const before = session().timer.getRemainingMs();
    answer(container, true);
    expect(session().timer.getRemainingMs()).toBe(before + R.multipleAnswerTimeBonusMs);
    expect(container.querySelector('.cert-timer__bonus').textContent).toBe('+3秒');
    expect(container.querySelector('.feedback__detail').textContent).toContain('残り時間 +3秒');
  });
});

describe('パス', () => {
  it('「回答する」と同じ行の左にあり、幅は「回答する」より小さい。トレーニングには出ない', async () => {
    start('basic');
    mount(mountCertificationQuestionScreen, { level: 'basic' });
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    const row = container.querySelector('.quiz-actions');
    expect([...row.children].map((b) => b.textContent)).toEqual(['パス', '回答する']);
    expect(row.classList).toContain('quiz-actions--with-pass');
    expect(buttonByText(container, 'パス').disabled).toBe(false);
  });

  it('確認で「いいえ」なら同じ問題のまま。「はい」で問題が入れかわり、残り時間が 2×n 秒へる。確認中も時間は減る', async () => {
    start('basic');
    mount(mountCertificationQuestionScreen, { level: 'basic' });
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    const q1 = current();
    buttonByText(container, 'パス').click();
    let dialog = document.querySelector('.dialog-backdrop');
    expect(dialog.textContent).toContain('問題を入れかえますか？');
    expect(dialog.textContent).toContain('ペナルティ：残り時間 −2秒');
    const before = session().timer.getRemainingMs();
    await vi.advanceTimersByTimeAsync(1000); // 確認している間も減る
    expect(session().timer.getRemainingMs()).toBe(before - 1000);
    buttonByText(dialog, 'いいえ').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(current()).toBe(q1);
    // 1回目のパス
    buttonByText(container, 'パス').click();
    dialog = document.querySelector('.dialog-backdrop');
    const t0 = session().timer.getRemainingMs();
    buttonByText(dialog, 'はい').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(current()).not.toBe(q1);
    expect(session().timer.state).toBe('running'); // 新しい問題で再開
    expect(t0 - session().timer.getRemainingMs()).toBeGreaterThanOrEqual(2000);
    expect(t0 - session().timer.getRemainingMs()).toBeLessThan(2100);
    expect(container.querySelector('.cert-timer__bonus').textContent).toBe('−2秒');
    expect(session().state.answeredCount).toBe(0);
    // 2回目のパスは 4 秒
    buttonByText(container, 'パス').click();
    expect(document.querySelector('.dialog-backdrop').textContent).toContain('ペナルティ：残り時間 −4秒');
    buttonByText(document.querySelector('.dialog-backdrop'), 'はい').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(session().getSummary()).toMatchObject({ passCount: 2, passPenaltyTotalMs: 6000 });
  });

  it('回答したあとはパスできない（ボタンは押せない）', async () => {
    start('basic');
    mount(mountCertificationQuestionScreen, { level: 'basic' });
    await vi.advanceTimersByTimeAsync(COUNTDOWN);
    answer(container, true);
    expect(buttonByText(container, 'パス').disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTO_ADVANCE);
    expect(buttonByText(container, 'パス').disabled).toBe(false);
  });
});
