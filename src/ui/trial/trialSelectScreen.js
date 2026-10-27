/**
 * トライアルの選択画面（4種類のカード）と、ルール説明・スタートの画面
 *
 *   trial        … 4種類のカード（名前・説明・小さな絵・最高到達 LEVEL・「挑戦する」）
 *   trial-setup  … えらんだトライアルのルール・自己ベスト・「スタート」
 */
import { h, showToast } from '../../utils/dom.js';
import { button } from '../components.js';
import { TRIAL_MODES, TRIAL_RULES, getTrialMode } from '../../core/trial/trialRules.js';
import { getTrialRecords, startTrial, takeTrialNotice } from './trialStore.js';
import { renderTrialIcon } from './trialVisuals.js';

const bestText = (rec) => (rec.bestLevel > 0 ? `最高到達 LEVEL ${rec.bestLevel}` : 'まだ記録がありません');

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
      ),
      button('挑戦する', () => navigate('trial-setup', { mode: m.id }), 'btn--primary btn--small trial-card__go'),
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

export function mountTrialSetupScreen(container, { navigate, params }) {
  const mode = getTrialMode(params?.mode);
  if (!mode) {
    navigate('trial');
    return { unmount() {} };
  }
  const notice = takeTrialNotice();
  if (notice) showToast(notice);
  const rec = getTrialRecords().modes[mode.id];
  const sec = TRIAL_RULES.durationMs / 1000;
  container.append(
    h(
      'div',
      { class: 'page page--narrow trial-setup', dataset: { mode: mode.id } },
      h('header', { class: 'page-header' }, h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('trial') }, '← トライアル'), h('h1', {}, mode.name)),
      h('div', { class: 'trial-setup__icon', 'aria-hidden': 'true' }, renderTrialIcon(mode.id)),
      h('ul', { class: 'trial-setup__rules' }, mode.rules.map((r) => h('li', {}, r))),
      h(
        'ul',
        { class: 'trial-setup__rules trial-setup__rules--level' },
        h('li', {}, `LEVEL 1 からスタート。${sec}秒の間に、できるだけ高い LEVEL を目指そう。`),
        h('li', {}, `正解で LEVEL ＋${mode.gain}、まちがえると LEVEL −1（LEVEL 1 より下がりません）。LEVEL が上がると問題がむずかしくなります（★〜★★★★）。`),
        h('li', {}, 'その回でいちばん高かった LEVEL（最高到達 LEVEL）が記録になります。答え合わせの間は時間が止まります。'),
      ),
      h(
        'p',
        { class: 'trial-setup__best', 'data-testid': 'trial-best' },
        rec.bestLevel > 0 ? `自己ベスト：LEVEL ${rec.bestLevel}（${rec.attempts}回挑戦）` : '自己ベスト：まだ記録がありません',
      ),
      h(
        'div',
        { class: 'trial-setup__actions' },
        button(
          'スタート',
          () => {
            startTrial(mode.id);
            navigate('trial-play');
          },
          'btn--primary btn--large',
        ),
      ),
    ),
  );
  return { unmount() {} };
}
