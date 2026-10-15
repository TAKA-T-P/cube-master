/**
 * 面の装飾（数字・色・記号）のデータ（Three.js・DOM 非依存）
 *
 * 装飾は面 ID に結びつけて持つので、立方体を回転させても数字や色は同じ面から動かない。
 *   { kind: 'number'|'color'|'unknown', value, label, color, textColor, arrow? }
 *   - value : 正誤判定や比較に使う値（数字 / 色 ID）
 *   - label : 面に表示する文字（色の面でも色名を表示し、色だけに頼らない）
 *   - arrow : 面に描く矢印の向き（'up'|'right'|'down'|'left'。面ごとの「上」が基準）
 */
import { FACES } from './cubeConstants.js';
import { DIRECTION_VECTORS, DIRECTIONS } from './cubeRotations.js';
import { orientationToMatrix, getDirectionOfFace } from './cubeOrientation.js';
import { applyMatrix } from './cubeRotations.js';
import { vecCross, vecDot } from './cubeGeometry.js';
import { shuffle } from '../utils/random.js';

/** ふつうのサイコロ（向かい合う面の和が 7。1 が上・2 が前・3 が右） */
export const STANDARD_DICE = Object.freeze({ EFGH: 1, ABCD: 6, ABFE: 2, CDHG: 5, BCGF: 3, DAEH: 4 });

/** 6色（色名と文字色つき） */
export const FACE_COLORS = Object.freeze([
  Object.freeze({ id: 'red', name: '赤', hex: '#e53935', textColor: '#ffffff' }),
  Object.freeze({ id: 'blue', name: '青', hex: '#1e63d6', textColor: '#ffffff' }),
  Object.freeze({ id: 'yellow', name: '黄', hex: '#f5c400', textColor: '#3a2c00' }),
  Object.freeze({ id: 'green', name: '緑', hex: '#2e9e4a', textColor: '#ffffff' }),
  Object.freeze({ id: 'purple', name: '紫', hex: '#8e44ad', textColor: '#ffffff' }),
  Object.freeze({ id: 'orange', name: 'オレンジ', hex: '#f57c00', textColor: '#ffffff' }),
]);

export const getFaceColor = (id) => FACE_COLORS.find((c) => c.id === id) ?? null;

export const numberFace = (n, extra = {}) => ({ kind: 'number', value: n, label: String(n), color: '#ffffff', textColor: '#1b2a41', ...extra });

export function colorFace(colorId, extra = {}) {
  const c = getFaceColor(colorId);
  if (!c) throw new Error(`無効な色です: ${colorId}`);
  return { kind: 'color', value: c.id, label: c.name, color: c.hex, textColor: c.textColor, ...extra };
}

/** まだわからない面（条件だけを示す図などで使う） */
export const unknownFace = () => ({ kind: 'unknown', value: null, label: '？', color: '#d9dee5', textColor: '#52627a' });

/** 面 ID → 値 から、面 ID → 装飾 を作る */
export const numberFaces = (byFace) => Object.fromEntries(FACES.map((f) => [f.id, numberFace(byFace[f.id])]));
export const colorFaces = (byFace) => Object.fromEntries(FACES.map((f) => [f.id, colorFace(byFace[f.id])]));

/** 面に 1〜6 をランダムに割り当てる */
export const randomNumberAssignment = (rng) => {
  const values = shuffle([1, 2, 3, 4, 5, 6], rng);
  return Object.fromEntries(FACES.map((f, i) => [f.id, values[i]]));
};

/** 面に 6 色をランダムに割り当てる */
export const randomColorAssignment = (rng) => {
  const ids = shuffle(FACE_COLORS.map((c) => c.id), rng);
  return Object.fromEntries(FACES.map((f, i) => [f.id, ids[i]]));
};

/** 向かい合う面の和が 7 か */
export function isStandardDice(byFace) {
  return FACES.every((f) => {
    const opposite = FACES.find((g) => g.normal.every((n, i) => n === -f.normal[i]));
    return byFace[f.id] + byFace[opposite.id] === 7;
  });
}

/** いまの向きで、方向 → 装飾（または値） */
export function byDirection(byFace, orientation) {
  return Object.fromEntries(DIRECTIONS.map((d) => [d, byFace[orientation[d]]]));
}

// ---------- 面の上の向き（矢印・文字の向き） ----------

/**
 * はじめの向きでの、各面の「上」（ワールド座標）。
 * その面を正面から見たときに上を向く方向にそろえてある（上面は「前を下にして真上から」見たとき）。
 */
export const FACE_UP = Object.freeze({
  EFGH: Object.freeze([0, 0, -1]),
  ABCD: Object.freeze([0, 0, 1]),
  ABFE: Object.freeze([0, 1, 0]),
  CDHG: Object.freeze([0, 1, 0]),
  BCGF: Object.freeze([0, 1, 0]),
  DAEH: Object.freeze([0, 1, 0]),
});

/** 面を正面から見たときの、画面の右と上（ワールド座標） */
export const VIEW_FRAMES = Object.freeze({
  front: Object.freeze({ right: [1, 0, 0], up: [0, 1, 0] }),
  back: Object.freeze({ right: [-1, 0, 0], up: [0, 1, 0] }),
  right: Object.freeze({ right: [0, 0, -1], up: [0, 1, 0] }),
  left: Object.freeze({ right: [0, 0, 1], up: [0, 1, 0] }),
  top: Object.freeze({ right: [1, 0, 0], up: [0, 0, -1] }), // 前が下になるように真上から
  bottom: Object.freeze({ right: [1, 0, 0], up: [0, 0, 1] }), // 前が上になるように真下から
});

export const ARROWS = Object.freeze(['up', 'right', 'down', 'left']);
export const ARROW_LABELS = Object.freeze({ up: '上向き', right: '右向き', down: '下向き', left: '左向き' });

/** 面の上で、矢印が指すワールド方向（はじめの向き） */
function arrowVector(faceId, arrow) {
  const n = FACES.find((f) => f.id === faceId).normal;
  const up = FACE_UP[faceId];
  const right = vecCross(up, n);
  const neg = (v) => v.map((x) => -x);
  return { up, right, down: neg(up), left: neg(right) }[arrow];
}

/**
 * 回転したあとの立方体を、面の正面（viewDirection の方向）から見たときの矢印の向き
 * @returns {'up'|'right'|'down'|'left'}
 */
export function arrowAsSeen(faceId, arrow, orientation, viewDirection) {
  if (getDirectionOfFace(orientation, faceId) !== viewDirection) throw new Error('その方向から見える面ではありません');
  const v = applyMatrix(orientationToMatrix(orientation), arrowVector(faceId, arrow));
  const frame = VIEW_FRAMES[viewDirection];
  const x = vecDot(v, frame.right);
  const y = vecDot(v, frame.up);
  if (y === 1) return 'up';
  if (y === -1) return 'down';
  return x === 1 ? 'right' : 'left';
}

export { DIRECTION_VECTORS };
