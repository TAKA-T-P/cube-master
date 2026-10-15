/**
 * 立方体の向き（CubeOrientation。Three.js・DOM 非依存）
 *
 * 向き = 「各方向にどの面 ID があるか」の対応表。
 *   { top: 'EFGH', bottom: 'ABCD', front: 'ABFE', back: 'CDHG', right: 'BCGF', left: 'DAEH' }
 * 面 ID は回転しても変わらない。変わるのは、各面がどの方向を向いているかだけ。
 * 立方体の向きは全部で 24 通り（鏡映しは含まない）。
 */
import { FACES } from './cubeConstants.js';
import {
  DIRECTIONS,
  DIRECTION_VECTORS,
  ALL_ROTATIONS,
  IDENTITY,
  getMoveMatrix,
  rotateLabeling,
  directionFromVector,
  determinant,
  multiplyMatrices,
  matrixKey,
  getMove,
  MOVE_IDS,
  getOppositeDirection,
} from './cubeRotations.js';

export { getOppositeDirection };

/** はじめの向き（面の外向き法線どおり） */
export const INITIAL_ORIENTATION = Object.freeze(
  Object.fromEntries(DIRECTIONS.map((d) => [d, FACES.find((f) => directionFromVector(f.normal) === d).id])),
);

const faceNormalDirection = Object.fromEntries(FACES.map((f) => [f.id, directionFromVector(f.normal)]));

/** 正しい向き（6面が1つずつ、回転で作れる配置）か */
export function isValidOrientation(orientation) {
  if (!orientation || typeof orientation !== 'object') return false;
  const faces = DIRECTIONS.map((d) => orientation[d]);
  if (faces.some((f) => !(f in faceNormalDirection)) || new Set(faces).size !== 6) return false;
  return determinant(orientationToMatrix(orientation)) === 1;
}

/**
 * 向き → 回転行列（はじめの向きからこの向きへの回転。3D モデルの回転と一致する）
 * 行列の各列は、X・Y・Z 方向を向いていた面（BCGF・EFGH・ABFE）がいま向いている方向
 */
export function orientationToMatrix(orientation) {
  const dirOf = (faceId) => DIRECTIONS.find((d) => orientation[d] === faceId);
  const cols = ['right', 'top', 'front'].map((d) => DIRECTION_VECTORS[dirOf(INITIAL_ORIENTATION[d])]);
  return [0, 1, 2].map((i) => cols.map((c) => c[i]));
}

/** 回転行列 → 向き */
export const matrixToOrientation = (matrix) => rotateLabeling(INITIAL_ORIENTATION, matrix);

/** 1回の 90° 回転 */
export function rotateOrientation(orientation, moveId) {
  return rotateLabeling(orientation, getMoveMatrix(moveId));
}

/** 続けて回転 */
export function rotateOrientationSequence(orientation, moveIds) {
  return moveIds.reduce((o, m) => rotateOrientation(o, m), orientation);
}

/** その方向にある面 ID */
export function getFaceAtDirection(orientation, direction) {
  if (!DIRECTIONS.includes(direction)) throw new Error(`無効な方向です: ${direction}`);
  return orientation[direction];
}

/** その面がいま向いている方向 */
export function getDirectionOfFace(orientation, faceId) {
  const d = DIRECTIONS.find((dir) => orientation[dir] === faceId);
  if (!d) throw new Error(`無効な面IDです: ${faceId}`);
  return d;
}

/** 向きの比較用キー（上と前の面で 24 通りが区別できる） */
export const orientationKey = (orientation) => `${orientation.top}/${orientation.front}`;

export const orientationsEqual = (a, b) => DIRECTIONS.every((d) => a[d] === b[d]);

/** 24 通りの向き */
export const ALL_ORIENTATIONS = Object.freeze(ALL_ROTATIONS.map((m) => Object.freeze(matrixToOrientation(m))));

/** 回転を続けて行ったときの行列 */
export const sequenceMatrix = (moveIds) => moveIds.reduce((m, id) => multiplyMatrices(getMoveMatrix(id), m), IDENTITY);

/**
 * from の向きから to の向きにする、いちばん短い回転の手順
 * @param {string[]} [allowedMoves] 使ってよい回転（既定はすべて）
 */
export function findRotationPath(from, to, allowedMoves = MOVE_IDS) {
  const goal = orientationKey(to);
  const seen = new Set([orientationKey(from)]);
  const queue = [{ o: from, path: [] }];
  while (queue.length > 0) {
    const { o, path } = queue.shift();
    if (orientationKey(o) === goal) return path;
    for (const m of allowedMoves) {
      getMove(m);
      const next = rotateOrientation(o, m);
      const key = orientationKey(next);
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ o: next, path: [...path, m] });
      }
    }
  }
  return null;
}

export { matrixKey };
