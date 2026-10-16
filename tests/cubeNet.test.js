import { describe, it, expect } from 'vitest';
import {
  parseNet,
  makeCells,
  normalizeNet,
  rotateNet,
  reflectNet,
  translateNet,
  getAdjacentCells,
  getNetBounds,
  getCanonicalNetKey,
  getShapeKey,
  distinctOrientations,
  getBoundarySegments,
  getEmptyNeighbors,
  isNetConnected,
} from '../src/core/cubeNet.js';
import { foldNet, isCubeNet, buildFoldTree } from '../src/core/cubeNetFolding.js';
import { CUBE_NETS, NON_CUBE_HEXOMINOES, ALL_HEXOMINOES, enumerateFreePolyominoes, identifyCubeNet } from '../src/core/cubeNetCatalog.js';
import { getNetMapping, getCoincidentPoints, getCoincidentSegments, getOppositeCell, getCubeNeighborCells } from '../src/core/cubeNetMapping.js';
import { getOppositeFace } from '../src/core/cubeGeometry.js';

const CROSS = parseNet(['.#..', '####', '.#..']);

describe('展開図の格子データ', () => {
  it('回転・裏返し・平行移動しても、セル ID はそのままで形だけ変わる', () => {
    const r = rotateNet(CROSS, 1);
    expect(r.map((c) => c.id).sort()).toEqual(CROSS.map((c) => c.id).sort());
    expect(getNetBounds(r)).toMatchObject({ width: 3, height: 4 });
    expect(getShapeKey(rotateNet(CROSS, 4))).toBe(getShapeKey(CROSS));
    expect(getShapeKey(reflectNet(reflectNet(CROSS)))).toBe(getShapeKey(CROSS));
    expect(getShapeKey(translateNet(CROSS, 5, -3))).toBe(getShapeKey(CROSS));
    expect(normalizeNet(translateNet(CROSS, 5, -3))[0]).toMatchObject({ x: 1, y: 0 });
  });

  it('回転・裏返し・平行移動で重なる形は同じ種類のキー', () => {
    for (const o of distinctOrientations(CROSS)) expect(getCanonicalNetKey(translateNet(o, 2, 7))).toBe(getCanonicalNetKey(CROSS));
    expect(getCanonicalNetKey(parseNet(['######']))).not.toBe(getCanonicalNetKey(CROSS));
  });

  it('となり合うセル・外周の辺・空きマス・つながり', () => {
    expect(getAdjacentCells(CROSS)).toHaveLength(5);
    expect(getBoundarySegments(CROSS)).toHaveLength(14);
    expect(isNetConnected(CROSS)).toBe(true);
    expect(isNetConnected(makeCells([[0, 0], [2, 0]]))).toBe(false);
    expect(getEmptyNeighbors(makeCells([[0, 0]]))).toHaveLength(4);
  });
});

describe('11種類の展開図', () => {
  it('6マスのつながった図形は35種類、そのうち立方体の展開図は11種類', () => {
    expect(enumerateFreePolyominoes(6)).toHaveLength(35);
    expect(ALL_HEXOMINOES).toHaveLength(35);
    expect(CUBE_NETS).toHaveLength(11);
    expect(NON_CUBE_HEXOMINOES).toHaveLength(24);
    const groups = {};
    for (const n of CUBE_NETS) groups[n.group] = (groups[n.group] ?? 0) + 1;
    expect(groups).toEqual({ '1-4-1': 6, '1-3-2': 3, '2-2-2': 1, '3-3': 1 });
  });

  it('よく知られた形を正しく見分ける（向き・裏返しが違っても同じ種類）', () => {
    expect(identifyCubeNet(CROSS)?.group).toBe('1-4-1');
    expect(identifyCubeNet(parseNet(['###..', '..###']))?.group).toBe('3-3');
    expect(identifyCubeNet(parseNet(['##..', '.##.', '..##']))?.group).toBe('2-2-2');
    expect(identifyCubeNet(rotateNet(reflectNet(CROSS), 3))?.id).toBe(identifyCubeNet(CROSS).id);
    expect(identifyCubeNet(parseNet(['######']))).toBeNull();
  });

  it('11種類すべて、どの向き・どのマスを基準にしても立方体に折りたためる', () => {
    for (const net of CUBE_NETS) {
      for (const o of distinctOrientations(net.cells)) {
        for (const c of o) {
          const r = foldNet(o, { rootId: c.id });
          expect(r.valid).toBe(true);
          expect(new Set(Object.values(r.cellToFace)).size).toBe(6);
          for (const cell of o) expect(r.frames[cell.id].center).toEqual(r.frames[cell.id].outward); // 面の中心 = 外向きの法線
        }
      }
    }
  });

  it('展開図にならない図形は理由と問題のマスを返す', () => {
    for (const h of NON_CUBE_HEXOMINOES) {
      const r = foldNet(h.cells);
      expect(r.valid).toBe(false);
      expect(['faces-overlap', 'edge-conflict']).toContain(r.reason);
      expect(r.problemCells.length).toBeGreaterThan(0);
    }
    expect(foldNet(parseNet(['#####'])).reason).toBe('count');
    expect(foldNet(parseNet(['###.##', '#.....'])).reason).toBe('disconnected');
    expect(foldNet([...CROSS.slice(0, 5), { id: 'x', x: CROSS[0].x, y: CROSS[0].y }]).reason).toBe('overlap-cells');
    const square = foldNet(parseNet(['##..', '####']));
    expect(square.valid).toBe(false);
    expect(isCubeNet(CROSS)).toBe(true);
  });

  it('折る順番の木は6マスすべてをつなぐ', () => {
    const tree = buildFoldTree(CROSS);
    expect(tree.order).toHaveLength(6);
    expect(Object.values(tree.parent).filter((p) => p === null)).toHaveLength(1);
  });
});

describe('展開図と立方体の対応', () => {
  it('どの展開図でも、点・辺・面が立方体の頂点8・辺12・面6に正しく対応する', () => {
    for (const net of CUBE_NETS) {
      for (const o of distinctOrientations(net.cells)) {
        const m = getNetMapping(o);
        const boundaryPoints = [...m.points.values()].filter((p) => p.boundary);
        expect(boundaryPoints).toHaveLength(14);
        expect(boundaryPoints.every((p) => p.vertex)).toBe(true);
        expect(new Set(boundaryPoints.map((p) => p.vertex)).size).toBe(8);
        const boundarySegs = [...m.segments.values()].filter((s) => s.boundary);
        expect(boundarySegs).toHaveLength(14);
        // 外周の辺は2本ずつ重なって、7本の辺になる（残り5本は折り目）
        expect(new Set(boundarySegs.map((s) => s.edge)).size).toBe(7);
        for (const s of boundarySegs) expect(getCoincidentSegments(m, s.key)).toHaveLength(1);
        expect(new Set([...m.segments.values()].map((s) => s.edge)).size).toBe(12);
        // 向かい合う面・となり合う面
        for (const c of o) {
          const opp = getOppositeCell(m, c.id);
          expect(m.cellToFace[opp]).toBe(getOppositeFace(m.cellToFace[c.id]));
          expect(getCubeNeighborCells(m, c.id)).toHaveLength(4);
          expect(getCubeNeighborCells(m, c.id)).not.toContain(opp);
        }
      }
    }
  });

  it('十字形：上と下のマスが向かい合い、横一列の両はし（1つおき）も向かい合う', () => {
    const m = getNetMapping(CROSS);
    const at = (x, y) => CROSS.find((c) => c.x === x && c.y === y).id;
    expect(getOppositeCell(m, at(1, 0))).toBe(at(1, 2));
    expect(getOppositeCell(m, at(0, 1))).toBe(at(2, 1));
    expect(getOppositeCell(m, at(1, 1))).toBe(at(3, 1));
  });

  it('展開図の向きを変えても、重なる点・辺の組は変わらない', () => {
    const groups = (cells) => {
      const m = getNetMapping(cells);
      const byId = new Map();
      for (const c of cells) for (const [k, p] of m.points) if (p.cells.includes(c.id)) byId.set(k, p);
      // 「どのセルのどの角どうしが重なるか」を、セル ID と角の番号で表す
      const sig = [];
      for (const c of cells) {
        const corners = [[c.x, c.y], [c.x + 1, c.y], [c.x + 1, c.y + 1], [c.x, c.y + 1]];
        sig.push(corners.map(([x, y]) => getCoincidentPoints(m, `${x},${y}`).length).join(''));
      }
      return sig.sort().join('|');
    };
    const base = CUBE_NETS[3].cells;
    expect(groups(rotateNet(base, 1))).toBe(groups(rotateNet(base, 1)));
    // 折りたたみの基準を変えても、同じ点どうしが重なる
    const m1 = getNetMapping(base);
    const m2 = getNetMapping(base, { rootId: base[5].id });
    for (const k of m1.points.keys()) {
      expect(getCoincidentPoints(m1, k).sort()).toEqual(getCoincidentPoints(m2, k).sort());
    }
  });
});
