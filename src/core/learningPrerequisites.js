/**
 * 問題を解くのに必要な知識（Three.js・DOM 非依存）
 *
 * 問題データの prerequisites（文字列の配列）に入れる。問題の難易度（★）とは別に、「解くために何を知っている必要があるか」を表す。
 * - pythagorean・squareRoot（三平方の定理・√）：知らないと解けない問題は、設定によって出題しない（core/questionEligibility）
 * - そのほか（角柱・角すいの体積、立体の種類、正多面体、ねじれの位置）：出題はするが、学習ヘルプで確かめられるようにする（core/learningHelp）
 *
 * 判定は「プログラムの中の計算方法」ではなく「生徒が解くのに必要な知識」で決める。
 * 内部で √ を使って正解を確かめていても、図形の性質（対称・直角・折れ線より直線が短いなど）だけで解けるなら、√ は必要ない。
 */
export const PREREQUISITES = Object.freeze({
  PYTHAGOREAN: 'pythagorean',
  SQUARE_ROOT: 'squareRoot',
  PRISM_VOLUME: 'prismVolume',
  PYRAMID_VOLUME: 'pyramidVolume',
  SOLID_TYPES: 'solidTypes',
  REGULAR_POLYHEDRA: 'regularPolyhedra',
  SKEW_LINES: 'skewLines',
});

export const PREREQUISITE_IDS = Object.freeze(Object.values(PREREQUISITES));

/** 設定によって出題しない知識（三平方の定理・√） */
export const ADVANCED_MATH = Object.freeze([PREREQUISITES.PYTHAGOREAN, PREREQUISITES.SQUARE_ROOT]);

/** 三平方の定理・√ の両方（長さ・面積を √ で答える問題など） */
export const PYTHAGOREAN_AND_ROOT = Object.freeze([PREREQUISITES.PYTHAGOREAN, PREREQUISITES.SQUARE_ROOT]);

/** 必要な知識の一覧として正しいか */
export const isValidPrerequisites = (list) => Array.isArray(list) && list.every((p) => PREREQUISITE_IDS.includes(p)) && new Set(list).size === list.length;
