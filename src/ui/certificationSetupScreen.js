/**
 * 段位認定：レベル選択画面（ベーシック・スタンダード・エキスパート）
 */
import { h } from '../utils/dom.js';
import { button, infoDialog, helpButton } from './components.js';
import { CERTIFICATION_RULES, LEVELS, getRankLabel } from '../core/certificationRules.js';
import { startCertification, getCertificationRecords, takeCertificationNotice, getCertificationLevel } from './certificationStore.js';

/** 段位認定のルール（スタートの左の「？」で見る説明） */
export const certRules = (rules) => [
  `制限時間は${rules.durationMs / 1000}秒。いろいろなカテゴリの問題が出ます。`,
  `正解すると ★1 ${rules.points[1]}点・★2 ${rules.points[2]}点・★3 ${rules.points[3]}点。3問連続正解から連続ボーナス！`,
  `答えが複数ある問題に一発で正解すると、残り時間が${rules.multipleAnswerTimeBonusMs / 1000}秒ふえます。`,
  `まちがえると減点。1回目は${rules.mistakePenalty.perMistake}点、2回目は${rules.mistakePenalty.perMistake * 2}点…と、まちがえるほど重くなります（${rules.mistakePenalty.perMistake * rules.mistakePenalty.maxMultiplier}点まで）。`,
  `「パス」で問題を入れかえられます。n回目のパスで残り時間が${rules.passPenalty.perPassMs / 1000}×n秒へります（1回目${rules.passPenalty.perPassMs / 1000}秒、2回目${(rules.passPenalty.perPassMs * 2) / 1000}秒…）。減点はありませんが、連続正解は0に戻ります。`,
  '答え合わせ・3Dの演出のあいだは、時間は止まります。ヒントは使えません。',
  'とちゅうでやめたり、ほかのタブに切りかえたりすると中断になり、記録に残りません。',
];

export function mountCertificationSetupScreen(container, { navigate }) {
  const rules = CERTIFICATION_RULES;
  const records = getCertificationRecords();
  let selected = getCertificationLevel() ?? 'basic';
  const notice = takeCertificationNotice();

  const cards = LEVELS.map((level) => {
    const info = rules.levels[level];
    const rec = records.levels[level];
    const best = rec.bestRank;
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
      h('span', { class: 'cert-level__desc' }, info.description),
      // 最高段位の右にハイスコア（挑戦したことがあれば）
      h(
        'span',
        { class: 'cert-level__best' },
        h('span', { 'data-testid': 'best-rank' }, best > 0 ? `最高段位：${getRankLabel(best, level)}` : rec.attempts > 0 ? '最高段位：認定なし' : 'まだ段位がありません'),
        rec.attempts > 0 ? h('span', { class: 'cert-level__score', 'data-testid': 'high-score' }, `ハイスコア：${rec.bestScore}点`) : null,
      ),
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
      h('p', { class: 'cert-lead' }, `${rules.durationMs / 1000}秒で何問解ける？立方体マスターを目指せ！`),
      h('div', { class: 'cert-levels', role: 'group', 'aria-label': 'レベル' }, cards),
      // スタートは、レベルのボタンのすぐ下。ルールの説明は、左端の「？」で見る
      h('div', { class: 'cert-start' }, helpButton('段位認定のルール', () => infoDialog({ title: '段位認定のルール', items: certRules(rules) })), start),
    ),
  );
  return { unmount() {} };
}
