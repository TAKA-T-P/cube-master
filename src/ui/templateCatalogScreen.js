/**
 * 問題テンプレート図鑑（開発者の確認用）
 *
 * - 一覧（route: catalog）：全カテゴリのテンプレートを ID・難易度・名前・√ の扱い・基準の数・前提知識・出題されるモードと一緒に並べる
 * - 確認（route: catalog-view）：選んだテンプレートの問題を1問作り、ふだんの問題画面（mode.kind = 'catalog'）で、
 *   問題の図・正解・解説・3D の演出を確かめる。「正解で回答」ですぐに答え合わせ、「別の問題」で次のシードの問題
 *
 * 隠し操作で開く（タイトル画面のバージョン表示を続けて5回押す。#/catalog でも開ける）。
 * 図鑑で解いた問題は、学習記録・復習・段位認定の記録には残さない。
 */
import { h } from '../utils/dom.js';
import { button, infoDialog } from './components.js';
import { CATEGORIES, categoryNumber, difficultyLabel } from '../questions/questionRegistry.js';
import { QuestionPicker, TrainingSession } from '../core/questionEngine.js';
import { requiresAdvancedMath, isTemplateAvailable } from '../core/questionEligibility.js';
import { PREREQUISITES } from '../core/learningPrerequisites.js';
import { CHALLENGE_RULES } from '../core/timedChallengeSession.js';
import { CERTIFICATION_RULES } from '../core/certificationRules.js';
import { createRng } from '../utils/random.js';
import { mountQuestionScreen } from './questionScreen.js';

/** 前提知識の表示名 */
const PREREQUISITE_NAMES = Object.freeze({
  [PREREQUISITES.PYTHAGOREAN]: '三平方の定理',
  [PREREQUISITES.SQUARE_ROOT]: '√',
  [PREREQUISITES.PRISM_VOLUME]: '角柱の体積',
  [PREREQUISITES.PYRAMID_VOLUME]: '角錐の体積',
  [PREREQUISITES.SOLID_TYPES]: '立体の名前',
  [PREREQUISITES.REGULAR_POLYHEDRA]: '正多面体',
  [PREREQUISITES.SKEW_LINES]: 'ねじれの位置',
});
const ADVANCED_LABELS = Object.freeze({ always: 'いつも', sometimes: '一部' });
/** 前提知識を調べるために作る問題の数（テンプレートごと） */
const SAMPLE_COUNT = 8;

const prerequisiteText = (ids) => (ids.length ? ids.map((p) => PREREQUISITE_NAMES[p] ?? p).join('・') : '—');
const findTemplate = (id) => {
  for (const c of CATEGORIES) {
    const t = c.templates.find((x) => x.id === id);
    if (t) return { category: c, template: t };
  }
  return null;
};

/** そのテンプレートが1分チャレンジ・段位認定で出題されるか */
function modesOf(category, template) {
  const challenge = !CHALLENGE_RULES.excludedTemplates.includes(template.id) && isTemplateAvailable(template, false);
  const cert =
    CERTIFICATION_RULES.categories.includes(category.id) && !CERTIFICATION_RULES.excludedTemplates.includes(template.id) && isTemplateAvailable(template, false);
  return [challenge ? '1分' : null, cert ? '段位' : null].filter(Boolean).join('・') || '—';
}

/** 基準の数（√ を出す／出さない）と、作った問題から集めた前提知識・回答の形（重いので、一覧を出したあとで少しずつ数える） */
function inspectTemplate(template) {
  const count = (allowAdvanced) => {
    try {
      return template.bases({ allowAdvanced }).length;
    } catch {
      return 0;
    }
  };
  const prerequisites = new Set();
  const types = new Set();
  try {
    const picker = new QuestionPicker({ templates: [template], rng: createRng(1), allowAdvanced: true });
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const q = picker.next();
      for (const p of q.prerequisites ?? []) prerequisites.add(p);
      types.add(q.type === 'multiple' ? '複数' : '1つ');
    }
  } catch {
    // 作れないテンプレートは、基準の数（0）でわかる
  }
  return { on: count(true), off: count(false), prerequisites: [...prerequisites], types: [...types] };
}

// ---------------- 一覧 ----------------
export function mountTemplateCatalogScreen(container, { navigate, params }) {
  let disposed = false;
  let allowAdvanced = params?.adv === '1';
  let filter = params?.category ?? 'all';
  let query = '';
  const timers = [];

  const rows = [];
  const sections = CATEGORIES.map((category) => {
    const body = h('tbody');
    for (const t of category.templates) {
      const cells = { bases: h('td', { class: 'catalog-num' }, '…'), prerequisites: h('td', {}, '…'), type: h('td', {}, '…') };
      const row = h(
        'tr',
        { class: 'catalog-row', dataset: { template: t.id }, tabindex: '0', onClick: () => open(t.id), onKeydown: (e) => e.key === 'Enter' && open(t.id) },
        h('td', { class: 'catalog-id' }, t.id),
        h('td', {}, '★'.repeat(t.difficulty)),
        h('td', { class: 'catalog-title' }, t.title),
        cells.type,
        h('td', {}, ADVANCED_LABELS[t.advanced] ?? '—'),
        cells.bases,
        cells.prerequisites,
        h('td', {}, modesOf(category, t)),
      );
      rows.push({ row, template: t, category, cells });
      body.append(row);
    }
    return {
      category,
      el: h(
        'section',
        { class: 'catalog-section', dataset: { category: category.id } },
        h('h2', { class: 'catalog-section__title' }, `${categoryNumber(category.id)} ${category.name}（${category.templates.length}）`),
        h(
          'div',
          { class: 'catalog-table-wrap' },
          h(
            'table',
            { class: 'catalog-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ...['ID', '難易度', '内容', '回答', '√', '基準', '前提知識', '時間制'].map((label) => h('th', { scope: 'col' }, label)),
              ),
            ),
            body,
          ),
        ),
      ),
    };
  });

  function open(templateId) {
    navigate('catalog-view', { template: templateId, seed: '1', adv: allowAdvanced ? '1' : '0' });
  }

  function applyFilter() {
    const q = query.trim().toLowerCase();
    for (const s of sections) s.el.hidden = filter !== 'all' && s.category.id !== filter;
    for (const r of rows) r.row.hidden = Boolean(q) && !`${r.template.id} ${r.template.title}`.toLowerCase().includes(q);
  }

  const categorySelect = h(
    'select',
    { class: 'catalog-select', 'aria-label': 'カテゴリ', onChange: (e) => ((filter = e.target.value), applyFilter()) },
    h('option', { value: 'all' }, 'すべてのカテゴリ'),
    ...CATEGORIES.map((c) => h('option', { value: c.id, selected: c.id === filter }, `${categoryNumber(c.id)} ${c.name}`)),
  );
  const search = h('input', { class: 'catalog-search', type: 'search', placeholder: 'ID・内容で探す', 'aria-label': 'ID・内容で探す', onInput: (e) => ((query = e.target.value), applyFilter()) });
  const advToggle = h('input', { type: 'checkbox', checked: allowAdvanced, onChange: (e) => (allowAdvanced = e.target.checked) });

  container.append(
    h(
      'div',
      { class: 'page catalog' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('home') }, '← タイトル'),
        h('h1', {}, '問題テンプレート図鑑'),
        h('span', { class: 'badge badge--info page-header__end' }, '開発者用'),
      ),
      h('p', { class: 'page-lead' }, `全${rows.length}種類。行を押すと、その問題の図・正解・解説・3D の演出を確かめられます（記録には残りません）。「基準」は出題パターンの数（√ を出さないとき / 出すとき）、「時間制」は1分チャレンジ・段位認定で出るかです。`),
      h(
        'div',
        { class: 'catalog-tools' },
        categorySelect,
        search,
        h('label', { class: 'catalog-check' }, advToggle, '三平方の定理・√ の問題も出す'),
      ),
      ...sections.map((s) => s.el),
    ),
  );
  applyFilter();

  // 基準の数・前提知識は、画面を出したあとで1つずつ数える（切断・最短経路は最初の計算に時間がかかる）
  let index = 0;
  const step = () => {
    if (disposed || index >= rows.length) return;
    const r = rows[index++];
    const info = inspectTemplate(r.template);
    r.cells.bases.textContent = `${info.off} / ${info.on}`;
    r.cells.prerequisites.textContent = prerequisiteText(info.prerequisites);
    r.cells.type.textContent = info.types.join('・') || '—';
    timers.push(setTimeout(step, 0));
  };
  timers.push(setTimeout(step, 0));

  return {
    unmount() {
      disposed = true;
      for (const t of timers) clearTimeout(t);
    },
  };
}

// ---------------- 1つのテンプレートの確認 ----------------
export function mountTemplateViewScreen(container, { navigate, params }) {
  const found = findTemplate(params?.template);
  if (!found) {
    navigate('catalog');
    return { unmount() {} };
  }
  const { category, template } = found;
  const seed = Math.max(1, Number.parseInt(params.seed, 10) || 1);
  const allowAdvanced = params.adv === '1';
  const go = (s) => navigate('catalog-view', { template: template.id, seed: String(s), adv: allowAdvanced ? '1' : '0' });
  const back = () => navigate('catalog', { category: category.id, adv: allowAdvanced ? '1' : '0' });

  let question;
  try {
    question = new QuestionPicker({ templates: [template], rng: createRng(seed), allowAdvanced }).next();
  } catch (err) {
    container.append(
      h(
        'div',
        { class: 'page page--narrow' },
        h('header', { class: 'page-header' }, h('button', { class: 'btn btn--back', type: 'button', onClick: back }, '← 図鑑'), h('h1', {}, template.id)),
        h('p', { class: 'page-lead', role: 'alert' }, `この設定では問題を作れません（${err.message}）。「三平方の定理・√ の問題も出す」を確かめてください。`),
      ),
    );
    return { unmount() {} };
  }

  const session = new TrainingSession({ category: category.id, difficulty: 'all', questions: [question] });
  const correctLabels = question.choices.filter((c) => question.correctAnswers.includes(c.id)).map((c) => c.label);
  const showInfo = () =>
    infoDialog({
      title: `${template.id} ${template.title}`,
      items: [
        `カテゴリ：${categoryNumber(category.id)} ${category.name}`,
        `難易度：${difficultyLabel(template.difficulty)}（★${template.difficulty}）`,
        `問題のキー：${question.key}`,
        `シード：${seed}（三平方の定理・√ の問題を${allowAdvanced ? '出す' : '出さない'}）`,
        `前提知識：${prerequisiteText(question.prerequisites ?? [])}${requiresAdvancedMath(question) ? '（この問題は √ を使う）' : ''}`,
        `正解：${correctLabels.join('、')}`,
        `出題されるモード：${modesOf(category, template)}`,
      ],
    });
  const headerItems = [
    h('span', { class: 'quiz-progress', 'data-testid': 'catalog-id' }, `${template.id} #${seed}`),
    button('前', () => go(Math.max(1, seed - 1)), 'btn--small catalog-seed'),
    button('次', () => go(seed + 1), 'btn--small catalog-seed'),
    button('情報', showInfo, 'btn--small'),
  ];
  headerItems[1].disabled = seed <= 1;
  headerItems[1].setAttribute('aria-label', '前のシード');
  headerItems[2].setAttribute('aria-label', '次のシード');

  return mountQuestionScreen(container, {
    navigate,
    params: {},
    mode: { kind: 'catalog', session, headerItems, onBack: back, onAnother: () => go(seed + 1) },
  });
}
