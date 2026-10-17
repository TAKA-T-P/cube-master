/**
 * 復習の結果画面（間違えた問題・保存した問題を解き直したあと）
 *
 * 復習した問題数・正解できた数・正答率を表示する。まだ間違えている問題があれば、続けて復習できる。
 * 復習の結果は、もとのトレーニングの結果（正解数・正答率）には入れない。
 */
import { h } from '../utils/dom.js';
import { button } from './components.js';
import { getReviewSummary, startRetryReview, getSummary } from './trainingStore.js';
import { getCategory } from '../questions/questionRegistry.js';

export function mountReviewResultScreen(container, { navigate }) {
  const summary = getReviewSummary();
  if (!summary) {
    navigate(getSummary() ? 'result' : 'history');
    return { unmount() {} };
  }
  const category = summary.kind === 'cert' ? { name: '段位認定' } : getCategory(summary.category);
  const percent = Math.round(summary.accuracy * 100);
  const remaining = summary.wrongQuestions.length;
  // 結果画面から始めた復習は結果画面へ、学習記録から始めた復習は学習記録へ戻る
  const fromHistory = summary.kind === 'saved';
  const fromCertification = summary.kind === 'cert';
  const fromChallenge = summary.kind === 'challenge';

  container.append(
    h(
      'div',
      { class: 'page page--narrow' },
      h('header', { class: 'page-header' }, h('h1', {}, '復習の結果')),
      h(
        'section',
        { class: 'result-card' },
        h('p', { class: 'result-card__praise' }, summary.answeredCount === 0 ? 'また挑戦してね！' : remaining === 0 ? 'ぜんぶ解けたね！' : 'もう少し！'),
        h(
          'dl',
          { class: 'result-meta review-stats' },
          h('dt', {}, 'カテゴリ'),
          h('dd', {}, category?.name ?? summary.category),
          h('dt', {}, '復習した問題'),
          h('dd', { 'data-testid': 'review-answered' }, `${summary.answeredCount}問`),
          h('dt', {}, '正解できた問題'),
          h('dd', { 'data-testid': 'review-correct' }, `${summary.correctCount}問`),
          h('dt', {}, '復習の正答率'),
          h('dd', { 'data-testid': 'review-rate' }, `${percent}%`),
        ),
        h('p', { class: 'setup-note' }, '復習の結果は、もとのトレーニングの結果には入りません。正しく解けた問題は、復習待ちから外れます。'),
      ),
      h(
        'div',
        { class: 'result-actions' },
        remaining > 0
          ? button(
              `まだ間違えている問題を復習（${remaining}問）`,
              () => {
                if (startRetryReview()) navigate('question', { review: 'retry' });
              },
              'btn--primary btn--large',
            )
          : null,
        fromChallenge
          ? button('1分チャレンジの結果に戻る', () => navigate('challenge-result'), remaining > 0 ? '' : 'btn--primary btn--large')
          : fromCertification
          ? button('段位認定の結果に戻る', () => navigate('certification-result'), remaining > 0 ? '' : 'btn--primary btn--large')
          : fromHistory
          ? button('学習記録に戻る', () => navigate('history'), remaining > 0 ? '' : 'btn--primary btn--large')
          : button('結果に戻る', () => navigate('result'), remaining > 0 ? '' : 'btn--primary btn--large'),
        button('カテゴリ選択に戻る', () => navigate('categories'), 'btn--ghost'),
      ),
    ),
  );
  return { unmount() {} };
}
