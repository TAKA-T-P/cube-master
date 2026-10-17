/**
 * 段位認定：制限時間（100秒）のチャレンジの画面
 *
 * カウントダウン・タイマー・TIME UP!・中断の扱いは ui/timedPlayScreen（1分チャレンジと共通）。
 * ここでは段位認定の得点の表示（得点・連続正解・多答問題ボーナス・パス）と、記録のしかたを決める。
 */
import { h } from '../utils/dom.js';
import { CERTIFICATION_RULES, levelLabel } from '../core/certificationRules.js';
import { getCertificationSession, finishCertification, abortCertification } from './certificationStore.js';
import { mountTimedPlayScreen, formatSeconds } from './timedPlayScreen.js';

export { formatSeconds };

export function mountCertificationQuestionScreen(container, { navigate, params }) {
  const rules = CERTIFICATION_RULES;
  const session = getCertificationSession();
  if (!session || session.isFinished || (params?.level && params.level !== session.level)) {
    navigate('certification');
    return { unmount() {} };
  }

  const scoreEl = h('span', { class: 'cert-score', 'data-testid': 'cert-score' }, '0点');
  const streakEl = h('span', { class: 'cert-streak' });
  const scoreView = {
    items: [scoreEl, streakEl],
    update() {
      const { score } = session.state;
      scoreEl.textContent = `${score.score}点`;
      streakEl.textContent = score.streak >= 2 ? `${score.streak}連続` : '';
    },
  };

  return mountTimedPlayScreen(container, {
    navigate,
    session,
    label: levelLabel(session.level),
    timing: rules,
    scoreView,
    allowPass: true,
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
    timeChange() {
      const last = session.state.lastScore;
      return last?.timeBonusMs > 0 ? { text: `+${Math.round(last.timeBonusMs / 1000)}秒`, kind: 'bonus' } : null;
    },
    finish: () => finishCertification(),
    resultRoute: 'certification-result',
    abort: (notice) => abortCertification(notice),
    quitRoute: 'certification',
    texts: {
      quitTitle: '段位認定をやめますか？',
      quitMessage: 'とちゅうでやめた挑戦は、記録に残りません。',
      hiddenNotice: 'ほかの画面に切りかえたため、段位認定を中断しました。中断した挑戦は記録に残りません。',
      leaveNotice: '段位認定のとちゅうで画面を離れたため、中断しました。中断した挑戦は記録に残りません。',
    },
  });
}
