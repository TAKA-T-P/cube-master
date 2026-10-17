/**
 * トレーニング：1分チャレンジの結果（正解数・回答数・正答率・最高記録）
 */
import { h } from '../utils/dom.js';
import { button } from './components.js';
import { getCategory, difficultyLabel } from '../questions/questionRegistry.js';
import { getChallengeResult, startChallenge, startChallengeReview } from './trainingStore.js';
import { playRankUpSound } from './answerSound.js';

export function mountChallengeResultScreen(container, { navigate }) {
  const result = getChallengeResult();
  if (!result) {
    navigate('categories');
    return { unmount() {} };
  }
  const { summary, outcome } = result;
  const category = getCategory(summary.category);
  if (outcome?.improved) playRankUpSound();
  const mistakes = summary.history.filter((x) => !x.isCorrect).map((x) => x.question);

  container.append(
    h(
      'div',
      { class: 'page page--narrow' },
      h('header', { class: 'page-header' }, h('h1', {}, '1分チャレンジの結果')),
      h(
        'section',
        { class: 'result-card cert-result__card' },
        h('p', { class: 'cert-result__score' }, h('span', { class: 'cert-result__score-value challenge-result__value', 'data-testid': 'challenge-result-correct' }, String(summary.correctCount)), h('span', {}, '問正解！')),
        outcome?.improved
          ? h('p', { class: 'cert-best', 'data-testid': 'challenge-best-updated' }, '自己ベスト更新！')
          : h('p', { class: 'cert-result__next', 'data-testid': 'challenge-best' }, `最高記録：${outcome?.newBest ?? 0}問正解`),
        h(
          'div',
          { class: 'result-grid-actions' },
          button(
            'もう一度挑戦',
            () => {
              startChallenge({ category: summary.category, difficulty: summary.difficulty });
              navigate('challenge-play');
            },
            'btn--primary',
          ),
          button('設定を変更', () => navigate('setup', { category: summary.category })),
          button('カテゴリ選択', () => navigate('categories')),
          button('タイトルへ', () => navigate('home')),
        ),
        h(
          'dl',
          { class: 'result-meta' },
          h('dt', {}, 'カテゴリ'),
          h('dd', {}, category?.name ?? summary.category),
          h('dt', {}, '難易度'),
          h('dd', {}, difficultyLabel(summary.difficulty)),
          h('dt', {}, '回答した問題'),
          h('dd', {}, `${summary.answeredCount}問（正答率 ${Math.round(summary.accuracy * 100)}%）`),
          h('dt', {}, '不正解のペナルティ'),
          h('dd', {}, summary.penaltyTotalMs > 0 ? `残り時間 −${Math.round(summary.penaltyTotalMs / 1000)}秒` : 'なし'),
        ),
      ),
      mistakes.length > 0
        ? h(
            'div',
            { class: 'result-actions' },
            button(`間違えた問題を復習（${mistakes.length}問）`, () => {
              if (startChallengeReview(mistakes)) navigate('question', { review: 'challenge' });
            }),
          )
        : null,
    ),
  );
  return { unmount() {} };
}
