/**
 * 制限時間のある挑戦の画面（段位認定・トレーニングの1分チャレンジで共通）
 *
 * 問題の表示・回答・3D の演出は、トレーニングと同じ問題画面（ui/questionScreen）を時間制のモードで使う。
 * この画面はその上に、カウントダウン（3・2・1・START!）・タイマー・得点・「最終問題」・「時間切れ」を重ねる。
 *
 * ロスタイム：残り 0 秒になっても、そのときの問題（最終問題）は続けられる。答えたら（正解でも不正解でも）すぐ結果画面へ、
 * 答えないままロスタイム（15 秒）が過ぎたら「時間切れ」を 1 秒出してから結果画面へ進む。
 * ペナルティ・パスで残り 0 秒になったときは、その時点で「時間切れ」を出して終了する。
 *
 * タイマーは core/certificationTimer（単調に増える時計で、回答できる時間だけを数える）。画面の表示は 0.1 秒ごとに更新するだけで、
 * 時間の計算には使わない。タブを切りかえる・画面を離れると中断し、記録には残さない。
 */
import { h } from '../utils/dom.js';
import { confirmDialog } from './components.js';
import { mountQuestionScreen } from './questionScreen.js';
import { playTimeUpSound, playCountdownSound } from './answerSound.js';

const TICK_MS = 100;
/** 「時間切れ」を出しておく時間 */
export const TIME_UP_MS = 1000;

/** 残り時間の表示（「72.4秒」） */
export const formatSeconds = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}秒`;

/**
 * @param {HTMLElement} container
 * @param {{
 *   navigate: Function,
 *   session: object,                 // timer・startAnswering・checkTimeUp などを持つ進行（core/certificationSession・core/timedChallengeSession）
 *   label: string,                   // カウントダウンと上の帯に出す名前（「ベーシック」「1分チャレンジ・基本」）
 *   timing: { durationMs, countdownMs, splashMs, revealSpeed, revealMaxMs, advanceDelayMs },
 *   scoreView: { items: HTMLElement[], update: () => void },   // 上の帯の得点表示
 *   scoreText?: () => string,        // 回答後に出す短い文（「+160点」「残り時間 −10秒」）
 *   timeChange?: () => ({ text, kind }|null),                   // 回答後にタイマーの横に出す時間の増減
 *   allowPass?: boolean,             // パス（段位認定だけ）
 *   onPassed?: (passed) => void,
 *   finish: () => void,              // 最後まで終えた（記録する）
 *   resultRoute: string,             // 終わったあとの画面
 *   abort: (notice: string|null) => void,   // 中断（記録しない）
 *   quitRoute: string,               // 中断したあとの画面
 *   texts: { quitTitle, quitMessage, hiddenNotice, leaveNotice },
 * }} options
 */
export function mountTimedPlayScreen(container, options) {
  const { navigate, session, label, timing, scoreView, texts } = options;

  let countdownDone = false;
  let pendingStart = false;
  let ended = false; // 時間切れ・中断・終了（このあとは何もしない）
  let tickTimer = null;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  // ---------- 上の帯（タイマー・得点） ----------
  const timeEl = h('span', { class: 'cert-timer__value', 'data-testid': 'cert-timer' }, formatSeconds(timing.durationMs));
  const timeBonusEl = h('span', { class: 'cert-timer__bonus', 'aria-hidden': 'true' });
  const timerEl = h('div', { class: 'cert-timer', role: 'timer', 'aria-label': '残り時間' }, h('span', { class: 'cert-timer__label' }, '残り'), timeEl, timeBonusEl);
  const labelEl = h('span', { class: 'badge badge--info' }, label);
  const finalCount = h('div', { class: 'cert-final-count cert-final-count--corner', 'aria-hidden': 'true', hidden: true });

  /** タイマーの横に、増えた・減った時間を少しの間だけ出す */
  const flashTime = (text, kind) => {
    timeBonusEl.textContent = text;
    timeBonusEl.classList.toggle('cert-timer__bonus--penalty', kind === 'penalty');
    timeBonusEl.classList.remove('cert-timer__bonus--show');
    void timeBonusEl.offsetWidth; // アニメーションをやり直す
    timeBonusEl.classList.add('cert-timer__bonus--show');
  };

  const updateTimer = () => {
    const ms = session.timer.getRemainingMs();
    timeEl.textContent = formatSeconds(ms);
    timerEl.classList.toggle('cert-timer--warn', ms <= 10000);
    timerEl.classList.toggle('cert-timer--final', ms <= 5000);
    // 残り 5 秒からはカウントダウン、0 秒からは「最終問題」（回答できる間だけ。図の左上に小さく）
    const running = session.timer.state === 'running';
    const final = !ended && Boolean(session.isFinalQuestion);
    const text = final ? '最終問題' : String(Math.ceil(ms / 1000));
    finalCount.hidden = !(final || (running && ms > 0 && ms <= 5000));
    finalCount.classList.toggle('cert-final-count--last', final);
    if (!finalCount.hidden && finalCount.textContent !== text) finalCount.textContent = text;
    if (!finalCount.hidden) placeFinalCount();
    if (final) screen?.markFinal?.();
  };

  // ---------- 問題画面（時間制のモード） ----------
  const mode = {
    kind: 'certification',
    session,
    headerItems: [labelEl, timerEl, ...scoreView.items],
    splashMs: timing.splashMs,
    revealSpeed: timing.revealSpeed,
    revealMaxMs: timing.revealMaxMs,
    advanceDelayMs: timing.advanceDelayMs,
    allowPass: Boolean(options.allowPass),
    onQuestionShown() {
      if (ended) return;
      if (!countdownDone) {
        pendingStart = true;
        return;
      }
      if (!session.startAnswering()) timeUp();
      updateTimer();
    },
    onAnswered() {
      scoreView.update();
      updateTimer();
      const change = options.timeChange?.();
      if (change) flashTime(change.text, change.kind);
    },
    scoreText: () => options.scoreText?.() ?? '',
    onScore: () => scoreView.update(),
    /** パスした：減った時間をタイマーの横に出す */
    onPassed(passed) {
      updateTimer();
      scoreView.update();
      if (passed.penaltyMs > 0) flashTime(`−${Math.round(passed.penaltyMs / 1000)}秒`, 'penalty');
      options.onPassed?.(passed);
    },
    onFinish: () => timeUp(),
    onQuit: () => confirmQuit(),
  };

  /** 残り5秒の数字は、図をなるべく隠さないように図（3D・見取図。なければ問題文の図）の左上に出す */
  function placeFinalCount() {
    const view = host.querySelector('.quiz-view');
    const figures = host.querySelector('.quiz-figures');
    const anchor = view && !view.hidden ? view : figures && !figures.hidden ? figures : container;
    if (finalCount.parentNode !== anchor) anchor.append(finalCount);
  }

  const host = h('div', { class: 'cert-play' });
  container.append(host);
  // 問題画面を作る途中で時間切れになっても timeUp が使えるように、先に宣言しておく
  let screen = null;
  screen = mountQuestionScreen(host, { navigate, mode });

  // ---------- カウントダウン（3・2・1・START!）。この間は問題が見えないように画面全体をおおう ----------
  const countText = h('span', { class: 'cert-countdown__text' }, '3');
  const countdown = h('div', { class: 'cert-countdown', role: 'status', 'aria-live': 'assertive' }, h('span', { class: 'cert-countdown__level' }, label), countText);
  container.append(countdown);
  const step = timing.countdownMs / 3;
  // 表示に合わせて効果音（3・2・1 はピッ、START! はピーン）
  playCountdownSound(false);
  later(() => {
    countText.textContent = '2';
    playCountdownSound(false);
  }, step);
  later(() => {
    countText.textContent = '1';
    playCountdownSound(false);
  }, step * 2);
  later(() => {
    countText.textContent = 'START!';
    countdown.classList.add('cert-countdown--start');
    playCountdownSound(true);
  }, step * 3);
  later(() => {
    countdown.remove();
    countdownDone = true;
    if (pendingStart && !ended) {
      pendingStart = false;
      if (!session.startAnswering()) timeUp();
    }
    tickTimer = setInterval(tick, TICK_MS);
    updateTimer();
  }, step * 3 + 500);

  function tick() {
    if (ended) return;
    updateTimer();
    if (session.timer.state === 'running' && session.checkTimeUp()) timeUp();
  }

  // ---------- 終了 ----------
  function timeUp() {
    if (ended) return;
    ended = true;
    clearInterval(tickTimer);
    screen?.lock(); // 時間切れの瞬間に回答・選択・パスを止める
    updateTimer();
    // 最後まで終えた挑戦は、すぐに記録する（「時間切れ」の表示中に画面を離れても記録は残る）
    options.finish();
    finalCount.hidden = true;
    // 最終問題に答えて終わったら、そのまま結果画面へ
    if (session.state.endReason === 'final') {
      navigate(options.resultRoute);
      return;
    }
    playTimeUpSound();
    // 回答できないように画面全体をおおい、中央に大きく「時間切れ」を 1 秒出す
    container.append(h('div', { class: 'cert-timeup', role: 'status' }, '時間切れ'));
    later(() => navigate(options.resultRoute), TIME_UP_MS);
  }

  function abort(notice) {
    if (ended) return;
    ended = true;
    clearInterval(tickTimer);
    options.abort(notice);
  }

  async function confirmQuit() {
    if (ended) return;
    // 確認している間も時間は進む（考える時間を引きのばせないように）
    const dialog = confirmDialog({ title: texts.quitTitle, message: texts.quitMessage, okLabel: 'やめる', cancelLabel: 'つづける' });
    if (!(await dialog.result) || ended) return;
    abort(null);
    navigate(options.quitRoute);
  }

  // タブの切りかえ・画面が見えなくなったら中断（同じ挑戦は再開できない）
  const onVisibility = () => {
    if (document.visibilityState === 'hidden' && !ended) {
      abort(texts.hiddenNotice);
      navigate(options.quitRoute);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    unmount() {
      // 時間切れの前に画面を離れた（戻る操作など）なら中断
      if (!ended) abort(texts.leaveNotice);
      clearInterval(tickTimer);
      for (const t of timers) clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisibility);
      screen?.unmount();
    },
  };
}
