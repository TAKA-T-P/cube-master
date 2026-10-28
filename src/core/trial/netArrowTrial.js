/**
 * トライアル⑤「展開図に矢印を引け！」の問題の作り方と判定（Three.js・DOM 非依存）
 *
 * 立方体の見取図に赤・青の2本の矢印、展開図に赤い矢印だけを示し、青い矢印を展開図のどのマスに・どの向きに描くかを答える。
 *
 * 向きの扱い
 * - 矢印の向きは、展開図のマスの中での上下左右の4方向（N・E・S・W。展開図の上が N、右が E。ななめは使わない）
 * - 展開図は core/cubeNetFolding の foldNet で折りたたむ。各マスの frame（U：展開図の右 → 3D、V：展開図の下 → 3D）で、
 *   マスの中の向き (dx, dy) は 3D の向き dx·U/2 + dy·V/2 になる（成分は -1・0・1 の整数なので誤差がない）
 * - 見取図は、折りたたんだ立方体をそのままの位置で描く（基準のマス rootId が上面）。基準のマスと展開図の向きを変えると、
 *   展開図に対する立方体の置き方は 24 通りすべてになる。答え合わせの 3D（同じ rootId で折りたたむ）も見取図と同じ向きで終わる
 * - 矢印は向きのある図形なので、赤い矢印の面と向きで「展開図 → 立方体」の置き方がただ1つに決まり、青い矢印のマスと向きも1つに決まる
 */
import { CUBE_NETS } from '../cubeNetCatalog.js';
import { distinctOrientations, getNetBounds, makeCells } from '../cubeNet.js';
import { foldNet } from '../cubeNetFolding.js';
import { DEFAULT_VIEW_DIRECTION } from '../cubeConstants.js';

/** 4方向（展開図のマスの中で。x：右、y：下） */
export const ARROW_DIRECTIONS = Object.freeze({
  N: Object.freeze([0, -1]),
  E: Object.freeze([1, 0]),
  S: Object.freeze([0, 1]),
  W: Object.freeze([-1, 0]),
});
export const ARROW_DIRECTION_IDS = Object.freeze(Object.keys(ARROW_DIRECTIONS));

/** なぞった向き (dx, dy)（画面の右・下が正）を、いちばん近い上下左右の向きにする（短すぎれば null） */
export function snapArrowDirection(dx, dy, minLength = 0) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) <= minLength || (dx === 0 && dy === 0)) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}

const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const zero = (v) => v.map((n) => (n === 0 ? 0 : n)); // -0 を作らない

/** マスの中の向き → 3D の向き（成分は -1・0・1） */
export function arrowTo3D(frame, dir) {
  const [dx, dy] = ARROW_DIRECTIONS[dir];
  return zero(add(scale(frame.U, dx / 2), scale(frame.V, dy / 2)));
}

/** 3D の向き → マスの中の向き（そのマスの面にない向きなら null） */
export function arrowFrom3D(frame, vec) {
  return ARROW_DIRECTION_IDS.find((d) => arrowTo3D(frame, d).every((n, i) => n === vec[i])) ?? null;
}

/** 見取図で見える面か（外向きの法線が見る向きの側） */
export const isVisibleFace = (outward) => dot(outward, DEFAULT_VIEW_DIRECTION) > 0;

/**
 * 難易度ごとの出題の条件
 * - relation：赤と青の面の関係（adjacent：となり合う、far：向かい合う または 青が見えない面）
 * - netDistance：展開図の2つのマスのはなれ方（縦と横のマスの差の和）
 */
export const NET_ARROW_LEVELS = Object.freeze({
  1: Object.freeze({ relation: 'adjacent', bothVisible: true, minNetDistance: 1, maxNetDistance: 1 }),
  2: Object.freeze({ relation: 'adjacent', bothVisible: true, minNetDistance: 2, maxNetDistance: 9 }),
  3: Object.freeze({ relation: 'far', redVisible: true, minNetDistance: 2, maxNetDistance: 9 }),
  4: Object.freeze({ relation: 'far', blueHidden: true, hardPair: true, minNetDistance: 3, maxNetDistance: 9 }),
});

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** 展開図の形（11種類のどれかを、回す・裏返した向きで。左上を (0, 0) にそろえる） */
function randomNetCells(rng) {
  const net = pick(CUBE_NETS, rng);
  const shape = pick(distinctOrientations(net.cells), rng);
  const { minX, minY } = getNetBounds(shape);
  return { netId: net.id, cells: makeCells(shape.map((c) => [c.x - minX, c.y - minY])) };
}


/** 赤・青の面の組が難易度の条件に合うか */
function pairMatches(level, red, blue, frames) {
  const fr = frames[red.id];
  const fb = frames[blue.id];
  const opposite = dot(fr.outward, fb.outward) === -1;
  const adjacent = dot(fr.outward, fb.outward) === 0;
  const redVisible = isVisibleFace(fr.outward);
  const blueVisible = isVisibleFace(fb.outward);
  const distance = Math.abs(red.x - blue.x) + Math.abs(red.y - blue.y);
  if (distance < level.minNetDistance || distance > level.maxNetDistance) return false;
  if (level.relation === 'adjacent' && !adjacent) return false;
  if (level.relation === 'far' && !(opposite || !blueVisible)) return false;
  if (level.bothVisible && !(redVisible && blueVisible)) return false;
  if (level.redVisible && !redVisible) return false;
  if (level.blueHidden && blueVisible) return false;
  // ★★★★：青は見えない面で、さらに赤と向かい合う・または赤も見えない面
  if (level.hardPair && !(opposite || !redVisible)) return false;
  return true;
}

/**
 * 問題を作る
 * @returns {{
 *   mode: 'netArrow', difficulty, text, netId, cells, rootId, frames,
 *   red: { cellId, dir, face, vector }, blue: { cellId, dir, face, vector }, answer: { cellId, dir },
 * }}
 *   face：見取図での面 ID（core/cubeConstants）、vector：見取図での矢印の 3D の向き
 */
export function generateNetArrowQuestion(difficulty, rng = Math.random) {
  const level = NET_ARROW_LEVELS[difficulty] ?? NET_ARROW_LEVELS[4];
  for (let attempt = 0; attempt < 500; attempt++) {
    const { netId, cells } = randomNetCells(rng);
    const rootId = pick(cells, rng).id;
    const fold = foldNet(cells, { rootId });
    if (!fold.valid) continue;
    const pairs = [];
    for (const red of cells) for (const blue of cells) if (red.id !== blue.id && pairMatches(level, red, blue, fold.frames)) pairs.push([red, blue]);
    if (pairs.length === 0) continue;
    const [red, blue] = pick(pairs, rng);
    const redDir = pick(ARROW_DIRECTION_IDS, rng);
    const blueDir = pick(ARROW_DIRECTION_IDS, rng);
    const arrow = (cell, dir) => ({ cellId: cell.id, dir, face: fold.cellToFace[cell.id], vector: arrowTo3D(fold.frames[cell.id], dir) });
    return {
      mode: 'netArrow',
      difficulty,
      text: '見取図の青い矢印を、展開図のどの面に、どの向きでかけばよいですか。面の中をなぞって矢印をかこう。',
      netId,
      cells,
      rootId,
      frames: fold.frames,
      cellToFace: fold.cellToFace,
      red: arrow(red, redDir),
      blue: arrow(blue, blueDir),
      answer: { cellId: blue.id, dir: blueDir },
    };
  }
  throw new Error('展開図に矢印を引く問題を作れませんでした');
}

/**
 * 判定（面と向きの両方が合えば正解）
 * @param {{ cellId: string, dir: string }|null} answer
 * @returns {{ isCorrect: boolean, faceCorrect: boolean, dirCorrect: boolean, reason: 'face'|'direction'|'empty'|null }}
 */
export function checkNetArrowAnswer(question, answer) {
  if (!answer || !answer.cellId || !ARROW_DIRECTIONS[answer.dir]) return { isCorrect: false, faceCorrect: false, dirCorrect: false, reason: 'empty' };
  const faceCorrect = answer.cellId === question.answer.cellId;
  const dirCorrect = faceCorrect && answer.dir === question.answer.dir;
  return { isCorrect: faceCorrect && dirCorrect, faceCorrect, dirCorrect, reason: !faceCorrect ? 'face' : !dirCorrect ? 'direction' : null };
}
