/**
 * カテゴリ選択画面
 * CATEGORIES（questionRegistry）の enabled が true のカテゴリだけ選べる。
 *
 * カテゴリのボタンは名前だけの小さなボタンにして、上下にスクロールする。
 * ボタンを押すと、画面の下（スクロールしない固定の領域）に説明・対象学年と「次へ」が出る。
 */
import { h } from '../utils/dom.js';
import { button } from './components.js';
import { CATEGORIES, getCategory, categoryNumber } from '../questions/questionRegistry.js';
import { getSettings } from './trainingStore.js';

export function mountCategoryScreen(container, { navigate }) {
  // 設定画面から戻ってきたときは、前に選んだカテゴリを選んだ状態にする
  let selectedId = getCategory(getSettings()?.category)?.enabled ? getSettings().category : null;

  const cards = CATEGORIES.map((c) =>
    h(
      'button',
      {
        class: `category-card ${c.enabled ? '' : 'category-card--disabled'}`,
        type: 'button',
        disabled: !c.enabled,
        'aria-pressed': 'false',
        dataset: { category: c.id },
        onClick: () => c.enabled && select(c.id),
      },
      h('span', { class: 'category-card__num', 'aria-hidden': 'true' }, categoryNumber(c.id)),
      h('span', { class: 'category-card__name' }, c.name, c.enabled ? null : h('span', { class: 'badge' }, '準備中')),
    ),
  );

  const detailName = h('h2', { class: 'category-detail__name' });
  const detailDesc = h('p', { class: 'category-detail__desc' });
  const nextButton = button('次へ', () => selectedId && navigate('setup', { category: selectedId }), 'btn--primary btn--large');
  const detail = h(
    'section',
    { class: 'category-detail', hidden: true, 'aria-live': 'polite' },
    h('div', { class: 'category-detail__text' }, detailName, detailDesc),
    nextButton,
  );

  function select(id) {
    selectedId = id;
    const c = getCategory(id);
    for (const card of cards) card.setAttribute('aria-pressed', String(card.dataset.category === id));
    detailName.textContent = `${categoryNumber(c.id)} ${c.name}`;
    detailDesc.textContent = c.description;
    detail.hidden = false;
  }

  container.append(
    h(
      'div',
      { class: 'page category-page' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => navigate('home') }, '← ホーム'),
        h('h1', {}, 'ドリルモード'),
        h('button', { class: 'btn btn--small btn--back page-header__end', type: 'button', onClick: () => navigate('history') }, '学習記録'),
      ),
      // カテゴリのボタン（この部分だけ上下にスクロールする）
      h(
        'div',
        { class: 'category-scroll' },
        h('p', { class: 'page-lead' }, '練習したいカテゴリを選んでください。'),
        h('div', { class: 'category-grid' }, cards),
      ),
      detail,
    ),
  );
  if (selectedId) select(selectedId);
  return { unmount() {} };
}
