// 3D モデルと強調表示の管理（WebGL を使わずに、シーングラフの状態だけを検証する）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCubeModel, FACE_DISPLAY_MODES } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { CubeElementError } from '../src/core/cubeGeometry.js';
import { CUBE_COLORS } from '../src/core/cubeConstants.js';

describe('cubeModel', () => {
  it('各要素が数学的IDを持ち、定義どおりの位置に配置される', () => {
    const model = createCubeModel({ labels: false });
    const { facesGroup, edgesGroup, verticesGroup } = model.groups;
    expect(facesGroup.children).toHaveLength(6);
    expect(edgesGroup.children).toHaveLength(24); // 表示用 + 判定用
    expect(verticesGroup.children).toHaveLength(16);

    expect(model.getElement('G').mesh.position.toArray()).toEqual([1, 1, -1]);
    expect(model.getElement('BA').mesh.position.toArray()).toEqual([0, -1, 1]);
    const face = model.getElement('BCGF').mesh;
    expect(face.position.toArray()).toEqual([1, 0, 0]);
    expect(face.userData).toEqual({ elementType: 'face', elementId: 'BCGF' });
    model.dispose();
  });

  it('選択色の切り替えと面の表示モード', () => {
    const model = createCubeModel({ labels: false });
    model.setSelected('AB', true);
    expect(model.getElement('AB').mesh.material.color.getHex()).toBe(CUBE_COLORS.selected);
    model.setSelected('AB', false);
    expect(model.getElement('AB').mesh.material.color.getHex()).toBe(CUBE_COLORS.edge);

    model.setFaceDisplayMode(FACE_DISPLAY_MODES.TRANSLUCENT);
    expect(model.getElement('ABCD').mesh.material.opacity).toBeLessThan(1);
    expect(model.getPickTargets('face')).toHaveLength(6);
    expect(model.getOccluders()).toHaveLength(0);

    model.setFaceDisplayMode(FACE_DISPLAY_MODES.WIREFRAME);
    expect(model.getPickTargets('face')).toHaveLength(0); // 非表示の面は選択対象外
    expect(model.getPickTargets('edge')).toHaveLength(12);

    model.setFaceDisplayMode(FACE_DISPLAY_MODES.OPAQUE);
    expect(model.getOccluders()).toHaveLength(6);
    expect(() => model.setFaceDisplayMode('glass')).toThrow();
    model.dispose();
  });
});

describe('強調表示', () => {
  let model;
  let highlights;
  let onChange;

  beforeEach(() => {
    model = createCubeModel({ labels: false });
    onChange = vi.fn();
    highlights = createHighlightManager(model, { onChange });
  });

  afterEach(() => {
    highlights.dispose();
    model.dispose();
    vi.useRealTimers();
  });

  it('頂点・辺・面を指定して強調でき、解除できる', () => {
    highlights.highlightVertex('A');
    highlights.highlightEdge('FB');
    highlights.highlightFace('EFGH', { color: 'selected', opacity: 0.4 });
    expect(highlights.getHighlighted().sort()).toEqual(['A', 'BF', 'EFGH']);
    expect(model.groups.highlightsGroup.children).toHaveLength(3);
    expect(highlights.getHighlight('EFGH').material.opacity).toBe(0.4);
    expect(highlights.getHighlight('A').material.color.getHex()).toBe(CUBE_COLORS.correct);

    highlights.clearHighlights(['BF']);
    expect(highlights.getHighlighted().sort()).toEqual(['A', 'EFGH']);

    highlights.clearHighlights();
    expect(highlights.getHighlighted()).toEqual([]);
    expect(model.groups.highlightsGroup.children).toHaveLength(0);
    expect(onChange).toHaveBeenCalled();
  });

  it('強調しても元のメッシュの見た目は変わらない（選択とは別管理）', () => {
    const edge = model.getElement('AB').mesh;
    const before = edge.material.color.getHex();
    highlights.highlightEdge('AB', { color: 0xff0000 });
    expect(edge.material.color.getHex()).toBe(before);
    highlights.clearHighlights();
    expect(edge.material.color.getHex()).toBe(before);
  });

  it('highlightElements で種類の混在したIDをまとめて強調できる', () => {
    highlights.highlightElements(['G', 'CG', 'CDHG']);
    expect(highlights.getHighlighted().sort()).toEqual(['CDHG', 'CG', 'G']);
  });

  it('表示時間を過ぎると自動で解除される', () => {
    vi.useFakeTimers();
    highlights.highlightFace('ABCD', { duration: 1000 });
    expect(highlights.isHighlighted('ABCD')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(highlights.isHighlighted('ABCD')).toBe(false);
  });

  it('無効なIDや種類違いはエラーになり、何も強調されない', () => {
    expect(() => highlights.highlightVertex('Z')).toThrow(CubeElementError);
    expect(() => highlights.highlightEdge('AC')).toThrow(CubeElementError);
    expect(() => highlights.highlightFace('AB')).toThrow(CubeElementError);
    expect(() => highlights.highlightElements(['A', 'XYZ'])).toThrow(CubeElementError);
    expect(highlights.getHighlighted()).toEqual([]);
  });
});
