/**
 * トライアル④「展開図に分けろ！」の問題（Three.js・DOM 非依存）
 *
 * 立方体の展開図（core/cubeNetCatalog の11種類を回す・裏返す）を、辺でつなげて1つの図形にする。
 * プレイヤーは色でぬり分けて、図形全体をいくつかの展開図に分ける。
 *
 * 判定（お手本の分け方と同じでなくてよい）：
 *   1. 全部のマスがぬられている
 *   2. 使った色の数が、展開図の個数と同じ
 *   3. どの色もちょうど6マス
 *   4. 同じ色の6マスは辺でつながっている
 *   5. 同じ色の6マスを折ると立方体になる（core/cubeNetFolding の foldNet）
 * 色の順番（どの色を使ったか）は判定に関係しない。
 */
import { CUBE_NETS } from '../cubeNetCatalog.js';
import { distinctOrientations, isNetConnected, makeCells, getNetBounds } from '../cubeNet.js';
import { foldNet } from '../cubeNetFolding.js';
import { pick, shuffle } from '../../utils/random.js';

/** 1色でぬれるマスの数 */
export const MAX_CELLS_PER_COLOR = 6;
/** パレットの色の数 */
export const PALETTE_SIZE = 5;

/** 難易度ごとの展開図の数と、図形の大きさの上限（横×縦） */
export const NET_PARTITION_LEVELS = Object.freeze({
  1: { nets: 2, maxWidth: 8, maxHeight: 6, contact: 1 },
  2: { nets: 3, maxWidth: 9, maxHeight: 7, contact: 2 },
  3: { nets: 4, maxWidth: 10, maxHeight: 8, contact: 3 },
  4: { nets: 5, maxWidth: 10, maxHeight: 9, contact: 3 },
});

const key = (x, y) => `${x},${y}`;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 置いたマスの集まりと、新しい展開図が共有する辺の数（重なれば -1） */
function contactCount(occupied, cells) {
  let shared = 0;
  for (const c of cells) {
    if (occupied.has(key(c.x, c.y))) return -1;
    for (const [dx, dy] of SIDES) if (occupied.has(key(c.x + dx, c.y + dy))) shared++;
  }
  return shared;
}

/**
 * 展開図をつなげた図形を作る
 * @returns {{ cells: {id,x,y}[], solution: Record<cellId, number>, pieces: {x,y}[][] }}
 */
export function generateNetPartition(rng, { nets, maxWidth, maxHeight, contact }) {
  const orientations = CUBE_NETS.map((n) => distinctOrientations(n.cells));
  for (let attempt = 0; attempt < 300; attempt++) {
    const pieces = [];
    const occupied = new Map(); // key → 展開図の番号
    let failed = false;
    for (let i = 0; i < nets; i++) {
      const candidates = [];
      for (const net of shuffle([...orientations.keys()], rng).slice(0, 6)) {
        for (const shape of orientations[net]) {
          if (i === 0) {
            candidates.push({ cells: shape, shared: 0 });
            continue;
          }
          // 置いたマスのまわりに、新しい展開図のマスが接するように動かす
          const tried = new Set();
          for (const k of occupied.keys()) {
            const [ox, oy] = k.split(',').map(Number);
            for (const [dx, dy] of SIDES) {
              for (const c of shape) {
                const tx = ox + dx - c.x;
                const ty = oy + dy - c.y;
                const tk = key(tx, ty);
                if (tried.has(tk)) continue;
                tried.add(tk);
                const moved = shape.map((s) => ({ x: s.x + tx, y: s.y + ty }));
                const shared = contactCount(occupied, moved);
                if (shared <= 0) continue;
                const all = [...[...occupied.keys()].map((q) => q.split(',').map(Number)), ...moved.map((m) => [m.x, m.y])];
                const xs = all.map((p) => p[0]);
                const ys = all.map((p) => p[1]);
                const w = Math.max(...xs) - Math.min(...xs) + 1;
                const hgt = Math.max(...ys) - Math.min(...ys) + 1;
                if (w > maxWidth || hgt > maxHeight) continue;
                candidates.push({ cells: moved, shared, area: w * hgt });
              }
            }
          }
        }
      }
      if (candidates.length === 0) {
        failed = true;
        break;
      }
      // 難しいほど、たくさんの辺で接する置き方（境目がわかりにくい）を選びやすく。図形がまとまるように面積も小さく
      const target = Math.min(contact, Math.max(...candidates.map((c) => c.shared)));
      const good = candidates.filter((c) => c.shared >= target);
      const minArea = Math.min(...good.map((c) => c.area ?? 0));
      const compact = good.filter((c) => (c.area ?? 0) <= minArea + 6);
      const chosen = pick(compact.length ? compact : good, rng);
      pieces.push(chosen.cells.map((c) => ({ x: c.x, y: c.y })));
      for (const c of chosen.cells) occupied.set(key(c.x, c.y), i);
    }
    if (failed) continue;
    // 左上を (0, 0) にそろえて、セルに ID をつける
    const all = pieces.flat();
    const minX = Math.min(...all.map((c) => c.x));
    const minY = Math.min(...all.map((c) => c.y));
    const cells = makeCells(all.map((c) => [c.x - minX, c.y - minY]));
    const pieceAt = new Map(pieces.flatMap((p, i) => p.map((c) => [key(c.x - minX, c.y - minY), i])));
    const solution = Object.fromEntries(cells.map((c) => [c.id, pieceAt.get(key(c.x, c.y))]));
    return { cells, solution, pieces: pieces.map((p) => p.map((c) => ({ x: c.x - minX, y: c.y - minY }))) };
  }
  throw new Error('展開図をつなげた図形を作れませんでした');
}

export function generateNetPartitionQuestion(difficulty, rng) {
  const level = NET_PARTITION_LEVELS[difficulty] ?? NET_PARTITION_LEVELS[4];
  const { cells, solution, pieces } = generateNetPartition(rng, level);
  const { width, height } = getNetBounds(cells);
  return {
    mode: 'netPartition',
    text: `この図形を、${level.nets}つの立方体の展開図に分けよう！ 色をえらんでマスをぬってね（1色6マスまで）。`,
    netCount: level.nets,
    cells,
    width,
    height,
    solution,
    pieces,
  };
}

/** 1色ぶんのマスが、立方体の展開図になるか */
export function isCubeNetPiece(coords) {
  if (coords.length !== 6) return false;
  const cells = makeCells(coords.map((c) => [c.x, c.y]));
  return isNetConnected(cells) && foldNet(cells).valid;
}

/** その色で、もう1マスぬれるか（同じ色は6マスまで） */
export function canPaintColor(coloring, color, cellId) {
  if (color === null || color === undefined) return true;
  if (coloring[cellId] === color) return true;
  return Object.values(coloring).filter((c) => c === color).length < MAX_CELLS_PER_COLOR;
}

/**
 * ぬり分けが正解か
 * @param {Record<cellId, number|null>} coloring セル ID → 色の番号（ぬっていなければ null）
 * @returns {{ isCorrect, reason: null|'unpainted'|'colors'|'size'|'disconnected'|'not-net', groups: { color, cellIds, valid }[] }}
 */
export function checkNetPartitionAnswer(question, coloring) {
  const map = coloring ?? {};
  const byColor = new Map();
  let unpainted = 0;
  for (const c of question.cells) {
    const color = map[c.id];
    if (color === null || color === undefined) {
      unpainted++;
      continue;
    }
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color).push(c);
  }
  const groups = [...byColor.entries()].map(([color, cells]) => {
    const connected = cells.length > 0 && isNetConnected(makeCells(cells.map((c) => [c.x, c.y])));
    return { color, cellIds: cells.map((c) => c.id), size: cells.length, connected, valid: isCubeNetPiece(cells) };
  });
  let reason = null;
  if (unpainted > 0) reason = 'unpainted';
  else if (groups.length !== question.netCount) reason = 'colors';
  else if (groups.some((g) => g.size !== MAX_CELLS_PER_COLOR)) reason = 'size';
  else if (groups.some((g) => !g.connected)) reason = 'disconnected';
  else if (groups.some((g) => !g.valid)) reason = 'not-net';
  return { isCorrect: reason === null, reason, groups };
}

/** お手本の分け方（問題を作ったときの分け方）を、色の番号のぬり分けにする */
export const solutionColoring = (question) => ({ ...question.solution });
