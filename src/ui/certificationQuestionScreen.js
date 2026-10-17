/**
 * 段位認定：制限時間（100秒）のチャレンジの画面
 *
 * 問題の表示・回答・3D の演出は、トレーニングと同じ問題画面（ui/questionScreen）を段位認定のモードで使う。
 * この画面はその上に、カウントダウン（3・2・1・START!）・タイマー・得点・TIME UP! を重ねる。
 *
 * タイマーは core/certificationTimer（単調に増える時計で、回答できる時間だけを数える）。画面の表示は 0.1 秒ごとに更新するだけで、
 * 時間の計算には使わない。タブを切りかえる・画面を離れると中断し、記録には残さない。
 */
import { h } from '../utils/dom.js';
import { confirmDialog } from './components.js';
import { mountQuestionScreen } from './questionScreen.js';
import { CERTIFICATION_RULES, levelLabel } from '../core/certificationRules.js';
import { getCertificationSession, finishCertification, abortCertification } from './certificationStore.js';
import { playTimeUpSound, playCountdownSound } from './answerSound.js';

const TICK_MS = 100;

/** 残り時間の表示（「72.4秒」） */
export const formatSeconds = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}秒`;

export function mountCertificationQuestionScreen(container, { navigate, params }) {
  const rules = CERTIFICATION_RULES;
  const session = getCertificationSession();
  if (!session || session.isFinished || (params?.level && params.level !== session.level)) {
    navigate('certification');
    return { unmount() {} };
  }

  let countdownDone = false;
  let pendingStart = false;
  let ended = false; // 時間切れ・中断・終了（このあとは何もしない）
  let tickTimer = null;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  // ---------- 上の帯（タイマー・得点） ----------
  const timeEl = h('span', { class: 'cert-timer__value', 'data-testid': 'cert-timer' }, formatSeconds(rules.durationMs));
  const timeBonusEl = h('span', { class: 'cert-timer__bonus', 'aria-hidden': 'true' });
  const timerEl = h('div', { class: 'cert-timer', role: 'timer', 'aria-label': '残り時間' }, h('span', { class: 'cert-timer__label' }, '残り'), timeEl, timeBonusEl);
  const scoreEl = h('span', { class: 'cert-score', 'data-testid': 'cert-score' }, '0点');
  const streakEl = h('span', { class: 'cert-streak' });
  const levelEl = h('span', { class: 'badge badge--info' }, levelLabel(session.level));
  const finalCount = h('div', { class: 'cert-final-count', 'aria-hidden': 'true', hidden: true });

  const updateScore = () => {
    const { score } = session.state;
    scoreEl.textContent = `${score.score}点`;
    streakEl.textContent = score.streak >= 2 ? `${score.streak}連続` : '';
  };

  const updateTimer = () => {
    const ms = session.timer.getRemainingMs();
    timeEl.textContent = formatSeconds(ms);
    timerEl.classList.toggle('cert-timer--warn', ms <= 10000);
    timerEl.classList.toggle('cert-timer--final', ms <= 5000);
    // 残り 5 秒からは大きなカウントダウン（回答できる間だけ）
    const running = session.timer.state === 'running';
    const sec = Math.ceil(ms / 1000);
    finalCount.hidden = !(running && ms > 0 && ms <= 5000);
    if (!finalCount.hidden && finalCount.textContent !== String(sec)) finalCount.textContent = String(sec);
  };

  // ---------- 問題画面（段位認定のモード） ----------
  const mode = {
    kind: 'certification',
    session,
    headerItems: [levelEl, timerEl, scoreEl, streakEl],
    splashMs: rules.splashMs,
    revealSpeed: rules.revealSpeed,
    revealMaxMs: rules.revealMaxMs,
    advanceDelayMs: rules.advanceDelayMs,
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
      updateScore();
      updateTimer();
      const last = session.state.lastScore;
      if (last?.timeBonusMs > 0) {
        timeBonusEl.textContent = `+${Math.round(last.timeBonusMs / 1000)}秒`;
        timeBonusEl.classList.remove('cert-timer__bonus--show');
        void timeBonusEl.offsetWidth; // アニメーションをやり直す
        timeBonusEl.classList.add('cert-timer__bonus--show');
      }
    },
    scoreText() {
      const last = session.state.lastScore;
      if (!last) return '';
      if (last.points > 0) {
        const streak = last.bonus > 0 ? `（連続ボーナス +${last.bonus}点）` : '';
        const time = last.timeBonusMs > 0 ? ` 多答問題を一発正解！ 残り時間 +${Math.round(last.timeBonusMs / 1000)}秒` : '';
        return `+${last.points}点${streak}${time}`;
      }
      return last.deduction > 0 ? `−${last.deduction}点` : '';
    },
    onScore: updateScore,
    onFinish: () => timeUp(),
    onQuit: () => confirmQuit(),
  };

  const host = h('div', { class: 'cert-play' });
  container.append(host);
  const screen = mountQuestionScreen(host, { navigate, mode });

  // ---------- カウントダウン（3・2・1・START!）。この間は問題が見えないように画面全体をおおう ----------
  const countText = h('span', { class: 'cert-countdown__text' }, '3');
  const countdown = h('div', { class: 'cert-countdown', role: 'status', 'aria-live': 'assertive' }, h('span', { class: 'cert-countdown__level' }, levelLabel(session.level)), countText);
  container.append(countdown, finalCount);
  const step = rules.countdownMs / 3;
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
    updateTimer();
    // 最後まで終えた挑戦は、すぐに記録する（TIME UP! の表示中に画面を離れても記録は残る）
    finishCertification();
    finalCount.hidden = true;
    playTimeUpSound();
    // 回答できないように画面全体をおおう
    container.append(h('div', { class: 'cert-timeup', role: 'status' }, 'TIME UP！'));
    later(() => navigate('certification-result'), 1300);
  }

  function abort(notice) {
    if (ended) return;
    ended = true;
    clearInterval(tickTimer);
    abortCertification(notice);
  }

  async function confirmQuit() {
    if (ended) return;
    // 確認している間も時間は進む（考える時間を引きのばせないように）
    const dialog = confirmDialog({
      title: '段位認定をやめますか？',
      message: 'とちゅうでやめた挑戦は、記録に残りません。',
      okLabel: 'やめる',
      cancelLabel: 'つづける',
    });
    if (!(await dialog.result) || ended) return;
    abort(null);
    navigate('certification');
  }

  // タブの切りかえ・画面が見えなくなったら中断（同じ挑戦は再開できない）
  const onVisibility = () => {
    if (document.visibilityState === 'hidden' && !ended) {
      abort('ほかの画面に切りかえたため、段位認定を中断しました。中断した挑戦は記録に残りません。');
      navigate('certification');
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    unmount() {
      // 時間切れの前に画面を離れた（戻る操作など）なら中断
      if (!ended) abort('段位認定のとちゅうで画面を離れたため、中断しました。中断した挑戦は記録に残りません。');
      clearInterval(tickTimer);
      for (const t of timers) clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisibility);
      screen.unmount();
    },
  };
}
