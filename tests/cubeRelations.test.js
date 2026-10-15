import { describe, it, expect } from 'vitest';
import { EDGES, FACES } from '../src/core/cubeConstants.js';
import { CubeElementError } from '../src/core/cubeGeometry.js';
import * as R from '../src/core/cubeRelations.js';

const EDGE_IDS = EDGES.map((e) => e.id);
const FACE_IDS = FACES.map((f) => f.id);

describe('辺と辺の位置関係（全12辺）', () => {
  it.each(EDGE_IDS)('辺%s：平行3本・交わる4本・ねじれ4本で、合わせて残り11本', (e) => {
    const parallel = R.getParallelEdges(e);
    const intersecting = R.getIntersectingEdges(e);
    const skew = R.getSkewEdges(e);
    expect(parallel).toHaveLength(3);
    expect(intersecting).toHaveLength(4);
    expect(skew).toHaveLength(4);
    // 3つの関係は重ならず、自分以外の11本をちょうど分ける
    const all = [...parallel, ...intersecting, ...skew];
    expect(new Set(all).size).toBe(11);
    expect(all).not.toContain(e);
    // 交わる辺は共通の頂点をもち、立方体ではすべて垂直
    for (const x of intersecting) expect(R.getCommonVertex(e, x)).not.toBeNull();
    expect(R.getPerpendicularEdges(e).sort()).toEqual([...intersecting].sort());
  });

  it('具体例', () => {
    expect(R.getParallelEdges('AB').sort()).toEqual(['CD', 'EF', 'GH']);
    expect(R.getIntersectingEdges('AB').sort()).toEqual(['AE', 'BC', 'BF', 'DA']);
    expect(R.getSkewEdges('AB').sort()).toEqual(['CG', 'DH', 'FG', 'HE']);
    expect(R.classifyEdgePair('AB', 'CG')).toBe('skew');
    expect(R.classifyEdgePair('AB', 'GH')).toBe('parallel');
    expect(R.classifyEdgePair('AB', 'BF')).toBe('intersecting');
    expect(R.getCommonVertex('AB', 'BF')).toBe('B');
  });

  it('すべての辺の組が「平行・交わる・ねじれ」のどれかに必ず入る', () => {
    for (const a of EDGE_IDS) {
      for (const b of EDGE_IDS) {
        expect(R.classifyEdgePair(a, b)).toMatch(a === b ? /^same$/ : /^(parallel|intersecting|skew)$/);
      }
    }
  });

  it('関係は対称（a と b を入れ替えても同じ）', () => {
    for (const a of EDGE_IDS) {
      for (const b of EDGE_IDS) {
        expect(R.areEdgesParallel(a, b)).toBe(R.areEdgesParallel(b, a));
        expect(R.doEdgesIntersect(a, b)).toBe(R.doEdgesIntersect(b, a));
        expect(R.areEdgesSkew(a, b)).toBe(R.areEdgesSkew(b, a));
        expect(R.areEdgesPerpendicular(a, b)).toBe(R.areEdgesPerpendicular(b, a));
      }
    }
  });

  it('自分自身は平行・交わる・ねじれ・垂直のどれにも含めない', () => {
    for (const e of EDGE_IDS) {
      expect(R.areEdgesParallel(e, e)).toBe(false);
      expect(R.doEdgesIntersect(e, e)).toBe(false);
      expect(R.areEdgesSkew(e, e)).toBe(false);
      expect(R.areEdgesPerpendicular(e, e)).toBe(false);
    }
  });

  it('線分としての交わりと、延長した直線としての交わりを区別する', () => {
    // 立方体の辺どうしでは、直線として交わるなら線分としても交わる（延長して初めて交わる組はない）
    for (const a of EDGE_IDS) {
      for (const b of EDGE_IDS) {
        expect(R.doEdgesIntersect(a, b, { as: 'line' })).toBe(R.doEdgesIntersect(a, b));
      }
    }
    // 平行な2辺は、直線としても交わらない
    expect(R.doEdgesIntersect('AB', 'CD', { as: 'line' })).toBe(false);
    // ねじれの2辺は、延長しても交わらない
    expect(R.doEdgesIntersect('AB', 'CG', { as: 'line' })).toBe(false);
  });

  it('垂直はなす角の内積 0 で判定し、ねじれの位置で直角の組は垂直に含めない', () => {
    // AB（x方向）と CG（y方向）は直角だが、ねじれの位置
    expect(R.areEdgesSkew('AB', 'CG')).toBe(true);
    expect(R.areEdgesPerpendicular('AB', 'CG')).toBe(false);
    expect(R.areEdgesPerpendicular('AB', 'BF')).toBe(true);
    expect(R.areEdgesPerpendicular('AB', 'BC')).toBe(true);
  });
});

describe('面と面の位置関係（全6面）', () => {
  it.each(FACE_IDS)('面%s：平行1面・垂直4面', (f) => {
    expect(R.getParallelFaces(f)).toHaveLength(1);
    expect(R.getPerpendicularFaces(f)).toHaveLength(4);
    expect(R.getPerpendicularFaces(f)).not.toContain(f);
    expect(R.getParallelFaces(f)).not.toContain(f);
  });

  it('具体例・対称性・自分自身', () => {
    expect(R.getParallelFaces('ABCD')).toEqual(['EFGH']);
    expect(R.getPerpendicularFaces('ABCD').sort()).toEqual(['ABFE', 'BCGF', 'CDHG', 'DAEH']);
    for (const f of FACE_IDS) {
      expect(R.areFacesParallel(f, f)).toBe(false);
      for (const g of FACE_IDS) {
        expect(R.areFacesParallel(f, g)).toBe(R.areFacesParallel(g, f));
        expect(R.areFacesPerpendicular(f, g)).toBe(R.areFacesPerpendicular(g, f));
      }
    }
    expect(R.getCommonEdge('ABCD', 'ABFE')).toBe('AB');
    expect(R.getCommonEdge('ABCD', 'EFGH')).toBeNull();
  });
});

describe('辺と面の位置関係', () => {
  it.each(EDGE_IDS)('辺%s：含む面2・平行な面2・垂直な面2', (e) => {
    const contained = R.getFacesContainingEdge(e);
    const parallel = R.getFacesParallelToEdge(e);
    const perpendicular = R.getFacesPerpendicularToEdge(e);
    expect(contained).toHaveLength(2);
    expect(parallel).toHaveLength(2);
    expect(perpendicular).toHaveLength(2);
    // 辺を含む面は平行に数えない
    expect(parallel.some((f) => contained.includes(f))).toBe(false);
    expect(new Set([...contained, ...parallel, ...perpendicular]).size).toBe(6);
  });

  it.each(FACE_IDS)('面%s：垂直な辺4本・含む辺4本・平行な辺4本', (f) => {
    expect(R.getEdgesPerpendicularToFace(f)).toHaveLength(4);
    expect(R.getEdgesInFace(f)).toHaveLength(4);
    expect(R.getEdgesParallelToFace(f)).toHaveLength(4);
  });

  it('具体例', () => {
    expect(R.getFacesParallelToEdge('AB').sort()).toEqual(['CDHG', 'EFGH']);
    expect(R.getFacesPerpendicularToEdge('AB').sort()).toEqual(['BCGF', 'DAEH']);
    expect(R.getEdgesPerpendicularToFace('ABCD').sort()).toEqual(['AE', 'BF', 'CG', 'DH']);
    expect(R.classifyEdgeFace('AB', 'ABCD')).toBe('contained');
    expect(R.classifyEdgeFace('AB', 'EFGH')).toBe('parallel');
    expect(R.classifyEdgeFace('AE', 'ABCD')).toBe('perpendicular');
    expect(R.getEdgeFaceMeetingVertex('AE', 'EFGH')).toBe('E');
    expect(R.getEdgeFaceMeetingVertex('AB', 'EFGH')).toBeNull();
  });

  it('立方体には斜めに交わる辺と面はない', () => {
    for (const e of EDGE_IDS) for (const f of FACE_IDS) expect(R.classifyEdgeFace(e, f)).not.toBe('oblique');
  });
});

describe('無効な ID', () => {
  it('存在しない要素や種類違いは CubeElementError', () => {
    expect(() => R.areEdgesParallel('AB', 'AC')).toThrow(CubeElementError);
    expect(() => R.areFacesParallel('ABCD', 'AB')).toThrow(CubeElementError);
    expect(() => R.isEdgeParallelToFace('ABCD', 'AB')).toThrow(CubeElementError);
    expect(() => R.getParallelEdges('XY')).toThrow(CubeElementError);
  });

  it('表記ゆれ（逆順）は正規化される', () => {
    expect(R.areEdgesParallel('BA', 'DC')).toBe(true);
    expect(R.isEdgeContainedInFace('BA', 'FGCB')).toBe(false);
    expect(R.isEdgeContainedInFace('FB', 'FGCB')).toBe(true);
  });
});
