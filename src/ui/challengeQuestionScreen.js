/**
 * トレーニング：1分チャレンジの画面（1分間で何問正解できるか）
 *
 * カウントダウン・タイマー・TIME UP!・中断の扱いは ui/timedPlayScreen（段位認定と共通）。
 * 上の帯には正解数を出し、不正解のときは残り時間 −10 秒をタイマーの横に出す。
 */
import { h } from '../utils/dom.js';
import { CHALLENGE_RULES } from '../core/timedChallengeSession.js';
import { difficultyLabel } from '../questions/questionRegistry.js';
import { getChallengeSession, finishChallenge, abortChallenge } from './trainingStore.js';
import { mountTimedPlayScreen } from './timedPlayScreen.js';

export function mountChallengeQuestionScreen(container, { navigate }) {
  const session = getChallengeSession();
  if (!session || session.isFinished) {
    navigate('categories');
    return { unmount() {} };
  }
  const setupRoute = () => navigate('setup', { category: session.category });

  const correctEl = h('span', { class: 'cert-score', 'data-testid': 'challenge-correct' }, '0問正解');
  const scoreView = {
    items: [correctEl],
    update() {
      correctEl.textContent = `${session.state.correctCount}問正解`;
    },
  };
  const penaltyText = () => {
    const ms = session.state.lastScore?.penaltyMs ?? 0;
    return ms > 0 ? `−${Math.round(ms / 1000)}秒` : '';
  };

  const screen = mountTimedPlayScreen(container, {
    // 中断したあとは、このカテゴリの設定画面へ戻る
    navigate: (...args) => (args[0] === 'challenge-setup' ? setupRoute() : navigate(...args)),
    session,
    label: `1分チャレンジ・${difficultyLabel(session.difficulty)}`,
    timing: CHALLENGE_RULES,
    scoreView,
    scoreText: () => (penaltyText() ? `残り時間 ${penaltyText()}` : ''),
    timeChange: () => (penaltyText() ? { text: penaltyText(), kind: 'penalty' } : null),
    finish: () => finishChallenge(),
    resultRoute: 'challenge-result',
    abort: (notice) => abortChallenge(notice),
    quitRoute: 'challenge-setup',
    texts: {
      quitTitle: '1分チャレンジをやめますか？',
      quitMessage: 'とちゅうでやめたチャレンジは、記録に残りません。',
      hiddenNotice: 'ほかの画面に切りかえたため、1分チャレンジを中断しました。中断したチャレンジは記録に残りません。',
      leaveNotice: '1分チャレンジのとちゅうで画面を離れたため、中断しました。中断したチャレンジは記録に残りません。',
    },
  });
  return screen;
}
