/**
 * 立方体パズルの検証（Three.js・DOM 非依存）
 *
 * 「提示した情報から答えが1つに決まるか」を、ありうる配置をすべて調べて確かめる。
 * 配置は「方向 → 値」（いま見えている向きを基準）で表す。値は数字や色 ID などの比較できる値。
 */
import { DIRECTIONS, ALL_ROTATIONS, rotateLabeling, getOppositeDirection } from './cubeRotations.js';

/** 見取図で見える3面（上・前・右） */
export const VIEW_DIRECTIONS = Object.freeze(['top', 'front', 'right']);

/** 見取図（上・前・右）の値 */
export const viewOf = (byDir) => ({ top: byDir.top, front: byDir.front, right: byDir.right });

/** 鏡に映した見取図（前と右を入れかえる。回転では作れない） */
export const mirrorView = (view) => ({ top: view.top, front: view.right, right: view.front });

export const viewKey = (view) => VIEW_DIRECTIONS.map((d) => String(view[d])).join('|');

/** 6面の配置を回転して、見取図と一致させられる回転行列の一覧 */
export function findViewRotations(byDir, view) {
  return ALL_ROTATIONS.filter((m) => {
    const r = rotateLabeling(byDir, m);
    return VIEW_DIRECTIONS.every((d) => r[d] === view[d]);
  });
}

/** 6面の配置を回転して、見取図と同じにできるか */
export const canMatchView = (byDir, view) => findViewRotations(byDir, view).length > 0;

/**
 * 一部の面だけがわかっている配置を回転して、条件（方向 → 値）を満たせるか
 * 6面の値はすべて異なるものとする（見えている値は、見えていない面には来ない）。
 * @param {Record<string, any>} partial わからない面は undefined / null
 * @returns {true|false|null} null = わからない面しだいで決まらない
 */
export function canSatisfyConditions(partial, conditions) {
  const isUnknown = (v) => v === undefined || v === null;
  const knownValues = new Set(Object.values(partial).filter((v) => !isUnknown(v)));
  let undecided = false;
  for (const m of ALL_ROTATIONS) {
    const r = rotateLabeling(partial, m);
    let ok = true;
    let unknown = false;
    for (const [d, v] of Object.entries(conditions)) {
      if (isUnknown(r[d])) {
        if (knownValues.has(v)) ok = false; // その値はほかの面にあるので、ここには来ない
        else unknown = true;
      } else if (r[d] !== v) ok = false;
    }
    if (ok && !unknown) return true;
    if (ok && unknown) undecided = true;
  }
  return undecided ? null : false;
}

/** 配列の順列 */
function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));
}

/**
 * 提示した情報と矛盾しない、6面の配置をすべて列挙する
 * @param {{ values: any[],                       // 6面の値（重複なし）
 *           known?: Record<string, any>,          // 見えている面（方向 → 値）
 *           oppositeSum?: number,                 // 「向かい合う面の和は〇」
 *           views?: Record<string, any>[] }} info // 同じ立方体を別の向きから見た見取図（回転は不明）
 */
export function enumerateLabelings({ values, known = {}, oppositeSum = null, views = [] }) {
  const knownDirs = Object.keys(known);
  const free = DIRECTIONS.filter((d) => !knownDirs.includes(d));
  const rest = values.filter((v) => !Object.values(known).includes(v));
  if (rest.length !== free.length) return [];
  const result = [];
  for (const p of permutations(rest)) {
    const byDir = { ...known };
    free.forEach((d, i) => (byDir[d] = p[i]));
    if (oppositeSum !== null && !DIRECTIONS.every((d) => byDir[d] + byDir[getOppositeDirection(d)] === oppositeSum)) continue;
    if (!views.every((v) => canMatchView(byDir, v))) continue;
    result.push(byDir);
  }
  return result;
}

/**
 * 答えが1つに決まるか
 * @param {object} info enumerateLabelings と同じ
 * @param {(byDir) => any} answerOf 配置から答えを求める関数
 * @returns {{ unique: boolean, answers: any[], count: number }}
 */
export function solveUnique(info, answerOf) {
  const labelings = enumerateLabelings(info);
  const answers = [...new Set(labelings.map(answerOf))];
  return { unique: labelings.length > 0 && answers.length === 1, answers, count: labelings.length };
}
