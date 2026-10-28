/**
 * トライアルの選択画面（5種類のカード）
 *
 * カードには名前・説明・小さな絵・最高到達 LEVEL と、「？」（ルール・自己ベストのポップアップ）・「挑戦する」（すぐに始める）を置く。
 * 「展開図に分けろ！」のカードの下には「展開図を確認する」（立方体の展開図 11 種類のポップアップ）を置く。
 */
import { h, showToast } from '../../utils/dom.js';
import { button, helpButton, infoDialog, contentDialog } from '../components.js';
import { CUBE_NETS } from '../../core/cubeNetCatalog.js';
import { distinctOrientations, getNetBounds } from '../../core/cubeNet.js';
import { renderNetSvg } from '../netVisuals.js';
import { TRIAL_MODES, TRIAL_RULES } from '../../core/trial/trialRules.js';
import { trialTitleFor } from '../../core/trial/trialTitles.js';
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
  const cards = TRIAL_MODES.flatMap((m) => {
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
    // 「展開図に分けろ！」の下に、展開図 11 種類を確かめるボタン
    if (m.id !== 'netPartition') return [card];
    return [card, button('展開図を確認する', () => showCubeNets(), 'trial-nets-button')];
  });
  container.append(
    h(
      'div',
      { class: 'page page--narrow trial-select' },
      h('header', { class: 'page-header' }, h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('home') }, '← タイトル'), h('h1', {}, 'トライアル')),
      h('p', { class: 'page-lead' }, `${TRIAL_MODES.length}種類から1つをえらんで、${TRIAL_RULES.durationMs / 1000}秒でどこまで LEVEL を上げられるか挑戦しよう！`),
      h('div', { class: 'trial-cards' }, cards),
    ),
  );
  return { unmount() {} };
}
