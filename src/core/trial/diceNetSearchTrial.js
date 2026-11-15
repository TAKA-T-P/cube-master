/**
 * トライアル⑥「サイコロの展開図を探せ！」の問題（Three.js・DOM 非依存）
 *
 * マス目のどのマスにもサイコロの目（1〜6）がかいてある。プレイヤーは6マスを選んで、
 * 正しいサイコロの展開図を見つける。
 *
 * 判定（お手本の6マスと同じでなくてよい。数学的に正しければ正解）：
 *   1. ちょうど6マス
 *   2. 6マスが辺でつながっている                         → notConnected
 *   3. 折ると立方体になる（core/cubeNetFolding の foldNet）→ invalidCubeNet
 *   4. 1〜6の目が1つずつある                             → duplicatePips
 *   5. 向かい合う面（外向きの向きが反対の面）の目の和が7   → oppositeFacesMismatch
 *
 * 問題の作り方：11種類の展開図（回す・裏返す）から、マス目に入る向きを選んで置き
 * （形は変えない）、向かい合う面の和が7になるように目を入れる。ほかのマスには1〜6をでたらめに入れる。
 * 最後に、お手本の6マスが判定で正解になることを確かめる。
 *
 * ★★★・★★★★ は、ほかのマスの目を入れ直して、
 *   - お手本のほかに正しい6マス（別解）ができない（答えがただ1つ）
 *   - 「展開図の形で1〜6がそろっているのに、向かい合う和が7でない」ひっかけの6マスが minTraps 個以上ある
 * ようにする（和が7かまで確かめないと見つけられない）。
 */
import { CUBE_NETS } from '../cubeNetCatalog.js';
import { distinctOrientations, getNetBounds } from '../cubeNet.js';
import { foldNet } from '../cubeNetFolding.js';
import { pick, shuffle } from '../../utils/random.js';

/** 選ぶマスの数 */
export const DICE_NET_CELLS = 6;

/**
 * 難易度ごとのマス目の大きさ（たて×横。5×5 より大きくしない）
 *   unique：別解を出さない、minTraps：ひっかけの6マスの最低の数
 */
export const DICE_NET_SEARCH_LEVELS = Object.freeze({
  1: Object.freeze({ rows: 3, cols: 4, unique: false, minTraps: 0 }),
  2: Object.freeze({ rows: 3, cols: 5, unique: false, minTraps: 0 }),
  3: Object.freeze({ rows: 4, cols: 5, unique: true, minTraps: 3 }),
  4: Object.freeze({ rows: 5, cols: 5, unique: true, minTraps: 5 }),
});

/** ほかのマスの目を入れ直す回数の上限（1つの置き方につき） */
const MAX_REFILLS = 60;

/** 判定の理由と、プレイヤーに見せる文 */
export const DICE_NET_REASONS = Object.freeze({
  count: '6マスを選んでいません',
  notConnected: '6マスがつながっていません',
  invalidCubeNet: '展開図の形が違います',
  duplicatePips: '同じ目が2つ以上あります',
  oppositeFacesMismatch: '向かい合う目の和が7になっていません',
});

const QUESTION_TEXT = '正しいサイコロの展開図になる6マスを選ぼう！';
const MAX_ATTEMPTS = 200;

/** 11種類の展開図の、向きのちがう形（何度も使うので先に作る） */
const ORIENTATIONS = CUBE_NETS.map((net) => distinctOrientations(net.cells).map((shape) => ({ shape, bounds: getNetBounds(shape) })));

const placementCache = new Map();
/**
 * マス目に置ける展開図の6マスの置き方すべて（11種類・すべての向き・すべての位置）と、それぞれの向かい合うマスの組
 * @returns {{ cells: {row,col}[], key: string, opposite: [number, number][] }[]}
 */
export function listNetPlacements(rows, cols) {
  const k = `${rows}x${cols}`;
  if (placementCache.has(k)) return placementCache.get(k);
  const list = [];
  for (const orientations of ORIENTATIONS) {
    for (const { shape, bounds } of orientations) {
      for (let dy = 0; dy + bounds.height <= rows; dy++) {
        for (let dx = 0; dx + bounds.width <= cols; dx++) {
          const cells = shape.map((c) => ({ row: c.y - bounds.minY + dy, col: c.x - bounds.minX + dx }));
          const fold = foldNet(cells.map((p, i) => ({ id: `f${i}`, x: p.col, y: p.row })));
          const opposite = [];
          for (let i = 0; i < 6; i++) {
            for (let j = i + 1; j < 6; j++) {
              const a = fold.frames[`f${i}`].outward;
              const b = fold.frames[`f${j}`].outward;
              if (a.every((n, t) => n === -b[t])) opposite.push([i, j]);
            }
          }
          list.push({ cells, key: selectionKey(cells), opposite });
        }
      }
    }
  }
  placementCache.set(k, list);
  return list;
}

const selectionKey = (cells) => cells.map((s) => `${s.row},${s.col}`).sort().join('|');

/**
 * マス目の中の、正しいサイコロの展開図（solutions）と、ひっかけ（traps：1〜6がそろうのに向かい合う和が7でない）の6マス
 * @returns {{ solutions: {row,col}[][], traps: {row,col}[][] }}
 */
export function findDiceNets(grid) {
  const solutions = [];
  const traps = [];
  for (const p of listNetPlacements(grid.length, grid[0].length)) {
    const pips = p.cells.map((c) => grid[c.row][c.col]);
    if (new Set(pips).size !== 6) continue;
    if (p.opposite.every(([i, j]) => pips[i] + pips[j] === 7)) solutions.push(p.cells);
    else traps.push(p.cells);
  }
  return { solutions, traps };
}

/** 外向きの向きの軸（0：x、1：y、2：z）と向き（+1／−1） */
function axisOf(outward) {
  const i = outward.findIndex((n) => n !== 0);
  return { axis: i, sign: Math.sign(outward[i]) };
}

/**
 * 選んだ6マスを判定する
 * @param {number[][]} cells マス目の目（cells[row][col]＝1〜6）
 * @param {{row:number,col:number}[]} selected 選んだマス
 * @returns {{
 *   correct: boolean, isCorrect: boolean, reason: null|'count'|'notConnected'|'invalidCubeNet'|'duplicatePips'|'oppositeFacesMismatch',
 *   message: string, selectedCount: number,
 *   netCells: {id,x,y,row,col,pip}[], rootId: string|null, cellToFace: Record<string,string>,
 *   oppositePairs: {a:string,b:string,pips:[number,number],sum:number}[]
 * }}
 *   netCells：3D で折るときのセル（x＝列、y＝行）。oppositePairs：向かい合う面の組（折れるときだけ）
 */
export function validateDiceNetSelection(cells, selected) {
  const list = Array.isArray(selected) ? selected : [];
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const inside = list.filter((s) => Number.isInteger(s?.row) && Number.isInteger(s?.col) && s.row >= 0 && s.row < rows && s.col >= 0 && s.col < cols);
  const unique = [...new Map(inside.map((s) => [`${s.row},${s.col}`, s])).values()].sort((a, b) => a.row - b.row || a.col - b.col);
  const netCells = unique.map((s, i) => ({ id: `f${i}`, x: s.col, y: s.row, row: s.row, col: s.col, pip: cells[s.row][s.col] }));
  const base = { selectedCount: list.length, netCells, rootId: null, cellToFace: {}, oppositePairs: [] };
  const fail = (reason, extra = {}) => ({ correct: false, isCorrect: false, reason, message: DICE_NET_REASONS[reason], ...base, ...extra });

  if (list.length !== DICE_NET_CELLS || unique.length !== DICE_NET_CELLS) return fail('count');
  const fold = foldNet(netCells);
  if (!fold.valid) return fail(fold.reason === 'disconnected' ? 'notConnected' : 'invalidCubeNet');

  const folded = { rootId: fold.tree.root, cellToFace: fold.cellToFace };
  // 向かい合う面：外向きの向きが反対の2つの面
  const oppositePairs = [];
  for (const a of netCells) {
    for (const b of netCells) {
      if (a.id >= b.id) continue;
      const oa = fold.frames[a.id].outward;
      const ob = fold.frames[b.id].outward;
      if (oa.every((n, i) => n === -ob[i])) oppositePairs.push({ a: a.id, b: b.id, pips: [a.pip, b.pip], sum: a.pip + b.pip });
    }
  }
  const pips = new Set(netCells.map((c) => c.pip));
  if (pips.size !== DICE_NET_CELLS || ![1, 2, 3, 4, 5, 6].every((n) => pips.has(n))) return fail('duplicatePips', { ...folded, oppositePairs });
  if (!oppositePairs.every((p) => p.sum === 7)) return fail('oppositeFacesMismatch', { ...folded, oppositePairs });
  return { correct: true, isCorrect: true, reason: null, message: '正しいサイコロの展開図です', ...base, ...folded, oppositePairs };
}

/**
 * 問題を作る（同じ rng なら同じ問題）
 * @returns {{
 *   mode: 'diceNetSearch', difficulty, text, rows, cols, grid: number[][],
 *   sampleSolution: {row,col}[], netId: number,
 * }}
 */
export function generateDiceNetSearchQuestion(difficulty, rng = Math.random) {
  const level = DICE_NET_SEARCH_LEVELS[difficulty] ?? DICE_NET_SEARCH_LEVELS[4];
  const { rows, cols } = level;
  // マス目に入る向きだけ（形は変えない）。まず展開図の種類を選んでから向きを選ぶので、11種類がかたよらずに出る
  const fitting = ORIENTATIONS.map((list, netId) => ({ netId, shapes: list.filter((o) => o.bounds.width <= cols && o.bounds.height <= rows) })).filter((n) => n.shapes.length > 0);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { netId, shapes } = pick(fitting, rng);
    const { shape, bounds } = pick(shapes, rng);
    const dx = Math.floor(rng() * (cols - bounds.width + 1)) - bounds.minX;
    const dy = Math.floor(rng() * (rows - bounds.height + 1)) - bounds.minY;
    const placed = shape.map((c) => ({ row: c.y + dy, col: c.x + dx }));
    const fold = foldNet(placed.map((p, i) => ({ id: `f${i}`, x: p.col, y: p.row })));
    if (!fold.valid) continue;
    // 3つの軸に、(1,6)(2,5)(3,4) の組をでたらめに割り当てる。どちら向きの面に小さい目を置くかもでたらめ
    const pairs = shuffle([[1, 6], [2, 5], [3, 4]], rng);
    const flips = pairs.map(() => rng() < 0.5);
    const answerPips = placed.map((p, i) => {
      const { axis, sign } = axisOf(fold.frames[`f${i}`].outward);
      const [small, large] = pairs[axis];
      return (sign > 0) !== flips[axis] ? small : large;
    });
    const sampleSolution = [...placed].sort((a, b) => a.row - b.row || a.col - b.col);
    const sampleKey = selectionKey(sampleSolution);
    // ほかのマスの目を入れ、★★★ 以上は「別解なし・ひっかけ minTraps 個以上」になるまで入れ直す
    for (let refill = 0; refill < (level.unique || level.minTraps > 0 ? MAX_REFILLS : 1); refill++) {
      const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1 + Math.floor(rng() * 6)));
      placed.forEach((p, i) => {
        grid[p.row][p.col] = answerPips[i];
      });
      if (!validateDiceNetSelection(grid, sampleSolution).correct) break;
      const { solutions, traps } = findDiceNets(grid);
      if (level.unique && solutions.some((cells) => selectionKey(cells) !== sampleKey)) continue;
      if (traps.length < level.minTraps) continue;
      return { mode: 'diceNetSearch', difficulty, text: QUESTION_TEXT, rows, cols, grid, sampleSolution, netId };
    }
  }
  throw new Error('サイコロの展開図を探す問題を作れませんでした');
}

/** 判定（answer：選んだマス {row,col}[]） */
export function checkDiceNetSearchAnswer(question, answer) {
  return validateDiceNetSelection(question.grid, answer);
}
