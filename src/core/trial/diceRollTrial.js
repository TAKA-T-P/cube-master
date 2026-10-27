/**
 * トライアル③「サイコロを転がすと？」の問題（Three.js・DOM 非依存）
 *
 * マス目の上のサイコロを、決まった道にそって1マスずつ転がす。最後のマスで上になる面の目を 1〜6 で答える。
 *
 * - サイコロはふつうのサイコロ（向かい合う面の目の和が7。core/cubeFaceLabels の STANDARD_DICE）を、24通りのどれかの向きに置く。
 *   見えている上・前・右の3面の目と「和が7」から、6面すべての目がただ1つに決まる
 * - 道はマスの中心を結ぶ、となりのマスへの移動だけ（x：右 +1、z：手前 +1）。1回の移動が90°の転がり（core/cubeRotations の right・left・forward・backward）
 * - 道は同じマスを2回通らず、続いていないマスどうしがとなり合わない（道の順がひと目でわかる）
 * - 見取図でサイコロに隠れるマスがないようにする（サイコロは出発のマスに立てて描く）
 */
import { STANDARD_DICE, byDirection } from '../cubeFaceLabels.js';
import { ALL_ORIENTATIONS, rotateOrientation } from '../cubeOrientation.js';
import { DEFAULT_VIEW_DIRECTION } from '../cubeConstants.js';
import { pick } from '../../utils/random.js';

/** 難易度ごとの転がす回数・方向転換の回数・道の広さ */
export const DICE_ROLL_LEVELS = Object.freeze({
  1: { moves: [1, 2], minTurns: 0, maxSpan: 4 },
  2: { moves: [3, 4], minTurns: 0, maxSpan: 5 },
  3: { moves: [4, 5, 6], minTurns: 1, maxSpan: 5 },
  4: { moves: [6, 7, 8], minTurns: 2, maxSpan: 5 },
});

/** 転がす向き → マスの動き（x：右、z：手前） */
export const ROLL_STEPS = Object.freeze({ right: [1, 0], left: [-1, 0], forward: [0, 1], backward: [0, -1] });
const ROLLS = Object.keys(ROLL_STEPS);

/** 見取図の投影（core/cubeConstants の DEFAULT_VIEW_DIRECTION から。1マスは一辺2・サイコロの中心が高さ0） */
export function projectBoardPoint([x, y, z], viewDirection = DEFAULT_VIEW_DIRECTION) {
  const len = Math.hypot(...viewDirection);
  const v = viewDirection.map((t) => t / len);
  const rl = Math.hypot(v[2], v[0]);
  const right = [v[2] / rl, 0, -v[0] / rl];
  const up = [v[1] * right[2] - v[2] * right[1], v[2] * right[0] - v[0] * right[2], v[0] * right[1] - v[1] * right[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [dot([x, y, z], right), -dot([x, y, z], up)];
}

/** マス（i, k）の中心の3D座標（床は y = −1） */
export const cellCenter = ([i, k]) => [2 * i, -1, 2 * k];

function insidePolygon([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function convexHull2D(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** 出発のマスに置いたサイコロに、ほかのマス（の4すみのどれか）が隠れるか */
export function isHiddenByDice(start, cell) {
  const [cx, , cz] = cellCenter(start);
  const corners = [-1, 1].flatMap((dx) => [-1, 1].flatMap((dy) => [-1, 1].map((dz) => projectBoardPoint([cx + dx, dy, cz + dz]))));
  const silhouette = convexHull2D(corners);
  const [x, , z] = cellCenter(cell);
  // マスの中心と、中心から少し内側の4点がすべて隠れていなくても、半分以上隠れたら見にくいので、中心と4点のうち2点以上で判定
  const samples = [[0, 0], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]].map(([dx, dz]) => projectBoardPoint([x + dx, -1, z + dz]));
  return samples.filter((p) => insidePolygon(p, silhouette)).length >= 2;
}

const key = ([i, k]) => `${i},${k}`;
const turnsOf = (moves) => moves.slice(1).filter((m, i) => m !== moves[i]).length;

/** 道を作る（cells[0] が出発、cells[moves.length] が到着） */
export function generateDicePath(rng, { count, minTurns, maxSpan }) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const cells = [[0, 0]];
    const moves = [];
    const used = new Set([key(cells[0])]);
    let ok = true;
    for (let s = 0; s < count && ok; s++) {
      const here = cells[cells.length - 1];
      const options = ROLLS.filter((m) => {
        const next = [here[0] + ROLL_STEPS[m][0], here[1] + ROLL_STEPS[m][1]];
        if (used.has(key(next))) return false;
        // 1つ前より前のマスと、となり合わない
        const neighbors = Object.values(ROLL_STEPS).map(([di, dk]) => key([next[0] + di, next[1] + dk]));
        return !cells.slice(0, -1).some((c) => neighbors.includes(key(c)));
      });
      if (options.length === 0) {
        ok = false;
        break;
      }
      // 同じ向きに続けやすく（まっすぐな道も、曲がる道も出る）
      const prev = moves[moves.length - 1];
      const m = prev && options.includes(prev) && rng() < 0.45 ? prev : pick(options, rng);
      const next = [here[0] + ROLL_STEPS[m][0], here[1] + ROLL_STEPS[m][1]];
      moves.push(m);
      cells.push(next);
      used.add(key(next));
    }
    if (!ok) continue;
    if (turnsOf(moves) < minTurns) continue;
    const xs = cells.map((c) => c[0]);
    const zs = cells.map((c) => c[1]);
    if (Math.max(...xs) - Math.min(...xs) + 1 > maxSpan || Math.max(...zs) - Math.min(...zs) + 1 > maxSpan) continue;
    if (cells.slice(1).some((c) => isHiddenByDice(cells[0], c))) continue;
    return { cells, moves };
  }
  throw new Error('サイコロの道を作れませんでした');
}

/** 向きを順に転がしたときの、それぞれのあとの向き */
export function rollPoses(pose, moves) {
  const poses = [pose];
  for (const m of moves) poses.push(rotateOrientation(poses[poses.length - 1], m));
  return poses;
}

export function generateDiceRollQuestion(difficulty, rng) {
  const level = DICE_ROLL_LEVELS[difficulty] ?? DICE_ROLL_LEVELS[4];
  const count = pick(level.moves, rng);
  const { cells, moves } = generateDicePath(rng, { count, minTurns: level.minTurns, maxSpan: level.maxSpan });
  const pose = pick(ALL_ORIENTATIONS, rng);
  const poses = rollPoses(pose, moves);
  const start = byDirection(STANDARD_DICE, pose);
  const end = byDirection(STANDARD_DICE, poses[poses.length - 1]);
  return {
    mode: 'diceRoll',
    text: '道にそってサイコロを転がします。赤いマスに着いたとき、上の面の目はいくつですか。',
    faces: { ...STANDARD_DICE },
    pose: { ...pose },
    visible: { top: start.top, front: start.front, right: start.right },
    cells,
    moves,
    answer: end.top,
  };
}

/** 見えている上・前・右の目と「向かい合う面の和は7」から、6つの方向の目を求める（ただ1つに決まる） */
export const diceFromVisible = ({ top, front, right }) => ({ top, front, right, bottom: 7 - top, back: 7 - front, left: 7 - right });

export function checkDiceRollAnswer(question, answer) {
  const value = Number(answer);
  return { isCorrect: value === question.answer, value: Number.isInteger(value) ? value : null, answer: question.answer };
}
