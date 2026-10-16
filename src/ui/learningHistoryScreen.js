/**
 * 学習記録画面（カテゴリ別の累計・正答率・最近の結果・復習待ちの問題）
 *
 * 記録はブラウザの中だけに保存している（ui/learningStore）。個人情報は保存しない。
 */
import { h } from '../utils/dom.js';
import { button, confirmDialog } from './components.js';
import { CATEGORIES, difficultyLabel } from '../questions/questionRegistry.js';
import { getLearningStats, getSavedReviewCount, isLearningStorageAvailable, clearLearningData } from './learningStore.js';
import { startSavedReview } from './trainingStore.js';

const pct = (rate) => (rate === null ? '－' : `${Math.round(rate * 100)}%`);

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function categoryCard(category, navigate) {
  const stats = getLearningStats(category.id);
  const pending = getSavedReviewCount(category.id);
  const body = stats
    ? [
        h(
          'dl',
          { class: 'history-card__stats' },
          h('dt', {}, '累計問題数'),
          h('dd', { 'data-testid': 'answered' }, `${stats.answeredCount}問`),
          h('dt', {}, '累計正解数'),
          h('dd', { 'data-testid': 'correct' }, `${stats.correctCount}問`),
          h('dt', {}, '正答率'),
          h('dd', { 'data-testid': 'accuracy' }, pct(stats.accuracy)),
          h('dt', {}, '練習回数'),
          h('dd', {}, `${stats.playedSessions}回`),
          h('dt', {}, 'ヒント'),
          h('dd', {}, `${stats.hintUsedCount}回`),
        ),
        h(
          'p',
          { class: 'history-card__levels' },
          [1, 2, 3].map((d) => h('span', {}, `${difficultyLabel(d)} ${stats.byDifficulty[d].answered > 0 ? pct(stats.difficultyAccuracy[d]) : '－'}`)),
        ),
        stats.recent.length > 0
          ? h(
              'p',
              { class: 'history-card__recent' },
              '最近：',
              stats.recent.slice(0, 3).map((r) => h('span', {}, `${formatDate(r.date)} ${difficultyLabel(r.difficulty)} ${r.correct}/${r.answered}`)),
            )
          : null,
      ]
    : [h('p', { class: 'history-card__empty' }, 'まだ記録がありません')];

  return h(
    'section',
    { class: 'history-card', dataset: { category: category.id } },
    h('h2', { class: 'history-card__name' }, category.name),
    ...body,
    h(
      'div',
      { class: 'history-card__review' },
      h('span', { 'data-testid': 'pending' }, `復習待ち ${pending}問`),
      pending > 0
        ? button(
            '復習する',
            () => {
              if (startSavedReview(category.id)) navigate('question', { review: 'saved' });
            },
            'btn--small btn--primary',
          )
        : null,
    ),
  );
}

export function mountLearningHistoryScreen(container, { navigate }) {
  const list = h('div', { class: 'history-list' });
  const render = () => list.replaceChildren(...CATEGORIES.filter((c) => c.enabled).map((c) => categoryCard(c, navigate)));
  render();

  async function confirmClear() {
    const dialog = confirmDialog({
      title: '学習記録を消去しますか？',
      message: 'この端末に保存した CUBE MASTER の学習記録と復習待ちの問題を、すべて消します。もとに戻せません。',
      okLabel: '消去する',
      cancelLabel: 'やめる',
    });
    if (!(await dialog.result)) return;
    clearLearningData();
    render();
  }

  container.append(
    h(
      'div',
      { class: 'page page--narrow' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('categories') }, '← カテゴリ'),
        h('h1', {}, '学習記録'),
      ),
      h(
        'p',
        { class: 'page-lead' },
        isLearningStorageAvailable()
          ? '記録はこの端末のブラウザの中だけに保存されます（名前などの個人情報は保存しません）。'
          : 'この端末では記録を保存できません。ページを閉じると記録は消えますが、練習はそのまま続けられます。',
      ),
      list,
      h('div', { class: 'result-actions' }, button('学習記録を消去', () => confirmClear(), 'btn--ghost btn--danger-text')),
    ),
  );
  return { unmount() {} };
}
