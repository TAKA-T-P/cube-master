// 立方体に内接する立体と体積（Phase 8）：凸包・体積・体積比、I01〜I06 の問題、3D の内接立体と演出
import { describe, it, expect, vi } from 'vitest';
import { Q, qvec, vToNumbers } from '../src/core/rational.js';
import {
  convexHull,
  calculatePolyhedronVolume,
  volumeByTetrahedra,
  signedVolume,
  classifyPolyhedron,
  isValidPolyhedron,
  createInscribedOctahedron,
  createInscribedTetrahedron,
  createPyramid,
  getFaceCenters,
  calculateVolumeRatio,
  isInsideCube,
  cubeVertexQ,
  CUBE_VOLUME,
} from '../src/core/inscribedSolids.js';
import { tetrahedronVolume } from '../src/core/cubeCutting.js';
import { CUBE_ROTATIONS, rotatePoint } from '../src/questions/surfacePoints.js';
import { INSCRIBED_TEMPLATES } from '../src/questions/inscribedSolid/inscribedSolidGenerators.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { QuestionPicker } from '../src/core/questionEngine.js';
import { createRng } from '../src/utils/random.js';
import { createInscribedSolidModel } from '../src/three/inscribedSolidModel.js';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { AnimationManager } from '../src/three/animationManager.js';
import { createOrientationState, createQuestionReveal } from '../src/three/cubeRotationAnimations.js';
import { InputLock } from '../src/core/inputLock.js';

const byId = Object.fromEntries(INSCRIBED_TEMPLATES.map((t) => [t.id, t]));
const questions = (t, seeds = [1, 2, 3, 4, 5], per = 4) =>
  seeds.flatMap((seed) => {
    const picker = new QuestionPicker({ templates: [t], rng: createRng(seed) });
    return Array.from({ length: per }, () => picker.next());
  });
const vol = (pts) => calculatePolyhedronVolume(convexHull(pts));
const cubeOf = (s) => new Q(s * s * s);
const sideOf = (q) => Number(q.question.match(/1辺(\d+)cm/)[1]);

describe('内接立体の数学', () => {
  it('正八面体：頂点は6つの面の中心、立方体の中に収まり、体積は立方体の1/6（一辺2で 4/3）', () => {
    const oct = createInscribedOctahedron();
    expect(isValidPolyhedron(oct)).toBe(true);
    expect(oct.vertices.map((v) => vToNumbers(v).join()).sort()).toEqual(getFaceCenters().map((v) => vToNumbers(v).join()).sort());
    expect(oct.vertices.every(isInsideCube)).toBe(true);
    expect(classifyPolyhedron(oct)).toMatchObject({ name: '八面体', regular: true, vertexCount: 6, faceCount: 8, edgeCount: 12 });
    expect(calculatePolyhedronVolume(oct).toString()).toBe('4/3');
    expect(calculateVolumeRatio(calculatePolyhedronVolume(oct), CUBE_VOLUME).toString()).toBe('1/6');
  });

  it('互い違いの4頂点の正四面体：体積は立方体の1/3。6本の辺がすべて等しい', () => {
    for (const ids of [['A', 'C', 'F', 'H'], ['B', 'D', 'E', 'G']]) {
      const t = createInscribedTetrahedron(ids);
      expect(classifyPolyhedron(t)).toMatchObject({ name: '三角すい', regular: true });
      expect(calculateVolumeRatio(calculatePolyhedronVolume(t), CUBE_VOLUME).toString()).toBe('1/3');
    }
  });

  it('四面体の体積：凸包の体積 ＝ |det|/6 ＝ 四面体に分けた体積（立方体の4頂点の全58通り）', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    let count = 0;
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) for (let c = b + 1; c < 8; c++) for (let d = c + 1; d < 8; d++) {
      const pts = [ids[a], ids[b], ids[c], ids[d]].map(cubeVertexQ);
      const hull = convexHull(pts);
      const det = tetrahedronVolume(...pts);
      if (det.isZero()) {
        expect(hull).toBeNull(); // 同じ平面の4点は立体にならない（退化した多面体を作らない）
        continue;
      }
      count += 1;
      expect(calculatePolyhedronVolume(hull).eq(det)).toBe(true);
      expect(volumeByTetrahedra(hull).eq(det)).toBe(true);
    }
    expect(count).toBe(58);
  });

  it('四角すい：体積 ＝ 底面積×高さ÷3（面ABCD + 頂点E は 4×2÷3 ＝ 8/3）', () => {
    const p = createPyramid(cubeVertexQ('E'), ['A', 'B', 'C', 'D'].map(cubeVertexQ));
    expect(classifyPolyhedron(p).name).toBe('四角すい');
    expect(calculatePolyhedronVolume(p).eq(new Q(4 * 2, 3))).toBe(true);
  });

  it('立方体は、1つの頂点を共有する3つの合同な四角すいに分けられる（体積の和＝立方体）', () => {
    const E = cubeVertexQ('E');
    const sum = ['ABCD', 'BCGF', 'CDHG'].map((f) => vol([E, ...f.split('').map(cubeVertexQ)])).reduce((s, v) => s.add(v), new Q(0));
    expect(sum.eq(CUBE_VOLUME)).toBe(true);
  });

  it('凹んだ立体でも、向きのそろった面から体積を正しく求められる（立方体 − 角の三角すい）', () => {
    const cube = convexHull(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(cubeVertexQ));
    expect(signedVolume(cube.faces.map((f) => f.polygon)).eq(8)).toBe(true);
  });

  it('立方体を回転しても、体積は変わらない（24通り）', () => {
    const pts = ['A', 'B', 'D', 'E'].map((id) => vToNumbers(cubeVertexQ(id)));
    const base = vol(pts);
    for (const m of CUBE_ROTATIONS) expect(vol(pts.map((p) => rotatePoint(m, p))).eq(base)).toBe(true);
  });
});

describe('内接立体の問題（I01〜I06）', () => {
  it('どの問題も正しい形で、正解は1つ・選択肢に同じ値がない', () => {
    for (const t of INSCRIBED_TEMPLATES) {
      for (const q of questions(t, [3, 8], 3)) {
        expect(getQuestionErrors(q), q.key).toEqual([]);
        expect(q.correctAnswers).toHaveLength(1);
        expect(new Set(q.choices.map((c) => c.label)).size).toBe(q.choices.length);
      }
    }
  });

  it('I01：答えの名前は、示した点の凸包の形と一致する', () => {
    const map = { triPyramid: '三角すい', quadPyramid: '四角すい', triPrism: '三角柱', quadPrism: '四角柱' };
    const seen = new Set();
    for (const q of questions(byId.I01, [1, 2, 3, 4, 5, 6], 5)) {
      const main = q.scene.solid.solids.find((s) => s.role === 'main');
      expect(classifyPolyhedron(convexHull(main.points)).name).toBe(map[q.correctAnswers[0]]);
      expect(main.points).toEqual(q.scene.solid.points.map((p) => p.position));
      seen.add(map[q.correctAnswers[0]]);
    }
    expect([...seen].sort()).toEqual(['三角すい', '三角柱', '四角すい', '四角柱'].sort());
  });

  it('I02・I04：正八面体（6つの面の中心）。I04 の答えは 1/6倍 か 6倍で、上下2つの四角すいに分けられる', () => {
    for (const q of questions(byId.I02, [1, 2], 2)) expect(q.choices.find((c) => c.id === 'answer').label).toBe('正八面体');
    for (const q of questions(byId.I04, [1, 2, 3], 3)) {
      const label = q.choices.find((c) => c.id === 'answer').label;
      expect(['1/6倍', '6倍']).toContain(label);
      const parts = q.scene.solid.solids.filter((s) => s.role === 'part');
      expect(parts).toHaveLength(2);
      expect(parts.map((p) => vol(p.points)).reduce((s, v) => s.add(v)).eq(new Q(4, 3))).toBe(true);
      for (const p of parts) expect(classifyPolyhedron(convexHull(p.points)).name).toBe('四角すい');
    }
  });

  it('I03・I05：答えの体積 ＝ 立体の体積 ×（1辺÷2）³、解説の式の答えと同じ', () => {
    for (const id of ['I03', 'I05']) {
      for (const q of questions(byId[id])) {
        const s = sideOf(q);
        const main = q.scene.solid.solids.find((x) => x.role === 'main');
        const v = vol(main.points).mul(new Q(s * s * s, 8));
        expect(q.choices.find((c) => c.id === q.correctAnswers[0]).label).toBe(`${v}cm³`);
        expect(q.explanation.text).toContain(`${v}cm³`);
      }
    }
  });

  it('I05 の正四面体：まわりの4つの三角すい（黄色）と合わせると立方体になる', () => {
    const regular = questions(byId.I05, [1, 2, 3, 4, 5, 6], 4).filter((q) => q.scene.solid.solids.some((s) => s.role === 'removed'));
    expect(regular.length).toBeGreaterThan(0);
    for (const q of regular) {
      const total = q.scene.solid.solids.map((s) => vol(s.points)).reduce((a, b) => a.add(b));
      expect(total.eq(CUBE_VOLUME)).toBe(true);
    }
  });

  it('I06：取り除いた立体と残りの立体（凸な部分に分けたもの）の体積の和は立方体。答えは残りの体積', () => {
    const kinds = new Set();
    for (const q of questions(byId.I06, [1, 2, 3, 4, 5, 6], 5)) {
      const s = sideOf(q);
      const removed = q.scene.solid.solids.filter((x) => x.role === 'removed').map((x) => vol(x.points));
      const rest = q.scene.solid.solids.filter((x) => x.role === 'remaining').map((x) => vol(x.points));
      expect(removed).toHaveLength(1);
      expect([...removed, ...rest].reduce((a, b) => a.add(b)).eq(CUBE_VOLUME)).toBe(true);
      const answer = rest.reduce((a, b) => a.add(b)).mul(new Q(s * s * s, 8));
      expect(q.choices.find((c) => c.id === q.correctAnswers[0]).label).toBe(`${answer}cm³`);
      kinds.add(q.key.split(':')[1].split('-')[0]);
      // 回答前に見せるのは取り除く立体の辺だけ
      expect(q.scene.solid.outlines).toEqual([q.scene.solid.solids.find((x) => x.role === 'removed').points]);
    }
    expect([...kinds].sort()).toEqual(['corner', 'cpyr', 'vpyr']);
  });
});

describe('内接立体の 3D モデルと演出', () => {
  function setup(q) {
    const model = createCubeModel({ labels: false });
    const state = createOrientationState(model.root);
    const highlights = createHighlightManager(model);
    const solid = createInscribedSolidModel({ cubeRoot: model.root, labels: false, onInfo: vi.fn() });
    solid.set(q.scene.solid);
    const manager = new AnimationManager({ inputLock: new InputLock() });
    const controls = { setHomeDirection: vi.fn(), resetCamera: vi.fn(), getViewDirection: () => [4, 3, 5], setViewDirection: vi.fn() };
    return { model, state, highlights, solid, manager, controls };
  }
  const run = async (manager, anim) => {
    const done = manager.play(anim);
    for (let t = 0; manager.isActive() && t < 60000; t += 50) manager.tick(t);
    return done;
  };

  it('回答前は点と示した辺だけ。I04：正八面体ができて、上下2つの四角すいに分けて（位置は動かさずに）体積比を表示する', async () => {
    const [q] = questions(byId.I04, [2], 1);
    const { model, state, highlights, solid, manager, controls } = setup(q);
    let s = solid.getState();
    expect(s.solids.every((x) => !x.visible)).toBe(true);
    await run(manager, createQuestionReveal({ state, controls, highlights, solid }, { steps: q.explanation.reveal.steps }));
    s = solid.getState();
    expect(s).toMatchObject({ build: 1, fade: 1, split: 1, cubeVisible: false });
    expect(s.info).toMatch(/1\/6|×6/);
    const parts = s.solids.filter((x) => x.role === 'part');
    expect(parts.every((x) => x.visible)).toBe(true);
    // 2つの四角すいは、もとの位置のまま（はなさない）
    for (const p of parts) expect(Math.hypot(...p.offset)).toBe(0);
    expect(s.solids.find((x) => x.role === 'main').visible).toBe(false);
    // 完成した立体は、立方体の中の本来の位置から動かさない
    const [i01] = questions(byId.I01, [1], 1);
    const other = setup(i01);
    await run(other.manager, createQuestionReveal({ state: other.state, controls: other.controls, highlights: other.highlights, solid: other.solid }, { steps: i01.explanation.reveal.steps }));
    expect(other.solid.getState().solids.find((x) => x.role === 'main')).toMatchObject({ visible: true, offset: [0, 0, 0] });
    other.solid.dispose();
    // リプレイ：はじめから（立方体を表示し、立体は隠す）
    const again = manager.play(createQuestionReveal({ state, controls, highlights, solid }, { steps: q.explanation.reveal.steps }));
    expect(solid.getState()).toMatchObject({ build: 0, split: 0, cubeVisible: true, info: '' });
    manager.skip();
    await again;
    expect(solid.getState()).toMatchObject({ split: 1 });
    solid.set(null);
    expect(model.root.visible).toBe(true);
    solid.dispose();
  });

  it('I06：取り除く立体（黄色）が立方体の外へ動き、残りの立体（緑）が残る', async () => {
    const [q] = questions(byId.I06, [4], 1);
    const { state, highlights, solid, manager, controls } = setup(q);
    expect(solid.getState().outlinesVisible).toBe(true);
    await run(manager, createQuestionReveal({ state, controls, highlights, solid }, { steps: q.explanation.reveal.steps }));
    const s = solid.getState();
    expect(s.remove).toBe(1);
    const removed = s.solids.find((x) => x.role === 'removed');
    expect(removed.visible).toBe(true);
    expect(Math.hypot(...removed.offset)).toBeGreaterThan(0.5);
    expect(s.solids.filter((x) => x.role === 'remaining').every((x) => x.visible && x.offset.every((v) => v === 0))).toBe(true);
    expect(s.outlinesVisible).toBe(false);
    expect(s.info).toContain('cm³');
    solid.dispose();
  });
});

export { qvec };
