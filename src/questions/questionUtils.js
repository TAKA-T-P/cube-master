/**
 * 問題生成の共通ヘルパー（カテゴリ共通）
 */
import { ELEMENT_TYPES } from '../core/cubeConstants.js';
import { resolveElement, getVertexPosition, getEdgeMidpoint, getFaceCenter } from '../core/cubeGeometry.js';
import { shuffle, sample } from '../utils/random.js';

const TYPE_PREFIX = { vertex: '頂点', edge: '辺', face: '面' };

/** 要素の表示名（'AB' → '辺AB'） */
export function elementLabel(id) {
  const el = resolveElement(id);
  return `${TYPE_PREFIX[el.type]}${el.id}`;
}

/** 要素の表示名を「・」でつなぐ（'辺CD・辺EF・辺GH'） */
export const joinLabels = (ids) => ids.map(elementLabel).join('・');

/** 要素の中心座標 */
export function getElementCenter(id) {
  const el = resolveElement(id);
  if (el.type === ELEMENT_TYPES.VERTEX) return getVertexPosition(el.id);
  if (el.type === ELEMENT_TYPES.EDGE) return getEdgeMidpoint(el.id);
  return getFaceCenter(el.id);
}

/**
 * 基準要素が手前に来るカメラの向き。
 * 上から見下ろす角度は保ったまま、左右・前後だけ基準要素の側に回り込む。
 * @returns {'default' | number[]}
 */
export function viewDirectionFor(elementIds) {
  if (elementIds.length === 0) return 'default';
  const center = elementIds.map(getElementCenter).reduce((s, c) => s.map((v, i) => v + c[i]), [0, 0, 0]);
  const sx = center[0] < -1e-9 ? -1 : 1;
  const sz = center[2] < -1e-9 ? -1 : 1;
  if (sx === 1 && sz === 1) return 'default';
  return [4 * sx, 3, 5 * sz];
}

/** 立方体の要素を選択肢にする */
export const elementChoice = (id) => ({ id: resolveElement(id).id, label: elementLabel(id), elementId: resolveElement(id).id });

/**
 * 正解 + まぎらわしい誤答で選択肢を作る（順番はエンジン側でシャッフル）
 * @param {{ correct: string[], pool: string[], preferred?: string[], total: number, rng: () => number }} params
 *   pool: 誤答候補（正解・基準要素を除いたもの） / preferred: 優先して入れる誤答候補
 */
export function buildElementChoices({ correct, pool, preferred = [], total, rng }) {
  const candidates = pool.filter((id) => !correct.includes(id));
  const wanted = Math.max(0, total - correct.length);
  const strong = sample(preferred.filter((id) => candidates.includes(id)), wanted, rng);
  const rest = sample(candidates.filter((id) => !strong.includes(id)), wanted - strong.length, rng);
  return shuffle([...correct, ...strong, ...rest], rng).map(elementChoice);
}

/** 複数回答問題の選択肢数：正解 + 2（4〜6 の範囲） */
export const multipleChoiceTotal = (correctCount) => Math.min(6, Math.max(4, correctCount + 2));
