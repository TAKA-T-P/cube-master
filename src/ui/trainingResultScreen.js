/**
 * トレーニング結果画面
 */
import { h } from '../utils/dom.js';
import { button } from './components.js';
import { getSummary, getSettings, startTraining } from './trainingStore.js';
import { getCategory, difficultyLabel } from '../questions/questionRegistry.js';

function praise(accuracy, answered) {
  if (answered === 0) return 'また挑戦してね！';
  if (accuracy >= 0.9) return 'すばらしい！';
  if (accuracy >= 0.7) return 'よくできました！';
  if (accuracy >= 0.4) return 'その調子！';
  return 'くり返して練習しよう！';
}

export function mountTrainingResultScreen(container, { navigate }) {
  const summary = getSummary();
  const settings = getSettings();
  if (!summary || !settings) {
    navigate('categories');
    return { unmount() {} };
  }
  const category = getCategory(summary.category);
  const percent = Math.round(summary.accuracy * 100);
  const limitLabel = Number.isInteger(summary.questionLimit) ? `${summary.questionLimit}問` : '';

  const historyList = h(
    'ol',
    { class: 'result-history' },
    summary.history.map((item) =>
      h(
        'li',
        { class: `result-history__item result-history__item--${item.status}` },
        h('span', { class: 'result-history__mark', 'aria-hidden': 'true' }, item.isCorrect ? '○' : item.status === 'partial' ? '△' : '×'),
        h('span', {}, `第${item.number}問`),
        h('span', { class: 'sr-only' }, item.isCorrect ? '正解' : '不正解'),
      ),
    ),
  );

  container.append(
    h(
      'div',
      { class: 'page page--narrow' },
      h('header', { class: 'page-header' }, h('h1', {}, '結果')),
      h(
        'section',
        { class: 'result-card' },
        h('p', { class: 'result-card__praise' }, praise(summary.accuracy, summary.answeredCount)),
        h(
          'p',
          { class: 'result-card__score' },
          h('span', { class: 'result-card__big', 'data-testid': 'correct-count' }, String(summary.correctCount)),
          h('span', {}, ` / ${summary.answeredCount} 問正解`),
        ),
        h('p', { class: 'result-card__rate' }, `正答率 ${percent}%`),
        h(
          'dl',
          { class: 'result-meta' },
          h('dt', {}, 'カテゴリ'),
          h('dd', {}, category?.name ?? summary.category),
          h('dt', {}, '難易度'),
          h('dd', {}, difficultyLabel(summary.difficulty)),
          h('dt', {}, '問題数'),
          h('dd', {}, limitLabel),
        ),
        summary.history.length > 0 ? historyList : null,
        h('p', { class: 'setup-note' }, '「おしい」（△）は正解の数に入りません。'),
      ),
      h(
        'div',
        { class: 'result-actions' },
        button(
          'もう一度挑戦',
          () => {
            startTraining(settings);
            navigate('question');
          },
          'btn--primary btn--large',
        ),
        button('設定を変更', () => navigate('setup', { category: summary.category })),
        button('カテゴリ選択に戻る', () => navigate('categories'), 'btn--ghost'),
      ),
    ),
  );
  return { unmount() {} };
}
