/**
 * 立方体の展開図の一覧（Three.js・DOM 非依存）
 *
 * 6マスのつながった図形（自由ヘキソミノ、35種類）をすべて作り、
 * 折りたたみ計算（cubeNetFolding）で立方体になるものを「11種類の展開図」として登録する。
 * 手で書いた一覧に頼らないので、どんな 6 マスの図形でも同じ方法で判定できる。
 */
import { makeCells, getCanonicalNetKey, normalizeNet, distinctOrientations, getNetBounds, pointKey } from './cubeNet.js';
import { foldNet } from './cubeNetFolding.js';

/** n マスのつながった図形（回転・裏返しで重なるものは1つ）をすべて作る */
export function enumerateFreePolyominoes(n) {
  let shapes = new Map([[getCanonicalNetKey(makeCells([[0, 0]])), makeCells([[0, 0]])]]);
  for (let size = 2; size <= n; size++) {
    const next = new Map();
    for (const cells of shapes.values()) {
      const occupied = new Set(cells.map((c) => pointKey(c.x, c.y)));
      for (const c of cells) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = pointKey(c.x + dx, c.y + dy);
          if (occupied.has(k)) continue;
          const grown = makeCells([...cells.map((x) => [x.x, x.y]), [c.x + dx, c.y + dy]]);
          const key = getCanonicalNetKey(grown);
          if (!next.has(key)) next.set(key, normalizeNet(grown));
        }
      }
    }
    shapes = next;
  }
  return [...shapes.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, cells]) => ({ key, cells: makeCells(cells.map((c) => [c.x, c.y])) }));
}

/** 展開図の型（いちばん低い向きでの、各行のマスの数の並び） */
function netGroup(cells) {
  const flat = distinctOrientations(cells).sort((a, b) => getNetBounds(a).height - getNetBounds(b).height)[0];
  const rows = new Map();
  for (const c of flat) rows.set(c.y, (rows.get(c.y) ?? 0) + 1);
  const counts = [...rows.keys()].sort((a, b) => a - b).map((y) => rows.get(y));
  if (counts.includes(4)) return '1-4-1';
  if (counts.length === 2) return '3-3';
  if (counts.every((n) => n === 2)) return '2-2-2';
  return '1-3-2';
}

const HEXOMINOES = enumerateFreePolyominoes(6);

/** 立方体の展開図 11 種類（id: net01〜net11、group: 型） */
export const CUBE_NETS = Object.freeze(
  HEXOMINOES.filter((h) => foldNet(h.cells).valid).map((h, i) => Object.freeze({ id: `net${String(i + 1).padStart(2, '0')}`, key: h.key, group: netGroup(h.cells), cells: h.cells })),
);

/** 立方体の展開図にならない 6 マスの図形（24 種類） */
export const NON_CUBE_HEXOMINOES = Object.freeze(HEXOMINOES.filter((h) => !foldNet(h.cells).valid).map((h) => Object.freeze({ key: h.key, cells: h.cells })));

export const ALL_HEXOMINOES = Object.freeze(HEXOMINOES);

/** 展開図の種類（11種類のどれか。展開図でなければ null） */
export function identifyCubeNet(cells) {
  const key = getCanonicalNetKey(cells);
  return CUBE_NETS.find((n) => n.key === key) ?? null;
}
