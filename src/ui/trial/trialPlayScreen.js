/**
 * トライアルのプレイ画面（90秒・LEVEL アップ）
 *
 * カウントダウン（3・2・1・START!）・タイマー・TIME UP!・中断の扱いは、段位認定・1分チャレンジ（ui/timedPlayScreen）と同じ。
 * 問題の図と入力は ui/trial/trialModeViews（4種類）。
 *
 * タイマー（core/certificationTimer）が進むのは、問題を表示して回答できる間だけ。
 * 「決定」で止まり、○×・正しい答えの演出（正解でも不正解でも）・次の問題を作る間は止まったまま。次の問題を表示したら再開する。
 * 演出は revealMaxMs で打ち切って最終状態にする（いつまでも見続けられないように）。
 */
import { h } from '../../utils/dom.js';
import { button, confirmDialog } from '../components.js';
import { createCubeViewer, FACE_DISPLAY_MODES } from '../../three/cubeViewer.js';
import { createTrialNetViewer } from '../../three/trial/trialNetViewer.js';
import { getTrialMode, difficultyStars, TRIAL_RULES } from '../../core/trial/trialRules.js';
import { getTrialSession, finishTrial, abortTrial } from './trialStore.js';
import { createModeView } from './trialModeViews.js';
import { formatSeconds } from '../timedPlayScreen.js';
import { showAnswerSplash } from '../answerSplash.js';
import { playAnswerSound, playTimeUpSound, playCountdownSound } from '../answerSound.js';

const TICK_MS = 100;

export function mountTrialPlayScreen(container, { navigate, rules = TRIAL_RULES }) {
  const session = getTrialSession();
  if (!session || session.isFinished) {
    navigate('trial');
    return { unmount() {} };
  }
  const mode = getTrialMode(session.mode);
  const setupRoute = () => navigate('trial-setup', { mode: mode.id });

  let ended = false;
  let countdownDone = false;
  let pendingStart = false;
  let view = null;
  let question = null;
  let tickTimer = null;
  let advanceTimer = null;
  let splash = null;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  // ---------- 上の帯 ----------
  const timeEl = h('span', { class: 'cert-timer__value', 'data-testid': 'cert-timer' }, formatSeconds(rules.durationMs));
  const timerEl = h('div', { class: 'cert-timer', role: 'timer', 'aria-label': '残り時間' }, h('span', { class: 'cert-timer__label' }, '残り'), timeEl);
  const levelEl = h('span', { class: 'trial-level', 'data-testid': 'trial-level' });
  const starsEl = h('span', { class: 'trial-stars', 'aria-label': '難易度' });
  const highestEl = h('span', { class: 'trial-highest', 'data-testid': 'trial-highest' });
  const quitButton = button('やめる', () => confirmQuit(), 'btn--ghost btn--small');
  const finalCount = h('div', { class: 'cert-final-count', 'aria-hidden': 'true', hidden: true });

  // ---------- 問題 ----------
  const figureHost = h('div', { class: 'trial-figure' });
  const viewport = h('div', { class: 'trial-viewport', hidden: true, 'aria-label': '答え合わせの3D' });
  const netViewport = h('div', { class: 'trial-viewport trial-viewport--net', hidden: true, 'aria-label': '展開図を折りたたむ3D' });
  const stage = h('section', { class: 'trial-stage' }, figureHost, viewport, netViewport);
  const questionText = h('p', { class: 'trial-question', 'data-testid': 'trial-question' });
  const resultTitle = h('p', { class: 'trial-feedback__title', role: 'status' });
  const resultDetail = h('p', { class: 'trial-feedback__detail' });
  const nextButton = button('次の問題へ', () => goNext(), 'btn--small trial-feedback__next');
  const feedback = h('div', { class: 'trial-feedback', hidden: true, 'aria-live': 'polite' }, resultTitle, resultDetail, nextButton);
  const notice = h('p', { class: 'trial-notice', role: 'status', 'aria-live': 'polite' });
  const inputHost = h('section', { class: 'trial-input' });

  const root = h(
    'div',
    { class: `trial-play trial-play--${mode.id}` },
    h(
      'header',
      { class: 'trial-play__header' },
      quitButton,
      h('span', { class: 'badge badge--mode trial-play__mode' }, mode.name),
      h('div', { class: 'trial-play__status' }, levelEl, starsEl, timerEl, highestEl),
    ),
    h('main', { class: 'trial-play__body' }, stage, questionText, feedback, notice, inputHost),
  );
  container.append(root);

  // 3D（答え合わせで使う。WebGL が使えない端末では、図と文字だけで答え合わせする）
  let viewer = null;
  try {
    viewer = createCubeViewer(viewport);
    viewer.setSelectionEnabled(false);
    viewer.setFaceDisplayMode(FACE_DISPLAY_MODES.OPAQUE);
    viewer.animations.setSpeed?.(rules.revealSpeed);
    // ブラウザのコンソールから 3D を確かめられるように（問題画面と同じ）
    window.cubeMaster = { ...(window.cubeMaster ?? {}), viewer, trialSession: session };
  } catch (err) {
    console.warn('[trial] 3D を表示できません', err);
    viewer = null;
  }
  let netViewer = null;
  const getNetViewer = () => {
    if (netViewer || mode.id !== 'netPartition') return netViewer;
    try {
      netViewer = createTrialNetViewer(netViewport);
      window.cubeMaster = { ...(window.cubeMaster ?? {}), trialNetViewer: netViewer };
    } catch (err) {
      console.warn('[trial] 展開図の 3D を表示できません', err);
      netViewer = null;
    }
    return netViewer;
  };

  const updateStatus = () => {
    const s = session.state;
    levelEl.textContent = `LEVEL ${s.level}`;
    starsEl.textContent = difficultyStars(s.difficulty);
    highestEl.textContent = `最高 LEVEL ${s.highestLevel}`;
  };
  const updateTimer = () => {
    const ms = session.timer.getRemainingMs();
    timeEl.textContent = formatSeconds(ms);
    timerEl.classList.toggle('cert-timer--warn', ms <= 10000);
    timerEl.classList.toggle('cert-timer--final', ms <= 5000);
    const running = session.timer.state === 'running';
    const sec = Math.ceil(ms / 1000);
    finalCount.hidden = !(running && ms > 0 && ms <= 5000);
    if (!finalCount.hidden && finalCount.textContent !== String(sec)) finalCount.textContent = String(sec);
  };

  // ---------- 出題 ----------
  function showQuestion() {
    view?.destroy();
    view = null;
    const q = session.nextQuestion();
    if (!q) {
      timeUp();
      return;
    }
    question = q;
    updateStatus();
    viewer?.animations.cancel();
    netViewer?.skip();
    view = createModeView(q, { onSubmit: (answer) => submit(answer), notify });
    figureHost.replaceChildren(view.figure);
    inputHost.replaceChildren(view.input);
    figureHost.hidden = false;
    viewport.hidden = true;
    netViewport.hidden = true;
    stage.classList.remove('trial-stage--split');
    questionText.textContent = q.text;
    feedback.hidden = true;
    notice.textContent = '';
    if (!countdownDone) {
      pendingStart = true;
      view.setDisabled(true);
      return;
    }
    startAnswering();
  }

  function startAnswering() {
    if (ended) return;
    if (!session.startAnswering()) {
      timeUp();
      return;
    }
    view?.setDisabled(false);
    updateTimer();
  }

  function notify(text) {
    notice.textContent = text;
  }

  // ---------- 回答 ----------
  function submit(answer) {
    if (ended || !view || session.state.answerLocked) return;
    const result = session.submit(answer);
    if (!result) {
      // 時間切れ（確定した時刻に時間が残っていなかった）
      timeUp();
      return;
    }
    view.setDisabled(true);
    updateTimer();
    playAnswerSound(result.isCorrect ? 'correct' : 'incorrect');
    splash = showAnswerSplash(
      root,
      result.isCorrect ? 'correct' : 'incorrect',
      () => {
        splash = null;
        if (!ended) reveal(result);
      },
      { duration: rules.splashMs },
    );
  }

  function reveal(result) {
    const q = question;
    const v = view;
    updateStatus();
    const change = result.levelAfter - result.levelBefore;
    resultTitle.textContent = result.isCorrect ? '正解！' : '不正解';
    resultTitle.className = `trial-feedback__title trial-feedback__title--${result.isCorrect ? 'correct' : 'incorrect'}`;
    resultDetail.replaceChildren(
      h('span', { class: 'trial-feedback__level' }, `LEVEL ${result.levelBefore} → ${result.levelAfter}${change > 0 ? `（+${change}）` : change < 0 ? `（${change}）` : ''}`),
      h('span', { class: 'trial-feedback__answer' }, v.answerText(result)),
    );
    feedback.hidden = false;
    notice.textContent = '';
    const show3D = ({ keepFigure = false, net = false } = {}) => {
      figureHost.hidden = !keepFigure;
      viewport.hidden = net;
      netViewport.hidden = !net;
      stage.classList.toggle('trial-stage--split', keepFigure);
    };
    let done;
    try {
      done = v.reveal({ result, viewer, netViewer: getNetViewer(), speed: rules.revealSpeed, show3D });
    } catch (err) {
      console.error('[trial] 答え合わせの演出でエラー', err);
      done = Promise.resolve();
    }
    // 演出が終わったら（長すぎるときは revealMaxMs で最終状態にして）、少し待って次の問題へ
    const limit = new Promise((r) => later(r, rules.revealMaxMs));
    Promise.race([Promise.resolve(done).catch(() => {}), limit]).then(() => {
      if (ended || question !== q) return;
      viewer?.animations.skip();
      netViewer?.skip();
      advanceTimer = setTimeout(() => {
        advanceTimer = null;
        if (!ended && question === q) goNext();
      }, rules.advanceDelayMs);
    });
  }

  function goNext() {
    if (ended || !session.state.answerLocked) return;
    clearTimeout(advanceTimer);
    advanceTimer = null;
    viewer?.animations.cancel();
    netViewer?.skip();
    showQuestion();
  }

  // ---------- カウントダウン（3・2・1・START!）。この間は問題が見えないように画面全体をおおう ----------
  const countText = h('span', { class: 'cert-countdown__text' }, '3');
  const countdown = h('div', { class: 'cert-countdown', role: 'status', 'aria-live': 'assertive' }, h('span', { class: 'cert-countdown__level' }, `トライアル：${mode.name}`), countText);
  container.append(countdown, finalCount);
  showQuestion();
  updateStatus();
  const step = rules.countdownMs / 3;
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
      startAnswering();
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
    clearTimeout(advanceTimer);
    splash?.cancel();
    view?.setDisabled(true);
    updateTimer();
    finishTrial();
    finalCount.hidden = true;
    playTimeUpSound();
    container.append(h('div', { class: 'cert-timeup', role: 'status' }, 'TIME UP！'));
    later(() => navigate('trial-result'), 1300);
  }

  function abort(text) {
    if (ended) return;
    ended = true;
    clearInterval(tickTimer);
    clearTimeout(advanceTimer);
    abortTrial(text);
  }

  async function confirmQuit() {
    if (ended) return;
    // 確認している間も時間は進む（考える時間を引きのばせないように）
    const dialog = confirmDialog({ title: 'トライアルをやめますか？', message: 'とちゅうでやめた挑戦は、記録に残りません。', okLabel: 'やめる', cancelLabel: 'つづける' });
    if (!(await dialog.result) || ended) return;
    abort(null);
    setupRoute();
  }

  // タブの切りかえ・画面が見えなくなったら中断（同じ挑戦は再開できない）
  const onVisibility = () => {
    if (document.visibilityState === 'hidden' && !ended) {
      abort('ほかの画面に切りかえたため、トライアルを中断しました。中断した挑戦は記録に残りません。');
      setupRoute();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    unmount() {
      if (!ended) abort('トライアルのとちゅうで画面を離れたため、中断しました。中断した挑戦は記録に残りません。');
      clearInterval(tickTimer);
      clearTimeout(advanceTimer);
      for (const t of timers) clearTimeout(t);
      splash?.cancel();
      document.removeEventListener('visibilitychange', onVisibility);
      view?.destroy();
      viewer?.dispose();
      netViewer?.dispose();
      if (window.cubeMaster?.trialSession === session) delete window.cubeMaster;
    },
  };
}

