/**
 * トレーニング結果画面
 */
import { h } from '../utils/dom.js';
import { button } from './components.js';
import { getSummary, getSettings, startTraining, startReview, startMistakeReview, getMistakes, endReview } from './trainingStore.js';
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
  endReview(); // 復習から戻ってきたとき
  const category = getCategory(summary.category);
  const mistakes = getMistakes().length;
  const percent = Math.round(summary.accuracy * 100);

  const historyList = h(
    'ol',
    { class: 'result-history' },
    summary.history.map((item) =>
      h(
        'li',
        {},
        // 押すと、その問題をもう一度解ける（復習）
        h(
          'button',
          {
            class: `result-history__item result-history__item--${item.status}`,
            type: 'button',
            disabled: !item.question,
            'aria-label': `第${item.number}問（${item.isCorrect ? '正解' : item.status === 'partial' ? 'おしい' : '不正解'}）をもう一度解く`,
            onClick: () => {
              if (startReview(item.number)) navigate('question', { review: String(item.number) });
            },
          },
          h('span', { class: 'result-history__mark', 'aria-hidden': 'true' }, item.isCorrect ? '○' : item.status === 'partial' ? '△' : '×'),
          h('span', { 'aria-hidden': 'true' }, `第${item.number}問`),
        ),
      ),
    ),
  );

  container.append(
    h(
      'div',
      { class: 'page page--narrow' },
      h('header', { class: 'page-header' }, h('h1', {}, 'ドリルモードの結果')),
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
        ),
        // 難易度の下・「第◯問」の上に、2行×2列で並べる
        h(
          'div',
          { class: 'result-grid-actions' },
          button(
            'もう一度挑戦',
            () => {
              startTraining(settings);
              navigate('question');
            },
            'btn--primary',
          ),
          button('設定を変更', () => navigate('setup', { category: summary.category })),
          button('カテゴリ選択', () => navigate('categories')),
          button('タイトルへ', () => navigate('home')),
        ),
        summary.history.length > 0 ? historyList : null,
        summary.history.length > 0 ? h('p', { class: 'setup-note' }, '「第◯問」を押すと、その問題をもう一度解けます（結果は変わりません）。') : null,
        // 不正解・部分正解の問題を、同じ問題のまま解き直す（0問ならボタンを出さない）
        mistakes > 0
          ? button(
              `間違えた問題を復習（${mistakes}問）`,
              () => {
                if (startMistakeReview()) navigate('question', { review: 'mistakes' });
              },
              'btn--accent btn--large',
            )
          : null,
      ),
    ),
  );
  return { unmount() {} };
}
