/**
 * トライアルの結果画面。いちばん大きく出すのは最高到達 LEVEL（正式な記録）。終了時の LEVEL は出さない
 */
import { h } from '../../utils/dom.js';
import { button } from '../components.js';
import { getTrialMode } from '../../core/trial/trialRules.js';
import { getTrialResult, startTrial } from './trialStore.js';
import { playFinishSound } from '../answerSound.js';

export function mountTrialResultScreen(container, { navigate }) {
  const result = getTrialResult();
  if (!result) {
    navigate('trial');
    return { unmount() {} };
  }
  const { summary, outcome } = result;
  const mode = getTrialMode(summary.mode);
  playFinishSound();
  container.append(
    h(
      'div',
      { class: 'page page--narrow trial-result' },
      h('p', { class: 'trial-result__timeup' }, 'TIME UP!'),
      h('p', { class: 'trial-result__mode' }, 'トライアル', h('br'), h('strong', {}, mode.name)),
      h(
        'div',
        { class: 'trial-result__main' },
        h('span', { class: 'trial-result__label' }, '最高到達'),
        h('span', { class: 'trial-result__level', 'data-testid': 'trial-result-level' }, `LEVEL ${summary.highestLevel}`),
      ),
      outcome?.bestUpdated ? h('p', { class: 'trial-result__best trial-result__best--new', 'data-testid': 'trial-best-updated' }, '自己ベスト更新！') : null,
      !outcome?.bestUpdated && outcome?.previousBest > 0 ? h('p', { class: 'trial-result__best' }, `自己ベスト：LEVEL ${outcome.previousBest}`) : null,
      h(
        'dl',
        { class: 'trial-result__stats' },
        h('div', {}, h('dt', {}, '正解'), h('dd', { 'data-testid': 'trial-correct' }, `${summary.correctCount}問`)),
        h('div', {}, h('dt', {}, '不正解'), h('dd', { 'data-testid': 'trial-incorrect' }, `${summary.incorrectCount}問`)),
      ),
      h(
        'div',
        { class: 'trial-result__actions' },
        button(
          'もう一度挑戦',
          () => {
            startTrial(mode.id);
            navigate('trial-play');
          },
          'btn--primary btn--large',
        ),
        button('別のトライアル', () => navigate('trial'), 'btn--large'),
        button('タイトルへ', () => navigate('home'), 'btn--ghost'),
      ),
    ),
  );
  return { unmount() {} };
}
