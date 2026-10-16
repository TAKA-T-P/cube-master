/**
 * 段位認定：段位・記録（レベル別の最高段位・最高得点・挑戦回数・最近の結果、21段階の段位一覧）
 */
import { h } from '../utils/dom.js';
import { CERTIFICATION_RULES, LEVELS, MAX_RANK, getRankLabel, getNextRank } from '../core/certificationRules.js';
import { getCertificationRecords, isCertificationStorageAvailable } from './certificationStore.js';

const formatDate = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

function levelCard(level, rec, rules) {
  const info = rules.levels[level];
  const next = getNextRank(level, rec.bestScore, rules);
  const rankList = h(
    'ol',
    { class: 'cert-rank-list' },
    info.thresholds.map((score, i) => {
      const rank = i + 1;
      const got = rec.bestRank >= rank;
      return h(
        'li',
        { class: `cert-rank-list__item ${got ? 'cert-rank-list__item--got' : ''}`, dataset: { rank: String(rank) } },
        h('span', {}, getRankLabel(rank, level)),
        h('span', {}, `${score}点`),
        h('span', { class: 'cert-rank-list__state' }, got ? '獲得' : '未獲得'),
      );
    }),
  );
  return h(
    'section',
    { class: `history-card cert-record cert-record--${level}`, dataset: { level } },
    h('h2', { class: 'history-card__name' }, info.label),
    h('p', { class: 'cert-record__rank', 'data-testid': 'best-rank' }, rec.bestRank > 0 ? getRankLabel(rec.bestRank, level) : '認定なし'),
    rec.attempts > 0
      ? h(
          'dl',
          { class: 'history-card__stats' },
          h('dt', {}, '最高得点'),
          h('dd', { 'data-testid': 'best-score' }, `${rec.bestScore}点`),
          h('dt', {}, '最高正解数'),
          h('dd', {}, `${rec.bestCorrect}問`),
          h('dt', {}, '挑戦回数'),
          h('dd', { 'data-testid': 'attempts' }, `${rec.attempts}回`),
          h('dt', {}, '最後に挑戦'),
          h('dd', {}, rec.lastPlayedAt ? formatDate(rec.lastPlayedAt) : '－'),
        )
      : h('p', { class: 'history-card__empty' }, 'まだ記録がありません'),
    h('p', { class: 'cert-record__next', 'data-testid': 'next-rank' }, next ? `次の段位「${next.label}」：${next.score}点（自己ベストとの差 ${next.remaining}点）` : `最高段位「${getRankLabel(MAX_RANK, level)}」を獲得しました！`),
    rec.recent.length > 0
      ? h('p', { class: 'history-card__recent' }, '最近：', rec.recent.slice(0, 5).map((r) => h('span', {}, `${formatDate(r.date)} ${r.score}点 ${r.rank > 0 ? getRankLabel(r.rank, level) : '認定なし'}`)))
      : null,
    rec.previous ? h('p', { class: 'setup-note' }, `前の基準での最高記録：${rec.previous.bestScore}点`) : null,
    h('details', { class: 'cert-record__ranks' }, h('summary', {}, '段位の一覧（21段階）'), rankList),
  );
}

export function mountCertificationRecordsScreen(container, { navigate }) {
  const rules = CERTIFICATION_RULES;
  const records = getCertificationRecords();
  container.append(
    h(
      'div',
      { class: 'page page--narrow' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('certification') }, '← 段位認定'),
        h('h1', {}, '段位・記録'),
      ),
      h(
        'p',
        { class: 'page-lead' },
        isCertificationStorageAvailable()
          ? '記録はこの端末のブラウザの中だけに保存されます。段位はレベルごとに別々で、低い成績で下がることはありません。'
          : 'この端末では記録を保存できません（挑戦はできます）。',
      ),
      h('div', { class: 'history-list' }, LEVELS.map((level) => levelCard(level, records.levels[level], rules))),
    ),
  );
  return { unmount() {} };
}
