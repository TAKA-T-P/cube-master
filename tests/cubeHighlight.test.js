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

describe('強調表示のレイヤーと優先順位（Phase 1）', () => {
  let model;
  let highlights;

  beforeEach(() => {
    model = createCubeModel({ labels: false });
    highlights = createHighlightManager(model);
  });

  afterEach(() => {
    highlights.dispose();
    model.dispose();
  });

  it('基準・誤選択・正解を別々に管理し、レイヤー単位で解除できる', () => {
    highlights.highlightElements(['AB'], { layer: 'reference' });
    highlights.highlightElements(['CD', 'EF'], { layer: 'correct' });
    highlights.highlightElements(['AE'], { layer: 'wrong' });
    expect(highlights.getHighlight('AB').material.color.getHex()).toBe(CUBE_COLORS.reference);
    expect(highlights.getHighlight('AE').material.color.getHex()).toBe(CUBE_COLORS.wrong);
    expect(highlights.getHighlight('CD').material.color.getHex()).toBe(CUBE_COLORS.correct);
    expect(highlights.getHighlighted('correct').sort()).toEqual(['CD', 'EF']);

    highlights.clearLayer('correct');
    highlights.clearLayer('wrong');
    expect(highlights.getHighlighted()).toEqual(['AB']); // 基準は残る
  });

  it('同じ要素が複数レイヤーにあるときは 正解 > 誤選択 > 解説 > 基準 の順で1つだけ表示する', () => {
    highlights.highlightEdge('AB', { layer: 'reference' });
    highlights.highlightEdge('AB', { layer: 'wrong' });
    expect(highlights.getVisibleLayer('AB')).toBe('wrong');
    highlights.highlightEdge('AB', { layer: 'correct' });
    expect(highlights.getVisibleLayer('AB')).toBe('correct');
    const visible = model.groups.highlightsGroup.children.filter((o) => o.visible);
    expect(visible).toHaveLength(1);

    // 上位レイヤーを消すと、下のレイヤーの表示に戻る
    highlights.clearHighlights(['AB'], { layer: 'correct' });
    expect(highlights.getVisibleLayer('AB')).toBe('wrong');
    highlights.clearLayer('wrong');
    expect(highlights.getVisibleLayer('AB')).toBe('reference');
    highlights.clearHighlights();
    expect(highlights.getVisibleLayer('AB')).toBeNull();
  });
});

describe('正解演出アニメーション', () => {
  it('誤選択を赤、正解を1つずつ緑で表示し、リプレイしても重ならない。基準は消さない', async () => {
    const { AnimationManager } = await import('../src/three/animationManager.js');
    const { createAnswerReveal } = await import('../src/three/cubeAnimations.js');
    const { InputLock } = await import('../src/core/inputLock.js');
    const model = createCubeModel({ labels: false });
    const highlights = createHighlightManager(model);
    const inputLock = new InputLock();
    const manager = new AnimationManager({ inputLock });
    highlights.highlightEdge('AB', { layer: 'reference' });

    const play = () => manager.play(createAnswerReveal(highlights, { wrong: ['AE'], correct: ['CD', 'EF', 'GH'] }));
    let done = play();
    manager.tick(0);
    manager.tick(200);
    expect(highlights.getHighlighted('wrong')).toEqual(['AE']);
    expect(highlights.getHighlighted('correct')).toEqual([]); // 正解はまだ
    expect(inputLock.isLocked()).toBe(true);
    for (let t = 300; t <= 3000; t += 100) manager.tick(t);
    await expect(done).resolves.toEqual({ status: 'completed' });
    expect(highlights.getHighlighted('correct')).toEqual(['CD', 'EF', 'GH']);
    expect(highlights.getHighlight('GH').material.opacity).toBe(1);
    expect(inputLock.isLocked()).toBe(false); // 演出後は自由に回転できる

    // リプレイ → スキップ：最終状態になり、オーバーレイは増えない
    done = play();
    manager.skip();
    await expect(done).resolves.toEqual({ status: 'skipped' });
    expect(highlights.getHighlighted('correct')).toEqual(['CD', 'EF', 'GH']);
    expect(highlights.getHighlighted('reference')).toEqual(['AB']);
    expect(model.groups.highlightsGroup.children).toHaveLength(5);

    highlights.dispose();
    model.dispose();
  });
});
