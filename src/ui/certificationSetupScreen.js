/**
 * 段位認定：レベル選択画面（ベーシック・スタンダード・エキスパート）
 */
import { h } from '../utils/dom.js';
import { button } from './components.js';
import { CERTIFICATION_RULES, LEVELS, getRankLabel } from '../core/certificationRules.js';
import { startCertification, getCertificationRecords, takeCertificationNotice, getCertificationLevel } from './certificationStore.js';

export function mountCertificationSetupScreen(container, { navigate }) {
  const rules = CERTIFICATION_RULES;
  const records = getCertificationRecords();
  let selected = getCertificationLevel() ?? 'basic';
  const notice = takeCertificationNotice();

  const cards = LEVELS.map((level) => {
    const info = rules.levels[level];
    const best = records.levels[level].bestRank;
    return h(
      'button',
      {
        class: `cert-level cert-level--${level}`,
        type: 'button',
        'aria-pressed': String(level === selected),
        dataset: { level },
        onClick: () => select(level),
      },
      h('span', { class: 'cert-level__name' }, info.label),
      h('span', { class: 'cert-level__audience' }, info.audience),
      h('span', { class: 'cert-level__desc' }, info.description),
      h('span', { class: 'cert-level__best' }, best > 0 ? `最高段位：${getRankLabel(best, level)}` : 'まだ段位がありません'),
    );
  });

  function select(level) {
    selected = level;
    for (const c of cards) c.setAttribute('aria-pressed', String(c.dataset.level === level));
  }

  const start = button(
    'スタート',
    () => {
      startCertification(selected);
      navigate('certification-play', { level: selected });
    },
    'btn--primary btn--large',
  );

  container.append(
    h(
      'div',
      { class: 'page page--narrow cert-setup' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('home') }, '← ホーム'),
        h('h1', {}, '段位認定'),
        h('button', { class: 'btn btn--small btn--back page-header__end', type: 'button', onClick: () => navigate('certification-records') }, '段位・記録'),
      ),
      notice ? h('p', { class: 'cert-notice', role: 'alert' }, notice) : null,
      h('p', { class: 'cert-lead' }, '90秒で何問解ける？立方体マスターを目指せ！'),
      h('div', { class: 'cert-levels', role: 'group', 'aria-label': 'レベル' }, cards),
      h(
        'ul',
        { class: 'cert-rules' },
        h('li', {}, `制限時間は${rules.durationMs / 1000}秒。いろいろなカテゴリの問題が出ます。`),
        h('li', {}, `正解すると ★1 ${rules.points[1]}点・★2 ${rules.points[2]}点・★3 ${rules.points[3]}点。3問連続正解から連続ボーナス！`),
        h('li', {}, `まちがえると0点で、残り時間が${rules.mistakePenaltyMs / 1000}秒へります。`),
        h('li', {}, '答え合わせ・3Dの演出のあいだは、時間は止まります。ヒントは使えません。'),
        h('li', {}, 'とちゅうでやめたり、ほかのタブに切りかえたりすると中断になり、記録に残りません。'),
      ),
      h('div', { class: 'result-actions' }, start),
    ),
  );
  return { unmount() {} };
}
