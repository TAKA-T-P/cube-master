/**
 * トライアルの選択画面（4種類のカード）
 *
 * カードには名前・説明・小さな絵・最高到達 LEVEL と、「？」（ルール・自己ベストのポップアップ）・「挑戦する」（すぐに始める）を置く。
 */
import { h, showToast } from '../../utils/dom.js';
import { button, helpButton, infoDialog } from '../components.js';
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
    return h(
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
  });
  container.append(
    h(
      'div',
      { class: 'page page--narrow trial-select' },
      h('header', { class: 'page-header' }, h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('home') }, '← タイトル'), h('h1', {}, 'トライアル')),
      h('p', { class: 'page-lead' }, `4種類から1つをえらんで、${TRIAL_RULES.durationMs / 1000}秒でどこまで LEVEL を上げられるか挑戦しよう！`),
      h('div', { class: 'trial-cards' }, cards),
    ),
  );
  return { unmount() {} };
}
