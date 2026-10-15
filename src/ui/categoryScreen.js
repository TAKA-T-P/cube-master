/**
 * カテゴリ選択画面
 * CATEGORIES（questionRegistry）の enabled が true のカテゴリだけ選べる。
 */
import { h } from '../utils/dom.js';
import { CATEGORIES } from '../questions/questionRegistry.js';

export function mountCategoryScreen(container, { navigate }) {
  const cards = CATEGORIES.map((c) =>
    h(
      'button',
      {
        class: `category-card ${c.enabled ? '' : 'category-card--disabled'}`,
        type: 'button',
        disabled: !c.enabled,
        dataset: { category: c.id },
        onClick: () => c.enabled && navigate('setup', { category: c.id }),
      },
      h('span', { class: 'category-card__name' }, c.name, c.enabled ? null : h('span', { class: 'badge' }, '準備中')),
      h('span', { class: 'category-card__desc' }, c.description),
      h('span', { class: 'category-card__grades' }, `対象：${c.grades}`),
    ),
  );

  container.append(
    h(
      'div',
      { class: 'page' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => navigate('home') }, '← ホーム'),
        h('h1', {}, 'トレーニング'),
      ),
      h('p', { class: 'page-lead' }, '練習したいカテゴリを選んでください。'),
      h('div', { class: 'category-grid' }, cards),
    ),
  );
  return { unmount() {} };
}
