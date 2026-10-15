/**
 * トレーニング設定画面（難易度・問題数）
 */
import { h } from '../utils/dom.js';
import { segmented, button } from './components.js';
import { getCategory, DIFFICULTIES, QUESTION_LIMITS, DEFAULT_SETTINGS } from '../questions/questionRegistry.js';
import { startTraining, getSettings } from './trainingStore.js';

export function mountTrainingSetupScreen(container, { navigate, params }) {
  const category = getCategory(params?.category);
  if (!category?.enabled) {
    navigate('categories');
    return { unmount() {} };
  }

  // 前回と同じカテゴリなら、前回の設定を初期値にする
  const prev = getSettings();
  const initial = prev?.category === category.id ? prev : DEFAULT_SETTINGS;

  const difficulty = segmented(
    '難易度',
    DIFFICULTIES.map((d) => ({ value: d.value, label: d.value === 'all' ? d.label : `${d.label} ${d.name}` })),
    initial.difficulty,
    () => {},
  );
  const limit = segmented('問題数', QUESTION_LIMITS, initial.questionLimit, () => {});
  const start = button(
    'スタート',
    () => {
      startTraining({ category: category.id, difficulty: difficulty.get(), questionLimit: limit.get() });
      navigate('question');
    },
    'btn--primary btn--large',
  );

  container.append(
    h(
      'div',
      { class: 'page page--narrow' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => navigate('categories') }, '← カテゴリ'),
        h('h1', {}, category.name),
      ),
      h(
        'section',
        { class: 'setup-card' },
        h('p', { class: 'setup-card__desc' }, category.description),
        h('p', { class: 'setup-card__grades' }, `対象：${category.grades}`),
        difficulty.el,
        h('ul', { class: 'setup-note' }, (category.levelNotes ?? []).map((note) => h('li', {}, note))),
        limit.el,
        h('p', { class: 'setup-note' }, 'タイマーはありません。じっくり考えよう。'),
        start,
      ),
    ),
  );
  return { unmount() {} };
}
