/**
 * トライアルの選択画面（6種類のカード）
 *
 * カードには名前・説明・小さな絵・最高到達 LEVEL と、「？」（ルール・自己ベストのポップアップ）・「挑戦する」（すぐに始める）を置く。
 * いちばん下（最後のカードの下）に「称号一覧を確認する」（到達した称号だけ名前を出し、まだの称号は「？？」）と
 * 「展開図を確認する」（立方体の展開図 11 種類のポップアップ）を置く。
 */
import { h, showToast } from '../../utils/dom.js';
import { button, helpButton, infoDialog, contentDialog } from '../components.js';
import { CUBE_NETS } from '../../core/cubeNetCatalog.js';
import { distinctOrientations, getNetBounds } from '../../core/cubeNet.js';
import { renderNetSvg } from '../netVisuals.js';
import { TRIAL_MODES, TRIAL_RULES } from '../../core/trial/trialRules.js';
import { trialTitleFor, TRIAL_TITLES, TRIAL_TITLE_LEVELS, TRIAL_TITLE_EMOJI } from '../../core/trial/trialTitles.js';
import { getTrialRecords, startTrial, takeTrialNotice } from './trialStore.js';
import { renderTrialIcon } from './trialVisuals.js';

const bestText = (rec) => (rec.bestLevel > 0 ? `最高到達 LEVEL ${rec.bestLevel}` : 'まだ記録がありません');

/** 自己ベストの称号（まだなければ出さない） */
const titleLine = (mode, rec) => {
  const title = trialTitleFor(mode, rec.bestLevel);
  return title ? h('p', { class: 'trial-card__title', 'data-testid': 'trial-card-title' }, `${title.emoji} ${title.name}`) : null;
};

/** 展開図の型の見出し（型ごとにまとめて出す） */
const NET_GROUPS = [
  ['1-4-1', '1-4-1 型（6種類）'],
  ['1-3-2', '1-3-2 型（3種類）'],
  ['2-2-2', '2-2-2 型（1種類）'],
  ['3-3', '3-3 型（1種類）'],
];

/** 横長に置いた向き（いちばん背が低い向き） */
const flatNet = (cells) => distinctOrientations(cells).sort((a, b) => getNetBounds(a).height - getNetBounds(b).height || getNetBounds(b).width - getNetBounds(a).width)[0];

/** 立方体の展開図 11 種類のポップアップ */
export function showCubeNets() {
  const content = h(
    'div',
    { class: 'trial-nets' },
    NET_GROUPS.map(([group, label]) =>
      h(
        'section',
        { class: 'trial-nets__group' },
        h('h3', { class: 'trial-nets__title' }, label),
        h(
          'div',
          { class: 'trial-nets__list' },
          CUBE_NETS.filter((n) => n.group === group).map((n) => h('figure', { class: 'trial-nets__item', 'data-net': n.id }, renderNetSvg({ cells: flatNet(n.cells) }))),
        ),
      ),
    ),
  );
  return contentDialog({ title: '立方体の展開図（11種類）', content });
}

/** まだ到達していない称号の表示 */
export const HIDDEN_TITLE = '？？';

/**
 * 称号一覧のポップアップ（種類ごとに10段階）。自己ベストで到達した称号は名前と絵文字を出し、まだの称号は「？？」にする
 * @param {{ modes: Record<string, { bestLevel: number }> }} records
 */
export function showTrialTitles(records) {
  const content = h(
    'div',
    { class: 'trial-titles' },
    TRIAL_MODES.map((m) => {
      const best = records.modes[m.id]?.bestLevel ?? 0;
      const got = TRIAL_TITLE_LEVELS.filter((l) => best >= l).length;
      return h(
        'section',
        { class: 'trial-titles__mode', dataset: { mode: m.id } },
        h('h3', { class: 'trial-titles__name' }, m.name, h('span', { class: 'trial-titles__count' }, `${got} / ${TRIAL_TITLE_LEVELS.length}`)),
        h(
          'ol',
          { class: 'trial-titles__list' },
          TRIAL_TITLES[m.id].map((name, i) => {
            const reached = best >= TRIAL_TITLE_LEVELS[i];
            return h(
              'li',
              { class: `trial-titles__item ${reached ? 'trial-titles__item--got' : 'trial-titles__item--locked'}` },
              h('span', { class: 'trial-titles__level' }, `LEVEL ${TRIAL_TITLE_LEVELS[i]}${i === TRIAL_TITLE_LEVELS.length - 1 ? '以上' : '〜'}`),
              h('span', { class: 'trial-titles__emoji', 'aria-hidden': 'true' }, reached ? TRIAL_TITLE_EMOJI[i] : '🔒'),
              h('span', { class: 'trial-titles__title' }, reached ? name : HIDDEN_TITLE),
            );
          }),
        ),
      );
    }),
  );
  const dialog = contentDialog({ title: '称号一覧', content });
  // 「閉じる」にフォーカスすると一覧のいちばん下まで動くので、上から見せる
  const box = dialog.el.querySelector('.dialog');
  if (box) box.scrollTop = 0;
  return dialog;
}

/** 「？」で出すルールの説明（その種類のルールと自己ベスト） */
const showRules = (mode, rec) =>
  infoDialog({
    title: mode.name,
    items: [...mode.rules, rec.bestLevel > 0 ? `自己ベスト：LEVEL ${rec.bestLevel}（${rec.attempts}回挑戦）` : '自己ベスト：まだ記録がありません'],
  });

export function mountTrialSelectScreen(container, { navigate }) {
  const records = getTrialRecords();
  const notice = takeTrialNotice();
  if (notice) showToast(notice);
  const cards = TRIAL_MODES.map((m) => {
    const rec = records.modes[m.id];
    const card = h(
      'article',
      { class: 'trial-card', dataset: { mode: m.id } },
      h('div', { class: 'trial-card__icon', 'aria-hidden': 'true' }, renderTrialIcon(m.id)),
      h(
        'div',
        { class: 'trial-card__body' },
        h('h2', { class: 'trial-card__name' }, m.name),
        h('p', { class: 'trial-card__desc' }, m.description),
        h('p', { class: 'trial-card__best', 'data-testid': 'trial-best' }, bestText(rec)),
        titleLine(m.id, rec),
      ),
      h(
        'div',
        { class: 'trial-card__go' },
        helpButton(`${m.name}のルール`, () => showRules(m, rec)),
        button(
          '挑戦する',
          () => {
            startTrial(m.id);
            navigate('trial-play');
          },
          'btn--primary btn--small',
        ),
      ),
    );
    return card;
  });
  // いちばん下に、称号一覧と展開図 11 種類を確かめるボタン
  const extras = h(
    'div',
    { class: 'trial-select__extras' },
    button('称号一覧を確認する', () => showTrialTitles(records), 'trial-titles-button'),
    button('展開図を確認する', () => showCubeNets(), 'trial-nets-button'),
  );
  container.append(
    h(
      'div',
      { class: 'page page--narrow trial-select' },
      h('header', { class: 'page-header' }, h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('home') }, '← タイトル'), h('h1', {}, 'トライアル')),
      h('p', { class: 'page-lead' }, `${TRIAL_MODES.length}種類から1つをえらんで、${TRIAL_RULES.durationMs / 1000}秒でどこまで LEVEL を上げられるか挑戦しよう！`),
      h('div', { class: 'trial-cards' }, cards, extras),
    ),
  );
  return { unmount() {} };
}
