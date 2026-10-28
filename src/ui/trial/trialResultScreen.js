/**
 * トライアルの結果画面。いちばん大きく出すのは最高到達 LEVEL（正式な記録）。終了時の LEVEL は出さない
 * 最高到達 LEVEL に応じた称号（core/trial/trialTitles）を、メダルやトロフィーの絵文字といっしょに演出つきで出す。
 */
import { h } from '../../utils/dom.js';
import { button } from '../components.js';
import { getTrialMode } from '../../core/trial/trialRules.js';
import { trialTitleFor } from '../../core/trial/trialTitles.js';
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
  const title = trialTitleFor(mode.id, summary.highestLevel);
  // 自己ベストを更新して、前の称号より上の称号になった
  const previousTitle = trialTitleFor(mode.id, outcome?.previousBest ?? 0);
  const newTitle = Boolean(title && outcome?.bestUpdated && (!previousTitle || title.rank > previousTitle.rank));
  const titleView = title
    ? h(
        'div',
        { class: `trial-title trial-title--rank${title.rank}`, 'data-testid': 'trial-title' },
        h('span', { class: 'trial-title__emoji', 'aria-hidden': 'true' }, title.emoji),
        h('span', { class: 'trial-title__label' }, '称号'),
        h('strong', { class: 'trial-title__name', 'data-testid': 'trial-title-name' }, title.name),
        newTitle ? h('span', { class: 'trial-title__new', 'data-testid': 'trial-title-new' }, '新しい称号をゲット！') : null,
      )
    : null;
  container.append(
    h(
      'div',
      { class: 'page page--narrow trial-result' },
      h('p', { class: 'trial-result__mode' }, 'トライアル', h('strong', {}, mode.name)),
      h(
        'div',
        { class: 'trial-result__main' },
        h('span', { class: 'trial-result__label' }, '最高到達'),
        h('span', { class: 'trial-result__level', 'data-testid': 'trial-result-level' }, `LEVEL ${summary.highestLevel}`),
      ),
      titleView,
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
