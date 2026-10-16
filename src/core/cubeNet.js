/**
 * 展開図の格子データ（Three.js・DOM 非依存）
 *
 * 展開図は、整数格子の上に並んだ正方形（セル）の集まり。
 *   { id: 'f0', x: 0, y: 0 }  … セル [x, x+1] × [y, y+1]。x は右、y は下が正（図の向きと同じ）
 * セル ID は組み立て前の名前で、立方体の面 ID（ABCD など）とは別に管理する。
 * 格子点は 'x,y' のキー、格子の辺（長さ 1 の線分）は 'x1,y1|x2,y2'（小さい点が先）で表す。
 *
 * 回転・裏返し・平行移動で重なる形は「同じ種類」として getCanonicalNetKey で分類する。
 * 問題で表示する展開図そのもの（セル ID・向き）は変えない。
 */

export const pointKey = (x, y) => `${x},${y}`;
export const parsePointKey = (key) => key.split(',').map(Number);

/** 線分のキー（端の点の順番によらない） */
export function segmentKey(a, b) {
  const [p, q] = [pointKey(...a), pointKey(...b)].sort();
  return `${p}|${q}`;
}
export const parseSegmentKey = (key) => key.split('|').map(parsePointKey);

/** 座標の一覧からセルを作る（ID は f0, f1, … を上の行から順に） */
export function makeCells(coords) {
  return [...coords]
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([x, y], i) => ({ id: `f${i}`, x, y }));
}

/** 文字の図からセルを作る（'#' がセル）。例：['.#..', '####', '.#..'] */
export function parseNet(rows) {
  const coords = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && coords.push([x, y])));
  return makeCells(coords);
}

/** 大きさ */
export function getNetBounds(cells) {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + 1;
  const maxY = Math.max(...ys) + 1;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** 平行移動 */
export const translateNet = (cells, dx, dy) => cells.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));

/** 左上を (0, 0) にそろえる（ID はそのまま） */
export function normalizeNet(cells) {
  const { minX, minY } = getNetBounds(cells);
  return translateNet(cells, -minX, -minY).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 時計回りに 90°×turns 回す（図の向きで時計回り。ID はそのまま） */
export function rotateNet(cells, turns = 1) {
  let result = cells.map((c) => ({ ...c }));
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    // セル [x, x+1] を回すと [-y-1, -y] になる
    result = result.map((c) => ({ ...c, x: -c.y - 1, y: c.x }));
  }
  return normalizeNet(result);
}

/** 左右に裏返す（ID はそのまま） */
export const reflectNet = (cells) => normalizeNet(cells.map((c) => ({ ...c, x: -c.x - 1 })));

/** この向きのままの形のキー（同じ向きの同じ形なら同じ） */
export const getShapeKey = (cells) =>
  normalizeNet(cells)
    .map((c) => pointKey(c.x, c.y))
    .sort()
    .join(';');

/** 8通り（回転4 × 裏返し2）の向き */
export function allOrientations(cells) {
  const result = [];
  for (const base of [cells, reflectNet(cells)]) for (let t = 0; t < 4; t++) result.push(rotateNet(base, t));
  return result;
}

/** 種類のキー（回転・裏返し・平行移動で重なる形は同じキー） */
export const getCanonicalNetKey = (cells) => allOrientations(cells).map(getShapeKey).sort()[0];

/** 向きのちがう形（同じ形の重なりを除いた一覧） */
export function distinctOrientations(cells) {
  const seen = new Set();
  return allOrientations(cells).filter((o) => {
    const k = getShapeKey(o);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** セルの4つの角（格子点） */
export const cellCorners = (c) => [
  [c.x, c.y],
  [c.x + 1, c.y],
  [c.x + 1, c.y + 1],
  [c.x, c.y + 1],
];

/** セルの4つの辺（上・右・下・左） */
export const cellSides = (c) => {
  const [p0, p1, p2, p3] = cellCorners(c);
  return [
    [p0, p1],
    [p1, p2],
    [p2, p3],
    [p3, p0],
  ];
};

/** 辺を共有する（となり合う）セルの組と、共有する辺 */
export function getAdjacentCells(cells) {
  const pairs = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i];
      const b = cells[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      const edge =
        dx === 1
          ? [[a.x + 1, a.y], [a.x + 1, a.y + 1]]
          : dx === -1
            ? [[a.x, a.y], [a.x, a.y + 1]]
            : dy === 1
              ? [[a.x, a.y + 1], [a.x + 1, a.y + 1]]
              : [[a.x, a.y], [a.x + 1, a.y]];
      pairs.push({ a: a.id, b: b.id, edge });
    }
  }
  return pairs;
}

/** 位置の重なりがないか */
export const hasOverlappingCells = (cells) => new Set(cells.map((c) => pointKey(c.x, c.y))).size !== cells.length;

/** ひとつながりか */
export function isNetConnected(cells) {
  if (cells.length === 0) return false;
  const adj = new Map(cells.map((c) => [c.id, []]));
  for (const { a, b } of getAdjacentCells(cells)) {
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const seen = new Set([cells[0].id]);
  const stack = [cells[0].id];
  while (stack.length) for (const n of adj.get(stack.pop())) if (!seen.has(n)) seen.add(n) && stack.push(n);
  return seen.size === cells.length;
}

/** まわりの（外周の）辺：1つのセルにだけ属する辺 */
export function getBoundarySegments(cells) {
  const count = new Map();
  const ends = new Map();
  for (const c of cells) {
    for (const [a, b] of cellSides(c)) {
      const key = segmentKey(a, b);
      count.set(key, (count.get(key) ?? 0) + 1);
      ends.set(key, [a, b]);
    }
  }
  return [...count.entries()].filter(([, n]) => n === 1).map(([key]) => ({ key, ends: ends.get(key) }));
}

/** まわりにある格子点（外周の辺の端の点） */
export function getBoundaryPoints(cells) {
  const keys = new Set();
  for (const s of getBoundarySegments(cells)) for (const p of s.ends) keys.add(pointKey(...p));
  return [...keys].map(parsePointKey);
}

/** となりの空きマス（マスを足す候補） */
export function getEmptyNeighbors(cells) {
  const occupied = new Set(cells.map((c) => pointKey(c.x, c.y)));
  const result = new Map();
  for (const c of cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = pointKey(c.x + dx, c.y + dy);
      if (!occupied.has(k)) result.set(k, { x: c.x + dx, y: c.y + dy });
    }
  }
  return [...result.values()];
}
