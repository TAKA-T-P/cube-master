/**
 * トライアル②「3方向から見ると？」の問題（Three.js・DOM 非依存）
 *
 * 積み木の見取図を見て、前・右・上のどれか1方向から見た形（投影図）をマスに塗って答える。
 * 投影図は core/blockProjection（どの向きも、見た人にとっての左右）。
 *
 * 判定：左右への平行移動だけを許す。塗ったマスの左右の空白を除いて、正解の形と比べる。
 * 上下の位置（前・右は床が最下段、上は手前が最下段）・左右反転・上下反転・回転は許さない。
 */
import { generateHeights, heightsToCubes, isBlockStructureReadable } from '../blockGeometry.js';
import { getProjection, filledCount, VIEW_FROM } from '../blockProjection.js';
import { pick } from '../../utils/random.js';

/** 難易度ごとの大きさ（底面 横×奥行き・最大の高さ） */
export const PROJECTION_LEVELS = Object.freeze({
  1: { bases: [[2, 2], [3, 2], [3, 3]], maxHeight: 3, minCubes: 4, maxCubes: 14 },
  2: { bases: [[3, 3], [4, 3]], maxHeight: 4, minCubes: 7, maxCubes: 22 },
  3: { bases: [[4, 4], [4, 3]], maxHeight: 5, minCubes: 10, maxCubes: 40, varied: true },
  4: { bases: [[5, 5], [5, 4]], maxHeight: 5, minCubes: 14, maxCubes: 60, varied: true },
});

/**
 * 大きな積み木の高さマップ。手前・右へ向かって低くなる階段（どの柱の上の面も見取図で見える）から始めて、
 * 見取図で読み取れるままの範囲で、柱を高く・低く・なくすことをくり返し、凹みや段差をつくる
 */
export function generateVariedHeights(rng, { width, depth, maxHeight, minCubes, maxCubes }) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const h = Array.from({ length: depth }, (_, z) =>
      Array.from({ length: width }, (_, x) => Math.max(1, Math.round(maxHeight - ((maxHeight - 1) * (x + z)) / Math.max(1, width + depth - 2) - rng() * 0.8))),
    );
    for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
      if (x > 0) h[z][x] = Math.min(h[z][x], h[z][x - 1]);
      if (z > 0) h[z][x] = Math.min(h[z][x], h[z - 1][x]);
    }
    const ok = (m) =>
      m.every((row) => row.some((v) => v > 0)) &&
      [...Array(width).keys()].every((x) => m.some((row) => row[x] > 0)) &&
      isBlockStructureReadable(heightsToCubes(m));
    for (let i = 0; i < width * depth * 3; i++) {
      const z = Math.floor(rng() * depth);
      const x = Math.floor(rng() * width);
      const next = h.map((row) => [...row]);
      const r = rng();
      next[z][x] = r < 0.25 ? 0 : Math.min(maxHeight, Math.max(0, next[z][x] + (r < 0.6 ? -1 : 1)));
      if (ok(next)) for (let k = 0; k < depth; k++) h[k] = next[k];
    }
    const total = h.flat().reduce((a, b) => a + b, 0);
    if (total < minCubes || total > maxCubes || !ok(h)) continue;
    if (!isFootprintConnected(h)) continue;
    return h;
  }
  throw new Error('積み木を作れませんでした');
}

function isFootprintConnected(heights) {
  const cells = [];
  heights.forEach((row, z) => row.forEach((v, x) => v > 0 && cells.push(`${x},${z}`)));
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, z] = stack.pop().split(',').map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${z + dz}`;
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push(k);
      }
    }
  }
  return cells.length > 0 && seen.size === cells.length;
}

export const PROJECTION_TRIAL_DIRECTIONS = Object.freeze(['front', 'right', 'top']);
const DIRECTION_TEXT = Object.freeze({ front: '前', right: '右', top: '上' });
/** 左右に動かせるように、形のはばより広くとる列の数（左右合わせて） */
const SIDE_ROOM = 2;

/**
 * 問題を作る
 * grid：塗るマス目の大きさ。前・右は「最大の高さ」の行（最下段が床）、上は奥行きの行（最下段が手前）
 */
export function generateProjectionQuestion(difficulty, rng, { direction } = {}) {
  const level = PROJECTION_LEVELS[difficulty] ?? PROJECTION_LEVELS[4];
  for (let attempt = 0; attempt < 200; attempt++) {
    const [width, depth] = pick(level.bases, rng);
    let heights;
    try {
      const options = { width, depth, maxHeight: level.maxHeight, minCubes: level.minCubes, maxCubes: level.maxCubes };
      heights = level.varied ? generateVariedHeights(rng, options) : generateHeights(rng, { ...options, emptyRate: 0.15 });
    } catch {
      continue;
    }
    const cubes = heightsToCubes(heights);
    const dir = direction ?? pick(PROJECTION_TRIAL_DIRECTIONS, rng);
    const projection = getProjection(cubes, dir);
    // 長方形がすべて塗られた形（形を読まなくても塗れる）は、★2 から出さない
    if (difficulty >= 2 && filledCount(projection) === projection.width * projection.height) continue;
    const rows = dir === 'top' ? projection.height : Math.max(level.maxHeight, projection.height);
    const cols = projection.width + SIDE_ROOM;
    return {
      mode: 'projectionDraw',
      text: `${DIRECTION_TEXT[dir]}から見た図を完成させよう！`,
      cubes,
      heights,
      direction: dir,
      viewFrom: VIEW_FROM[dir],
      projection,
      grid: { rows, cols },
    };
  }
  throw new Error('投影図の問題を作れませんでした');
}

/** 正解の形を、マス目の中の決まった位置（左右は中央）に置いた塗り方 */
export function expectedGrid(question, offset = Math.floor((question.grid.cols - question.projection.width) / 2)) {
  const { rows, cols } = question.grid;
  const p = question.projection;
  const top = rows - p.height; // 下にそろえる（床・手前が最下段）
  const grid = Array.from({ length: rows }, () => Array(cols).fill(false));
  for (let r = 0; r < p.height; r++) for (let c = 0; c < p.width; c++) if (p.cells[r][c]) grid[top + r][offset + c] = true;
  return grid;
}

const filledColumns = (grid) => {
  const cols = grid[0]?.length ?? 0;
  const used = [];
  for (let c = 0; c < cols; c++) if (grid.some((row) => row[c])) used.push(c);
  return used;
};

/**
 * 塗ったマス（boolean[rows][cols]）が正解か。左右の平行移動だけを許す
 * @returns {{ isCorrect, offset, marks: ('hit'|'missing'|'extra'|null)[][] }}
 *   marks：正解の形をいちばん合う左右の位置に置いて、塗ったマスと比べた結果（解説の表示用）
 */
export function checkProjectionAnswer(question, grid) {
  const { rows, cols } = question.grid;
  const painted = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => Boolean(grid?.[r]?.[c])));
  const used = filledColumns(painted);
  const width = question.projection.width;
  // 塗った形の左端に正解の左端を合わせる（はみ出すときは、いちばん近い位置）
  const maxOffset = cols - width;
  const offsets = [...Array(maxOffset + 1).keys()];
  const score = (o) => {
    const exp = expectedGrid(question, o);
    let diff = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (exp[r][c] !== painted[r][c]) diff++;
    return diff;
  };
  const preferred = used.length ? Math.min(maxOffset, used[0]) : Math.floor(maxOffset / 2);
  const offset = offsets.reduce((best, o) => (score(o) < score(best) || (score(o) === score(best) && Math.abs(o - preferred) < Math.abs(best - preferred)) ? o : best), preferred);
  const exp = expectedGrid(question, offset);
  const marks = exp.map((row, r) => row.map((e, c) => (e && painted[r][c] ? 'hit' : e ? 'missing' : painted[r][c] ? 'extra' : null)));
  const isCorrect = used.length > 0 && score(offset) === 0;
  return { isCorrect, offset, marks };
}
