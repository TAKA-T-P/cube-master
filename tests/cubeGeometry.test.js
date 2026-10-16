import { describe, it, expect } from 'vitest';
import { VERTICES, EDGES, FACES, CUBE_SIZE } from '../src/core/cubeConstants.js';
import {
  getEdgesOfVertex,
  getFacesOfEdge,
  getFacesOfVertex,
  getEdgesOfFace,
  getOppositeFace,
  getEdgeLength,
  getFaceCenter,
  getFaceNormal,
  getVertexPosition,
  resolveElement,
  resolveElementOfType,
  isValidElementId,
  sortElementIds,
  vecSub,
  vecCross,
  vecDot,
  CubeElementError,
} from '../src/core/cubeGeometry.js';

describe('立方体の数学データ', () => {
  it('頂点が8個存在する', () => {
    expect(VERTICES).toHaveLength(8);
    expect(VERTICES.map((v) => v.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });

  it('頂点の座標が仕様どおり', () => {
    const expected = {
      A: [-1, 1, 1],
      B: [1, 1, 1],
      C: [1, 1, -1],
      D: [-1, 1, -1],
      E: [-1, -1, 1],
      F: [1, -1, 1],
      G: [1, -1, -1],
      H: [-1, -1, -1],
    };
    for (const [id, pos] of Object.entries(expected)) expect(getVertexPosition(id)).toEqual(pos);
    // 8頂点の座標はすべて異なる
    expect(new Set(VERTICES.map((v) => v.position.join(','))).size).toBe(8);
  });

  it('辺が12本存在し、IDが重複しない', () => {
    expect(EDGES).toHaveLength(12);
    expect(new Set(EDGES.map((e) => e.id)).size).toBe(12);
    expect(EDGES.map((e) => e.id)).toEqual(['AB', 'BC', 'CD', 'DA', 'EF', 'FG', 'GH', 'HE', 'AE', 'BF', 'CG', 'DH']);
  });

  it('面が6面存在する', () => {
    expect(FACES).toHaveLength(6);
    expect(FACES.map((f) => f.id)).toEqual(['ABCD', 'EFGH', 'ABFE', 'BCGF', 'CDHG', 'DAEH']);
  });

  it('すべての辺が異なる2頂点を結ぶ', () => {
    const vertexIds = new Set(VERTICES.map((v) => v.id));
    for (const edge of EDGES) {
      expect(edge.vertices).toHaveLength(2);
      const [a, b] = edge.vertices;
      expect(a).not.toBe(b);
      expect(vertexIds.has(a) && vertexIds.has(b)).toBe(true);
      expect(edge.id).toBe(a + b);
    }
    // 同じ2頂点の組が2回出てこない
    expect(new Set(EDGES.map((e) => [...e.vertices].sort().join(''))).size).toBe(12);
  });

  it('すべての辺の長さが2である', () => {
    for (const edge of EDGES) expect(getEdgeLength(edge.id)).toBeCloseTo(CUBE_SIZE, 10);
  });

  it('すべての面が異なる4頂点で構成され、隣り合う頂点は辺で結ばれる', () => {
    const edgeKeys = new Set(EDGES.map((e) => [...e.vertices].sort().join('')));
    for (const face of FACES) {
      expect(face.vertices).toHaveLength(4);
      expect(new Set(face.vertices).size).toBe(4);
      for (let i = 0; i < 4; i++) {
        const key = [face.vertices[i], face.vertices[(i + 1) % 4]].sort().join('');
        expect(edgeKeys.has(key)).toBe(true);
      }
      expect(getEdgesOfFace(face.id)).toHaveLength(4);
    }
  });

  it('各頂点に3本の辺・3つの面が接続する', () => {
    for (const v of VERTICES) {
      expect(getEdgesOfVertex(v.id)).toHaveLength(3);
      expect(getFacesOfVertex(v.id)).toHaveLength(3);
    }
  });

  it('各辺に2面が接続する', () => {
    for (const e of EDGES) expect(getFacesOfEdge(e.id)).toHaveLength(2);
    expect(getFacesOfEdge('AB').sort()).toEqual(['ABCD', 'ABFE']);
    expect(getFacesOfEdge('CG').sort()).toEqual(['BCGF', 'CDHG']);
  });

  it('面の法線方向が正しい（仕様の値・外向き・頂点の並びと一致）', () => {
    const expected = {
      ABCD: [0, 1, 0], // 上面
      EFGH: [0, -1, 0], // 底面
      ABFE: [0, 0, 1],
      BCGF: [1, 0, 0],
      CDHG: [0, 0, -1],
      DAEH: [-1, 0, 0],
    };
    for (const face of FACES) {
      const n = getFaceNormal(face.id);
      expect(n).toEqual(expected[face.id]);
      // 面の中心は 法線 × 1（中心から外向き）
      expect(getFaceCenter(face.id)).toEqual(n.map((x) => x * 1));
      // 4頂点はすべて同じ平面（法線方向の座標が一定）上にある
      for (const vid of face.vertices) expect(vecDot(getVertexPosition(vid), n)).toBe(1);
      // 頂点の並びから求めた法線が、定義された法線と平行
      const [p0, p1, p2] = face.vertices.map(getVertexPosition);
      const cross = vecCross(vecSub(p1, p0), vecSub(p2, p1));
      expect(Math.abs(vecDot(cross, n))).toBeCloseTo(4, 10);
    }
  });

  it('向かい合う面の組み合わせが正しい', () => {
    expect(getOppositeFace('ABCD')).toBe('EFGH');
    expect(getOppositeFace('EFGH')).toBe('ABCD');
    expect(getOppositeFace('ABFE')).toBe('CDHG');
    expect(getOppositeFace('CDHG')).toBe('ABFE');
    expect(getOppositeFace('BCGF')).toBe('DAEH');
    expect(getOppositeFace('DAEH')).toBe('BCGF');
    // 向かい合う面は頂点を共有しない
    for (const f of FACES) {
      const opposite = FACES.find((g) => g.id === getOppositeFace(f.id));
      expect(f.vertices.some((v) => opposite.vertices.includes(v))).toBe(false);
    }
  });

  it('データは変更できない（凍結されている）', () => {
    expect(Object.isFrozen(VERTICES)).toBe(true);
    expect(Object.isFrozen(VERTICES[0].position)).toBe(true);
    expect(Object.isFrozen(EDGES[0].vertices)).toBe(true);
    expect(Object.isFrozen(FACES[0].normal)).toBe(true);
  });
});

describe('要素IDの正規化', () => {
  it('頂点・辺・面を判別して正規IDを返す', () => {
    expect(resolveElement('A')).toEqual({ type: 'vertex', id: 'A' });
    expect(resolveElement('ba')).toEqual({ type: 'edge', id: 'AB' });
    expect(resolveElement('EA')).toEqual({ type: 'edge', id: 'AE' });
    expect(resolveElement('FGCB')).toEqual({ type: 'face', id: 'BCGF' });
    expect(resolveElement(' a b f e ')).toEqual({ type: 'face', id: 'ABFE' });
  });

  it('無効なIDは CubeElementError になる', () => {
    for (const bad of ['', 'Z', 'AC', 'AG', 'ABC', 'ABCE', 'AA', 'ABCDE', null, 1, undefined]) {
      expect(() => resolveElement(bad)).toThrow(CubeElementError);
      expect(isValidElementId(bad)).toBe(false);
    }
  });

  it('種類が違う場合もエラーになる', () => {
    expect(resolveElementOfType('AB', 'edge')).toBe('AB');
    expect(() => resolveElementOfType('AB', 'vertex')).toThrow(CubeElementError);
  });

  it('標準順序で並べ替える', () => {
    expect(sortElementIds(['DAEH', 'AB', 'H', 'A', 'DH', 'ABCD'])).toEqual(['A', 'H', 'AB', 'DH', 'ABCD', 'DAEH']);
  });
});
