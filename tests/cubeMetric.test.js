// 立方体に隠れた図形・長さ・角度（Phase 8）：距離・角度・三角形・面積、G01〜G06 の問題、3D の線分・三角形と取り出す演出
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Q } from '../src/core/rational.js';
import { Surd } from '../src/core/surd.js';
import {
  distance3D,
  faceDiagonalLength,
  spaceDiagonalLength,
  angleBetweenVectors,
  angleAt,
  classifyTriangle,
  triangleArea3D,
  triangleSideLengths,
  allVertexSegments,
} from '../src/core/cubeMetricGeometry.js';
import { VERTICES } from '../src/core/cubeConstants.js';
import { CUBE_ROTATIONS, rotatePoint } from '../src/questions/surfacePoints.js';
import { GEOMETRY_TEMPLATES, triangleAreaByFormula } from '../src/questions/cubeGeometryChallenge/cubeGeometryGenerators.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { QuestionPicker } from '../src/core/questionEngine.js';
import { createRng } from '../src/utils/random.js';
import { createCubeMetricModel } from '../src/three/cubeMetricModel.js';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { AnimationManager } from '../src/three/animationManager.js';
import { createOrientationState, createQuestionReveal } from '../src/three/cubeRotationAnimations.js';
import { InputLock } from '../src/core/inputLock.js';

const P = Object.fromEntries(VERTICES.map((v) => [v.id, v.position]));
const byId = Object.fromEntries(GEOMETRY_TEMPLATES.map((t) => [t.id, t]));
const questions = (t, seeds = [1, 2, 3, 4, 5], per = 4) =>
  seeds.flatMap((seed) => {
    const picker = new QuestionPicker({ templates: [t], rng: createRng(seed) });
    return Array.from({ length: per }, () => picker.next());
  });
const sideOf = (q) => Number(q.question.match(/1辺(\d+)cm/)[1]);

describe('長さ・角度・三角形の数学', () => {
  it('面の対角線 = 1辺×√2、立方体の対角線 = 1辺×√3（√8 と 2√2 は同じ数）', () => {
    expect(distance3D(P.A, P.C).eq(faceDiagonalLength(2))).toBe(true);
    expect(distance3D(P.A, P.G).eq(spaceDiagonalLength(2))).toBe(true);
    expect(distance3D(P.A, P.C).key()).toBe(Surd.sqrt(8).key());
    expect(faceDiagonalLength(4).format('cm')).toBe('4√2cm');
    expect(spaceDiagonalLength(4).format('cm')).toBe('4√3cm');
  });

  it('頂点の2つの組28本のうち、辺12・面の対角線12・立方体の対角線4', () => {
    const segs = allVertexSegments();
    expect(segs).toHaveLength(28);
    const count = (k) => segs.filter((s) => s.kind === k).length;
    expect([count('edge'), count('faceDiagonal'), count('spaceDiagonal')]).toEqual([12, 12, 4]);
    expect(segs.filter((s) => s.kind === 'spaceDiagonal').map((s) => s.id)).toEqual(['AG', 'BH', 'CE', 'DF']);
  });

  it('三角形：AFH は正三角形（面積 2√3）、ABC は直角二等辺三角形、ABG は直角三角形', () => {
    expect(classifyTriangle(P.A, P.F, P.H).name).toBe('正三角形');
    expect(triangleArea3D(P.A, P.F, P.H).format()).toBe('2√3');
    expect(classifyTriangle(P.A, P.B, P.C)).toMatchObject({ name: '直角二等辺三角形', rightAt: 1 });
    expect(classifyTriangle(P.A, P.B, P.G)).toMatchObject({ name: '直角三角形', rightAt: 1 });
    expect(classifyTriangle(P.A, [0, 1, 1], P.B)).toBeNull(); // 一直線
  });

  it('角度：∠FAH = 60°、∠CAB = 45°、∠BAD = 90°、きりのよくない角は null（近い値で決めない）', () => {
    expect(angleAt(P.A, P.F, P.H).degrees).toBe(60);
    expect(angleAt(P.A, P.C, P.B).degrees).toBe(45);
    expect(angleAt(P.A, P.B, P.D).degrees).toBe(90);
    expect(angleBetweenVectors([1, 0, 0], [-1, 1, 0]).degrees).toBe(135);
    const odd = angleAt(P.A, P.G, P.B);
    expect(odd.degrees).toBeNull();
    expect(odd.approx).toBeCloseTo(54.7356, 3);
  });

  it('立方体を回転しても、長さ・角度・面積は変わらない（24通り）', () => {
    for (const m of CUBE_ROTATIONS) {
      const [a, f, h] = [P.A, P.F, P.H].map((p) => rotatePoint(m, p));
      expect(triangleArea3D(a, f, h).format()).toBe('2√3');
      expect(angleAt(a, f, h).degrees).toBe(60);
      expect(distance3D(a, rotatePoint(m, P.G)).eq(spaceDiagonalLength(2))).toBe(true);
    }
  });
});

describe('長さ・角度の問題（G01〜G06）', () => {
  it('どの問題も正しい形で、選択肢に同じ値がない', () => {
    for (const t of GEOMETRY_TEMPLATES) {
      for (const q of questions(t, [3, 8], 3)) {
        expect(getQuestionErrors(q), q.key).toEqual([]);
        expect(new Set(q.choices.map((c) => c.label)).size).toBe(q.choices.length);
      }
    }
  });

  it('G01・G02：正解の線分は、面の対角線・立方体の対角線だけ（答えの線分を 3D で緑にする）', () => {
    const kind = Object.fromEntries(allVertexSegments().map((s) => [s.id, s.kind]));
    for (const [id, k] of [
      ['G01', 'faceDiagonal'],
      ['G02', 'spaceDiagonal'],
    ]) {
      for (const q of questions(byId[id])) {
        // 「面〇〇の対角線」は、その面の対角線だけが正解（ほかの面の対角線はまちがい）
        const face = q.question.match(/^面([A-H]{4})の/)?.[1];
        const ok = (id) => kind[id] === k && (!face || id.split('').every((v) => face.includes(v)));
        for (const c of q.choices) expect(q.correctAnswers.includes(c.id), q.key).toBe(ok(c.id));
        expect(q.scene.metric.answerSegments).toHaveLength(q.correctAnswers.length);
      }
    }
  });

  it('G03：長さ ＝ 1辺×√2（面の対角線）か 1辺×√3（立方体の対角線）。直角三角形を順に示す', () => {
    for (const q of questions(byId.G03)) {
      const s = sideOf(q);
      const r = q.question.includes('面の対角線') ? 2 : 3;
      expect(q.choices.find((c) => c.id === q.correctAnswers[0]).label).toBe(new Surd(s, r).format('cm'));
      expect(q.scene.metric.triangles).toHaveLength(r === 2 ? 1 : 2);
      for (const t of q.scene.metric.triangles) expect(classifyTriangle(...t.points).rightAt).toBe(t.rightAt);
    }
  });

  it('G04：答えは三角形の形の分類と一致する（4つの選択肢はどれも重ならない分類）', () => {
    const map = { equilateral: '正三角形', rightIsosceles: '直角二等辺三角形', right: '直角三角形', isosceles: '二等辺三角形' };
    const seen = new Set();
    for (const q of questions(byId.G04, [1, 2, 3, 4, 5, 6], 5)) {
      expect(classifyTriangle(...q.scene.metric.triangles[0].points).name).toBe(map[q.correctAnswers[0]]);
      seen.add(q.correctAnswers[0]);
    }
    expect(seen.size).toBe(4);
  });

  it('G05：角の大きさは内積から求めた角と一致し、45°・60°・90° が出る', () => {
    const seen = new Set();
    for (const q of questions(byId.G05, [1, 2, 3, 4, 5, 6], 5)) {
      const { at, a, b } = q.scene.metric.angle;
      const deg = angleAt(at, a, b).degrees;
      expect(q.correctAnswers).toEqual([`deg${deg}`]);
      seen.add(deg);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([45, 60, 90]);
  });

  it('G06：面積（形の公式）＝ 外積から求めた面積 ×（1辺÷2）²', () => {
    for (const q of questions(byId.G06)) {
      const s = sideOf(q);
      const pts = q.scene.metric.triangles[0].points;
      const area = triangleArea3D(...pts).scale(new Q(s * s, 4));
      expect(q.choices.find((c) => c.id === q.correctAnswers[0]).label).toBe(area.format('cm²'));
      expect(q.explanation.text).toContain(area.format('cm²'));
    }
    // 正三角形 AFH（1辺6cm の立方体）は 18√3cm²
    const res = triangleAreaByFormula([P.A, P.F, P.H].map((position) => ({ position })), new Q(3));
    expect(res.area.format('cm²')).toBe('18√3cm²');
  });
});

describe('長さ・角度の 3D モデルと演出', () => {
  function setup(q) {
    const model = createCubeModel({ labels: false });
    const state = createOrientationState(model.root);
    const highlights = createHighlightManager(model);
    const metric = createCubeMetricModel({ cubeRoot: model.root, labels: false, onInfo: vi.fn() });
    metric.set(q.scene.metric, { view: q.scene.cameraPreset });
    const manager = new AnimationManager({ inputLock: new InputLock() });
    const controls = { setHomeDirection: vi.fn(), resetCamera: vi.fn(), getViewDirection: () => [4, 3, 5], setViewDirection: vi.fn() };
    return { model, state, highlights, metric, manager, controls };
  }

  it('三角形を取り出すと、形・大きさは変わらず、カメラの正面を向く。リプレイで立方体の中に戻る', async () => {
    for (const q of [...questions(byId.G06, [2], 2), ...questions(byId.G04, [5], 2)]) {
      const { state, highlights, metric, manager, controls } = setup(q);
      const before = metric.getTrianglePoints(0).map((p) => new THREE.Vector3(...p));
      const done = manager.play(createQuestionReveal({ state, controls, highlights, metric }, { steps: q.explanation.reveal.steps }));
      for (let t = 0; manager.isActive() && t < 60000; t += 50) manager.tick(t);
      await done;
      const after = metric.getTrianglePoints(0).map((p) => new THREE.Vector3(...p));
      const sides = (pts) => [0, 1, 2].map((i) => pts[i].distanceTo(pts[(i + 1) % 3]));
      sides(after).forEach((d, i) => expect(d).toBeCloseTo(sides(before)[i], 9));
      expect(metric.getExtractFacing()).toBeCloseTo(1, 6);
      expect(metric.getState()).toMatchObject({ extract: 1, cubeVisible: false });
      expect(metric.getState().info).not.toBe('');
      const again = manager.play(createQuestionReveal({ state, controls, highlights, metric }, { steps: q.explanation.reveal.steps }));
      expect(metric.getState()).toMatchObject({ extract: 0, cubeVisible: true, info: '' });
      manager.skip();
      await again;
      metric.dispose();
    }
  });

  it('G05：角の弧と補助の三角形が現れ、角の大きさを表示する。G01：答えの線分が緑で現れる', async () => {
    const [q] = questions(byId.G05, [3], 1);
    const { state, highlights, metric, manager, controls } = setup(q);
    manager.play(createQuestionReveal({ state, controls, highlights, metric }, { steps: q.explanation.reveal.steps }));
    manager.skip();
    expect(metric.getState()).toMatchObject({ angle: 1, triangles: [1], extract: 1 });
    expect(metric.getState().info).toMatch(/°/);
    metric.dispose();
    const [g1] = questions(byId.G01, [1], 1);
    const m2 = setup(g1);
    m2.manager.play(createQuestionReveal({ state: m2.state, controls: m2.controls, highlights: m2.highlights, metric: m2.metric }, { steps: g1.explanation.reveal.steps }));
    m2.manager.skip();
    expect(m2.metric.getState().answersVisible).toBe(g1.correctAnswers.length);
    m2.metric.dispose();
  });
});

export { triangleSideLengths };
