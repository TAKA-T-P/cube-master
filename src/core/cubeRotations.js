/**
 * 立方体の 90° 回転（Three.js・DOM 非依存）
 *
 * 回転は成分が -1 / 0 / 1 の整数の 3×3 行列で表すため、何回かけ合わせても誤差が出ない。
 * 方向は立方体の中心から見た 6 方向（top / bottom / front / back / right / left）。
 *
 * 回転の定義（すべて画面の向きではなく、3D 座標で定義する）
 *   right     右へ転がす      … 元の上面が右側面になる（Z 軸まわり -90°）
 *   left      左へ転がす      … 元の上面が左側面になる（Z 軸まわり +90°）
 *   forward   前（手前）へ転がす … 元の上面が前面になる（X 軸まわり +90°。手前 = +Z）
 *   backward  後ろ（奥）へ転がす … 元の上面が後面になる（X 軸まわり -90°）
 *   turnRight 水平に右へ回す  … 元の前面が右側面になる（Y 軸まわり +90°）
 *   turnLeft  水平に左へ回す  … 元の前面が左側面になる（Y 軸まわり -90°）
 */

/** 6方向 */
export const DIRECTIONS = Object.freeze(['top', 'bottom', 'front', 'back', 'right', 'left']);

/** 方向の単位ベクトル（上 +Y・手前 +Z・右 +X） */
export const DIRECTION_VECTORS = Object.freeze({
  top: Object.freeze([0, 1, 0]),
  bottom: Object.freeze([0, -1, 0]),
  front: Object.freeze([0, 0, 1]),
  back: Object.freeze([0, 0, -1]),
  right: Object.freeze([1, 0, 0]),
  left: Object.freeze([-1, 0, 0]),
});

/** 方向の表示名 */
export const DIRECTION_LABELS = Object.freeze({ top: '上', bottom: '下', front: '前', back: '後ろ', right: '右', left: '左' });

const OPPOSITE = Object.freeze({ top: 'bottom', bottom: 'top', front: 'back', back: 'front', right: 'left', left: 'right' });

export const getOppositeDirection = (direction) => {
  if (!(direction in OPPOSITE)) throw new Error(`無効な方向です: ${direction}`);
  return OPPOSITE[direction];
};

/** ベクトル → 方向名（6方向のどれでもなければ null） */
export function directionFromVector(v) {
  return DIRECTIONS.find((d) => DIRECTION_VECTORS[d].every((x, i) => x === v[i])) ?? null;
}

// ---------- 行列 ----------

export const IDENTITY = Object.freeze([
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]);

/** 行列 × ベクトル */
export const applyMatrix = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

/** 行列 × 行列 */
export const multiplyMatrices = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));

export const transposeMatrix = (m) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => m[j][i]));

export const determinant = (m) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

export const matrixKey = (m) => m.flat().join(',');

/** 座標軸まわりの 90°×quarterTurns 回転（右ねじの向きが正） */
function axisRotation(axis, quarterTurns) {
  const q = ((quarterTurns % 4) + 4) % 4;
  const c = [1, 0, -1, 0][q];
  const s = [0, 1, 0, -1][q];
  if (axis === 'x') return [[1, 0, 0], [0, c, -s], [0, s, c]];
  if (axis === 'y') return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

// ---------- 回転の種類 ----------

/**
 * 回転の定義。axis / quarterTurns は 3D アニメーション用（右ねじの向きが正）。
 * roll: 転がす（底の辺を支点に転がる動き） / turn: 水平に回す
 */
export const ROTATION_MOVES = Object.freeze({
  right: Object.freeze({ id: 'right', axis: 'z', quarterTurns: -1, kind: 'roll', inverse: 'left', label: '右へ転がす', short: '右へ', icon: '→' }),
  left: Object.freeze({ id: 'left', axis: 'z', quarterTurns: 1, kind: 'roll', inverse: 'right', label: '左へ転がす', short: '左へ', icon: '←' }),
  forward: Object.freeze({ id: 'forward', axis: 'x', quarterTurns: 1, kind: 'roll', inverse: 'backward', label: '前（手前）へ転がす', short: '前へ', icon: '↓' }),
  backward: Object.freeze({ id: 'backward', axis: 'x', quarterTurns: -1, kind: 'roll', inverse: 'forward', label: '後ろ（奥）へ転がす', short: '後ろへ', icon: '↑' }),
  turnRight: Object.freeze({ id: 'turnRight', axis: 'y', quarterTurns: 1, kind: 'turn', inverse: 'turnLeft', label: '水平に右へ回す', short: '水平に右へ', icon: '↻' }),
  turnLeft: Object.freeze({ id: 'turnLeft', axis: 'y', quarterTurns: -1, kind: 'turn', inverse: 'turnRight', label: '水平に左へ回す', short: '水平に左へ', icon: '↺' }),
});

export const MOVE_IDS = Object.freeze(Object.keys(ROTATION_MOVES));
export const ROLL_MOVE_IDS = Object.freeze(MOVE_IDS.filter((id) => ROTATION_MOVES[id].kind === 'roll'));

export function getMove(moveId) {
  const move = ROTATION_MOVES[moveId];
  if (!move) throw new Error(`無効な回転です: ${moveId}`);
  return move;
}

/** 回転の行列 */
export const getMoveMatrix = (moveId) => {
  const { axis, quarterTurns } = getMove(moveId);
  return axisRotation(axis, quarterTurns);
};

/** 回転で、方向 d にあった面が移る方向 */
export const moveDirection = (moveId, direction) => directionFromVector(applyMatrix(getMoveMatrix(moveId), DIRECTION_VECTORS[direction]));

/**
 * 「方向 → 何か」の対応表（向き・数字の配置など）を回転させる
 * @param {Record<string, any>} labeling 6方向すべてのキーをもつオブジェクト
 * @param {number[][]} matrix 回転行列
 */
export function rotateLabeling(labeling, matrix) {
  const result = {};
  for (const d of DIRECTIONS) result[directionFromVector(applyMatrix(matrix, DIRECTION_VECTORS[d]))] = labeling[d];
  return result;
}

/** 24 通りの回転行列（立方体の回転群。鏡映しは含まない） */
export const ALL_ROTATIONS = Object.freeze(
  (() => {
    const found = new Map([[matrixKey(IDENTITY), IDENTITY]]);
    const queue = [IDENTITY];
    while (queue.length > 0) {
      const m = queue.shift();
      for (const id of MOVE_IDS) {
        const next = multiplyMatrices(getMoveMatrix(id), m);
        const key = matrixKey(next);
        if (!found.has(key)) {
          found.set(key, next);
          queue.push(next);
        }
      }
    }
    return [...found.values()];
  })(),
);
