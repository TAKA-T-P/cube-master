/**
 * 段位認定のルール（得点・時間・出題・段位の基準。Three.js・DOM 非依存）
 *
 * 数値はすべてここで一元管理する。プレイテストのあとに基準を変えるときは、ここだけを変え、
 * CERTIFICATION_RULES.rulesVersion を 1 つ上げる（記録は rulesVersion ごとに分けて保存されるので、古い基準の記録と混ざらない）。
 *
 * 段位は内部では 1〜21 の整数（rankLevel）で表す。数が大きいほど上位。0 は「認定なし」。
 *   1：10級 … 10：1級、11：初段 … 20：十段、21：皆伝
 * 表示名はレベルごとに、ベーシックは段位名のみ・スタンダードは「＋」・エキスパートは「★」を直後に付ける（例：五段＋）。
 */

import { TIMED_REVEAL } from './revealSettings.js';

export const RANK_NAMES = Object.freeze([
  '10級', '9級', '8級', '7級', '6級',
  '5級', '4級', '3級', '2級', '1級',
  '初段', '二段', '三段', '四段', '五段',
  '六段', '七段', '八段', '九段', '十段',
  '皆伝',
]);
export const MAX_RANK = RANK_NAMES.length; // 21
export const NO_RANK = 0;

export const LEVELS = Object.freeze(['basic', 'standard', 'expert']);
export const LEVEL_SUFFIX = Object.freeze({ basic: '', standard: '＋', expert: '★' });

/** 少し豪華な昇段演出をする段位（初段・十段・皆伝） */
export const SPECIAL_RANKS = Object.freeze([11, 20, 21]);

/**
 * 段位の表示名（'五段＋' など。0 は '認定なし'）
 * @param {number} rankLevel 0〜21
 * @param {'basic'|'standard'|'expert'} level
 */
export function getRankLabel(rankLevel, level) {
  if (rankLevel === NO_RANK) return '認定なし';
  const name = RANK_NAMES[rankLevel - 1];
  const suffix = LEVEL_SUFFIX[level];
  if (!name || suffix === undefined) throw new Error(`段位またはレベルが不正です: ${rankLevel} / ${level}`);
  return name + suffix;
}

/**
 * 21段階の必要スコア（仮の基準。rankLevel 1〜21 の順。どれも前より大きい）
 * 3つのレベルで共通。10級 100 点 〜 1級 1000 点（100 点ごと）、初段 1100 点 〜 三段 1300 点（100 点ごと）、
 * 四段 1450 点 〜 皆伝 2500 点（150 点ごと）。レベルごとに変えたいときは、levels の thresholds を別々にする。
 */
const THRESHOLDS = Object.freeze([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1450, 1600, 1750, 1900, 2050, 2200, 2350, 2500]);

export const CERTIFICATION_RULES = Object.freeze({
  rulesVersion: 3,
  durationMs: 100000,
  overtimeMs: 15000, // ロスタイム：残り0秒のときの問題（最終問題）は、答えるかこの時間がたつまで続けられる
  /** 完全正解の得点（問題の難易度ごと）。部分正解・不正解は 0 点 */
  points: Object.freeze({ 1: 100, 2: 160, 3: 240 }),
  /**
   * 誤答（不正解・部分正解）の減点：n 回目の誤答で perMistake × n 点（n は maxMultiplier まで）。まちがえるほど重くなる。
   * 得点は 0 点より下がらない
   */
  mistakePenalty: Object.freeze({ perMistake: 50, maxMultiplier: 6 }),
  /** パス（問題を入れかえる）：n 回目のパスで残り時間から perPassMs × n を引く。パスは回答に数えず、減点もしないが、連続正解は 0 に戻る */
  passPenalty: Object.freeze({ perPassMs: 2000 }),
  /** 答えが複数ある問題（多答問題）に完全正解したときに、残り時間に加える時間 */
  multipleAnswerTimeBonusMs: 3000,
  /** 連続正解ボーナス（連続正解数が min 以上のとき、その問題に加える点。上から順に調べる） */
  streakBonus: Object.freeze([Object.freeze({ min: 5, bonus: 40 }), Object.freeze({ min: 3, bonus: 20 })]),
  /**
   * カウントダウン・回答後の「○△×」・3D 演出の速さ・次の問題へ進むまでの待ち時間（どれもタイマーは止まっている）。
   * 1分チャレンジと同じ値（core/revealSettings の TIMED_REVEAL）
   */
  ...TIMED_REVEAL,
  /** 同じカテゴリを続けて出してよい数（2 = 3問以上は続けない） */
  maxSameCategoryRun: 2,
  /** 出題するカテゴリ（新しいカテゴリを段位認定に入れるときは、ここに加える） */
  categories: Object.freeze(['netMapping', 'position', 'netPuzzle', 'dice', 'paintedCube', 'projection']),
  /** 段位認定では出題しないテンプレート（プレイテストで時間がかかりすぎるものがあれば、ここに入れる） */
  excludedTemplates: Object.freeze([]),
  /** 問題ごとの考える時間の目安（秒）。テンプレート ID ごとに上書きできる。出題の調整・分析用 */
  recommendedSeconds: Object.freeze({ byDifficulty: Object.freeze({ 1: 8, 2: 12, 3: 18 }), byTemplate: Object.freeze({}) }),
  levels: Object.freeze({
    basic: Object.freeze({ label: 'ベーシック', description: '基本的な空間認識を試そう！', difficultyWeights: Object.freeze({ 1: 1 }), thresholds: THRESHOLDS }),
    standard: Object.freeze({
      label: 'スタンダード',
      description: '位置関係や、何段階かの思考に挑戦！',
      difficultyWeights: Object.freeze({ 1: 0.3, 2: 0.7 }),
      thresholds: THRESHOLDS,
    }),
    expert: Object.freeze({
      label: 'エキスパート',
      description: '難しい空間推理に挑戦！',
      difficultyWeights: Object.freeze({ 2: 0.3, 3: 0.7 }),
      thresholds: THRESHOLDS,
    }),
  }),
});

export const isLevel = (level) => LEVELS.includes(level);
export const levelLabel = (level, rules = CERTIFICATION_RULES) => rules.levels[level]?.label ?? level;

/** スコアで認定される段位（0〜21） */
export function getRankForScore(level, score, rules = CERTIFICATION_RULES) {
  const thresholds = rules.levels[level]?.thresholds;
  if (!thresholds) throw new Error(`レベルが不正です: ${level}`);
  let rank = NO_RANK;
  thresholds.forEach((min, i) => {
    if (score >= min) rank = i + 1;
  });
  return Math.min(rank, MAX_RANK);
}

/** 次の段位と、必要なスコア・あと何点か（皆伝なら null） */
export function getNextRank(level, score, rules = CERTIFICATION_RULES) {
  const rank = getRankForScore(level, score, rules);
  if (rank >= MAX_RANK) return null;
  const need = rules.levels[level].thresholds[rank];
  return { rankLevel: rank + 1, label: getRankLabel(rank + 1, level), score: need, remaining: Math.max(0, need - score) };
}

/** 問題の考える時間の目安（秒） */
export const recommendedSecondsFor = (templateId, difficulty, rules = CERTIFICATION_RULES) =>
  rules.recommendedSeconds.byTemplate[templateId] ?? rules.recommendedSeconds.byDifficulty[difficulty] ?? 10;
