/**
 * 段位認定：結果発表（得点のカウントアップ → 正解数・正答率・最大連続正解 → 段位 → 自己ベスト・昇段）
 *
 * 昇段の演出は、最高段位が上がったときだけ出す（初段・十段・皆伝は少し豪華に）。画面をタップすると演出をとばせる。
 */
import { h } from '../utils/dom.js';
import { button } from './components.js';
import { getRankLabel, getNextRank, levelLabel, SPECIAL_RANKS } from '../core/certificationRules.js';
import { getCertificationResult, startCertification } from './certificationStore.js';
import { startCertificationReview } from './trainingStore.js';
import { getCategory } from '../questions/questionRegistry.js';
import { playRankUpSound } from './answerSound.js';

const COUNT_UP_MS = 1200;

/** 「五段＋ 認定！」（十段は「達成！」） */
export function rankHeadline(rank, level) {
  if (rank === 0) return '認定なし';
  return `${getRankLabel(rank, level)} ${rank === 20 ? '達成！' : '認定！'}`;
}

export function mountCertificationResultScreen(container, { navigate }) {
  const result = getCertificationResult();
  if (!result) {
    navigate('certification');
    return { unmount() {} };
  }
  const { summary, outcome, level } = result;
  const timers = [];
  let finished = false;

  const scoreValue = h('span', { class: 'cert-result__score-value', 'data-testid': 'cert-final-score' }, '0');
  const details = h('div', { class: 'cert-result__details', hidden: true });
  const rankEl = h('p', { class: 'cert-result__rank', hidden: true, 'data-testid': 'cert-rank' }, rankHeadline(summary.rankLevel, level));
  const badges = h('div', { class: 'cert-result__badges', hidden: true });

  const rankUp = outcome?.rankUp;
  const special = rankUp && SPECIAL_RANKS.includes(outcome.newRank);
  if (rankUp) {
    const from = outcome.previousRank === 0 ? '初めての認定' : getRankLabel(outcome.previousRank, level);
    badges.append(h('p', { class: `cert-rankup ${special ? 'cert-rankup--special' : ''}`, 'data-testid': 'cert-rankup' }, `昇段！ ${from} → ${getRankLabel(outcome.newRank, level)}`));
  }
  if (outcome?.bestScoreUpdated) badges.append(h('p', { class: 'cert-best', 'data-testid': 'cert-best' }, '自己ベスト更新！'));
  if (!outcome?.recorded) badges.append(h('p', { class: 'setup-note' }, 'この記録は保存されていません。'));

  const next = getNextRank(level, summary.score);
  const sec = (ms) => (ms / 1000).toFixed(1);
  const categoryRows = Object.entries(summary.byCategory).map(([id, c]) => h('li', {}, h('span', {}, getCategory(id)?.name ?? id), h('span', {}, `${c.correct} / ${c.answered}問`)));
  details.append(
    h(
      'dl',
      { class: 'result-meta cert-result__stats' },
      h('dt', {}, '正解数'),
      h('dd', { 'data-testid': 'cert-correct' }, `${summary.correctCount}問（${summary.answeredCount}問中）`),
      h('dt', {}, '正答率'),
      h('dd', {}, `${Math.round(summary.accuracy * 100)}%`),
      h('dt', {}, '最大連続正解'),
      h('dd', {}, `${summary.maxStreak}問`),
      h('dt', {}, '誤答の減点'),
      h('dd', {}, summary.deductionTotal > 0 ? `−${summary.deductionTotal}点（${summary.mistakeCount}回）` : 'なし'),
      h('dt', {}, '多答問題ボーナス'),
      h('dd', {}, summary.timeBonusTotalMs > 0 ? `+${Math.round(summary.timeBonusTotalMs / 1000)}秒` : 'なし'),
      h('dt', {}, 'パス'),
      h('dd', {}, summary.passCount > 0 ? `${summary.passCount}回（残り時間 −${Math.round(summary.passPenaltyTotalMs / 1000)}秒）` : 'なし'),
      h('dt', {}, '平均解答時間'),
      h('dd', {}, summary.answeredCount > 0 ? `${sec(summary.averageAnswerMs)}秒` : '－'),
    ),
    categoryRows.length > 0 ? h('ul', { class: 'cert-result__categories', 'aria-label': 'カテゴリ別の正解数' }, categoryRows) : null,
    h('p', { class: 'cert-result__next' }, next ? `次の段位「${next.label}」まで あと${next.remaining}点（${next.score}点）` : '最高段位です！'),
  );

  // 演出の最後（タップでもここまで進む）
  function showAll() {
    if (finished) return;
    finished = true;
    for (const t of timers) clearTimeout(t);
    scoreValue.textContent = String(summary.score);
    details.hidden = false;
    rankEl.hidden = false;
    badges.hidden = false;
    rankEl.classList.add('cert-result__rank--show');
    if (special) rankEl.classList.add('cert-result__rank--special');
    if (rankUp) playRankUpSound();
  }

  // 得点のカウントアップ → 段位
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    timers.push(setTimeout(() => !finished && (scoreValue.textContent = String(Math.round((summary.score * i) / steps))), (COUNT_UP_MS * i) / steps));
  }
  timers.push(setTimeout(() => showAll(), COUNT_UP_MS + 300));

  const mistakes = summary.history.filter((x) => !x.isCorrect && x.question).map((x) => x.question);
  container.append(
    h(
      'div',
      { class: 'page page--narrow cert-result', onClick: (e) => !e.target.closest('button') && showAll() },
      h('header', { class: 'page-header' }, h('h1', {}, `段位認定の結果（${levelLabel(level)}）`)),
      h(
        'section',
        { class: 'result-card cert-result__card' },
        h('p', { class: 'cert-result__timeup' }, 'TIME UP！'),
        h('p', { class: 'cert-result__score' }, scoreValue, h('span', {}, '点')),
        rankEl,
        badges,
        details,
      ),
      h(
        'div',
        { class: 'result-actions' },
        button(
          'もう一度挑戦',
          () => {
            startCertification(level);
            navigate('certification-play', { level });
          },
          'btn--primary btn--large',
        ),
        mistakes.length > 0
          ? button(`間違えた問題を復習（${mistakes.length}問）`, () => {
              if (startCertificationReview(mistakes)) navigate('question', { review: 'cert' });
            })
          : null,
        button('レベルを変更', () => navigate('certification')),
        button('段位・記録を見る', () => navigate('certification-records')),
        button('ホームへ', () => navigate('home'), 'btn--ghost'),
      ),
    ),
  );
  return {
    unmount() {
      for (const t of timers) clearTimeout(t);
    },
  };
}
