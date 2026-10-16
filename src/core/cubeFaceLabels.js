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
export const STANDARD_DICE = Object.freeze({ ABCD: 1, EFGH: 6, ABFE: 2, CDHG: 5, BCGF: 3, DAEH: 4 });

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
export const FACE_UP = Object.freeze(
  Object.fromEntries(
    FACES.map((f) => {
      // 上面は -Z（奥）、底面は +Z（手前）、側面は +Y を「上」にする
      const up = f.normal[1] === 1 ? [0, 0, -1] : f.normal[1] === -1 ? [0, 0, 1] : [0, 1, 0];
      return [f.id, Object.freeze(up)];
    }),
  ),
);

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

// ---------- サイコロの目 ----------

/** 「3の目」のような言い方 */
export const pipLabel = (n) => `${n}の目`;

/**
 * 目の位置（面の中心を原点、一辺 1 の正方形。x は右、y は下が正）。
 * 面の「上」（FACE_UP）を上にしたときの並び。2・3 は右上から左下へ、6 はたて2列。
 */
export const PIP_LAYOUTS = Object.freeze({
  1: Object.freeze([[0, 0]]),
  2: Object.freeze([[0.25, -0.25], [-0.25, 0.25]]),
  3: Object.freeze([[0.25, -0.25], [0, 0], [-0.25, 0.25]]),
  4: Object.freeze([[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]),
  5: Object.freeze([[-0.25, -0.25], [0.25, -0.25], [0, 0], [-0.25, 0.25], [0.25, 0.25]]),
  6: Object.freeze([[-0.22, -0.27], [-0.22, 0], [-0.22, 0.27], [0.22, -0.27], [0.22, 0], [0.22, 0.27]]),
});

/** 目の半径（1の目は大きく赤くする） */
export const pipRadius = (n) => (n === 1 ? 0.17 : 0.085);
export const pipColor = (n) => (n === 1 ? '#d6232a' : '#1b2a41');

/** 向きによって見え方が変わる目（90°回すと並び方が変わる） */
export const ORIENTED_PIPS = Object.freeze([2, 3, 6]);

/**
 * 面を正面から見たときの目の並びの回り方（0 = 描いたまま / 90 = 90°回った並び）
 * 2・3・6 の目は 180° 回しても同じ見え方なので、0 と 90 の2通りにまとめる。
 */
export function pipTurnAsSeen(faceId, orientation, viewDirection) {
  const seen = arrowAsSeen(faceId, 'up', orientation, viewDirection);
  return seen === 'up' || seen === 'down' ? 0 : 90;
}

// ---------- マーク（向かい合う面の和が7ではないサイコロ） ----------

/**
 * ふつうの配置ではないサイコロは、目の代わりにマークで表す
 * （目の数の和という考え方が使えないので、目と区別する）。
 */
export const FACE_MARKS = Object.freeze(['〇', '◎', '×', '●', '◇', '◆']);

/**
 * マークの形（中心 0,0・一辺 1 の正方形の中）。文字（フォント）で描くと端末によって位置がずれるので、
 * SVG と 3D の両方でこの図形データから描き、面のちょうど中央にそろえる。
 *   circle: { r, fill: true } または { r, stroke }、polygon: { points, fill: true } または { points, stroke }、
 *   line: { from, to, stroke }
 */
const DIAMOND = [[0, -0.3], [0.3, 0], [0, 0.3], [-0.3, 0]];
export const MARK_SHAPES = Object.freeze({
  '〇': [{ type: 'circle', r: 0.25, stroke: 0.06 }],
  '◎': [{ type: 'circle', r: 0.27, stroke: 0.05 }, { type: 'circle', r: 0.13, stroke: 0.05 }],
  '×': [{ type: 'line', from: [-0.21, -0.21], to: [0.21, 0.21], stroke: 0.08 }, { type: 'line', from: [0.21, -0.21], to: [-0.21, 0.21], stroke: 0.08 }],
  '●': [{ type: 'circle', r: 0.25, fill: true }],
  '◇': [{ type: 'polygon', points: DIAMOND, stroke: 0.05 }],
  '◆': [{ type: 'polygon', points: DIAMOND, fill: true }],
});

export const symbolFace = (mark, extra = {}) => ({ kind: 'symbol', value: mark, label: mark, color: '#ffffff', textColor: '#1b2a41', ...extra });
export const symbolFaces = (byFace) => Object.fromEntries(FACES.map((f) => [f.id, symbolFace(byFace[f.id])]));

/** 面にマークをランダムに割り当てる */
export const randomSymbolAssignment = (rng) => {
  const marks = shuffle(FACE_MARKS, rng);
  return Object.fromEntries(FACES.map((f, i) => [f.id, marks[i]]));
};

/** 値（目の数 または マーク）から面の装飾を作る */
export const faceFromValue = (value) => (typeof value === 'number' ? numberFace(value) : symbolFace(value));
export const facesFromValues = (byFace) => Object.fromEntries(FACES.map((f) => [f.id, faceFromValue(byFace[f.id])]));

/** 文章での言い方（「3の目」・「〇」） */
export const markLabel = (value) => (typeof value === 'number' ? pipLabel(value) : `「${value}」`);
