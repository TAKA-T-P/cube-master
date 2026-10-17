// 立方体の切断（Phase 7）：正確な数（有理数・√）、切断の数学エンジン、K01〜K06 の問題、3D の切断モデルと演出
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Q, qvec, vToNumbers } from '../src/core/rational.js';
import { Surd, SurdSum, splitSquare } from '../src/core/surd.js';
import {
  planeFromThreePoints,
  intersectPlaneWithSegment,
  intersectPlaneWithCube,
  orderSectionVertices,
  classifySectionPolygon,
  calculateSectionArea,
  splitCubeByPlane,
  classifyPiece,
  isConvexPlanarPolygon,
  planeSide,
  describeEdgePoint,
  polyhedronVolume,
  tetrahedronVolume,
} from '../src/core/cubeCutting.js';
import { VERTICES } from '../src/core/cubeConstants.js';
import { CUTTING_TEMPLATES, allCuts, getSplit, sectionShape2D, similarShapes, sectionAreaByFormula, pieceVolumeByFormula } from '../src/questions/cubeCutting/cubeCuttingGenerators.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { QuestionPicker } from '../src/core/questionEngine.js';
import { createRng } from '../src/utils/random.js';
import { createCuttingModel, SPLIT_GAP } from '../src/three/cubeCuttingModel.js';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { AnimationManager } from '../src/three/animationManager.js';
import { createOrientationState, createQuestionReveal } from '../src/three/cubeRotationAnimations.js';
import { InputLock } from '../src/core/inputLock.js';

const pos = Object.fromEntries(VERTICES.map((v) => [v.id, v.position]));
const mid = (e) => pos[e[0]].map((x, i) => (x + pos[e[1]][i]) / 2);
const cut = (...pts) => {
  const plane = planeFromThreePoints(...pts);
  const section = intersectPlaneWithCube(plane);
  return { plane, section, shape: classifySectionPolygon(section), area: calculateSectionArea(section), split: splitCubeByPlane(plane) };
};
const byId = Object.fromEntries(CUTTING_TEMPLATES.map((t) => [t.id, t]));
const questions = (t, seeds = [1, 2, 3, 4, 5, 6], per = 5) =>
  seeds.flatMap((seed) => {
    const picker = new QuestionPicker({ templates: [t], rng: createRng(seed) });
    return Array.from({ length: per }, () => picker.next());
  });

describe('正確な数（有理数・√）', () => {
  it('有理数は約分され、-0 にならない。0 で割るとエラー', () => {
    expect(new Q(6, -8).toString()).toBe('-3/4');
    expect(Object.is(new Q(0, -5).n, 0)).toBe(true);
    expect(new Q(1, 3).add(new Q(1, 6)).toString()).toBe('1/2');
    expect(() => new Q(1, 2).div(0)).toThrow();
  });

  it('√8 と 2√2 は同じ数・同じ表示になる。√(9/2) = 3√2/2', () => {
    expect(splitSquare(72)).toEqual({ a: 6, r: 2 });
    expect(Surd.sqrt(8).eq(new Surd(2, 2))).toBe(true);
    expect(Surd.sqrt(8).key()).toBe(new Surd(2, 2).key());
    expect(new Surd(1, 8).format('cm')).toBe('2√2cm');
    expect(Surd.sqrt(new Q(9, 2)).format()).toBe('3√2/2');
    expect(new Surd(2, 3).mul(new Surd(1, 3)).format()).toBe('6');
    expect(new Surd(1, 2).add(new Surd(1, 3))).toBeNull();
    expect(new Surd(3, 2).cmp(new Surd(2, 3))).toBe(1); // √18 > √12
  });

  it('√ の和は、√ の中身ごとの係数で正確に比べる（1＋√2 と √2＋1 は同じ）', () => {
    const a = new SurdSum([new Surd(1), Surd.sqrt(2)]);
    const b = new SurdSum([Surd.sqrt(8).scale(new Q(1, 2)), new Surd(1)]);
    expect(a.eq(b)).toBe(true);
    expect(a.format('cm')).toBe('(1＋√2)cm');
    expect(new SurdSum([Surd.sqrt(5)]).cmp(a)).toBe(-1);
    expect(new SurdSum([Surd.sqrt(20)]).asSurd().format()).toBe('2√5');
  });
});

describe('切断の数学エンジン', () => {
  it('3点を通る平面（法線 = (P2−P1)×(P3−P1)）。一直線上の3点は無効', () => {
    const plane = planeFromThreePoints(pos.B, pos.D, pos.E);
    for (const p of [pos.B, pos.D, pos.E]) expect(planeSide(plane, p).isZero()).toBe(true);
    expect(planeFromThreePoints(pos.A, mid('AB'), pos.B)).toBeNull();
  });

  it('線分と平面の交わり：1点・交わらない・線分全体が平面の上', () => {
    const plane = planeFromThreePoints(pos.B, pos.D, pos.E);
    const r = intersectPlaneWithSegment(plane, pos.A, pos.B);
    expect(r.kind).toBe('point');
    expect(vToNumbers(r.points[0])).toEqual(pos.B);
    expect(intersectPlaneWithSegment(plane, pos.C, pos.G).kind).toBe('none');
    const face = planeFromThreePoints(pos.A, pos.B, pos.G);
    expect(intersectPlaneWithSegment(face, pos.A, pos.B).kind).toBe('segment');
    expect(vToNumbers(intersectPlaneWithSegment(planeFromThreePoints(mid('AB'), mid('BC'), mid('BF')), pos.B, pos.F).points[0])).toEqual(mid('BF'));
  });

  it('よく知られた切り口：形・面積・2つの立体の体積（一辺 2）', () => {
    const tri = cut(pos.B, pos.D, pos.E);
    expect(tri.shape.name).toBe('正三角形');
    expect(tri.area.format()).toBe('2√3'); // 1辺 2√2 の正三角形
    expect(tri.split.pieces.map((p) => p.volume.toString()).sort()).toEqual(['20/3', '4/3']);
    const hex = cut(mid('AB'), mid('CG'), mid('EH'));
    expect(hex.shape.name).toBe('正六角形');
    expect(hex.area.format()).toBe('3√3');
    const rect = cut(pos.A, pos.B, pos.G);
    expect(rect.shape.name).toBe('長方形');
    expect(rect.area.format()).toBe('4√2');
    expect(rect.split.pieces.map((p) => classifyPiece(p, rect.plane).kind)).toEqual(['triangularPrism', 'triangularPrism']);
    const rhombus = cut(pos.A, mid('BF'), pos.G);
    expect(rhombus.shape.name).toBe('ひし形');
    expect(rhombus.area.format()).toBe('2√6');
    expect(cut(mid('AB'), mid('BC'), pos.H).shape.sides).toBe(5);
    const corner = cut(mid('AB'), mid('AD'), mid('AE'));
    const small = corner.split.pieces.find((p) => p.cubeVertices.length === 1);
    expect(small.volume.toString()).toBe('1/6');
    expect(classifyPiece(small, corner.plane)).toMatchObject({ kind: 'tetrahedron', apex: 'A' });
  });

  it('平面が立方体を切らない（面にそう・頂点や辺だけにふれる）ときは切り口なし', () => {
    expect(intersectPlaneWithCube(planeFromThreePoints(pos.A, pos.B, pos.C)).valid).toBe(false);
    expect(intersectPlaneWithCube(planeFromThreePoints(pos.A, [-1, 3, 1], [-1, 1, 5])).valid).toBe(false);
  });

  it('頂点・辺の中点から選んだすべての3点：切り口は3〜6角形の凸多角形で、表面の上にあり、面の数＝辺の数。2つの立体の体積の和は8', () => {
    const cuts = allCuts();
    expect(cuts.length).toBeGreaterThan(700);
    for (const c of cuts) {
      const pts = c.section.polygon.map((v) => v.position);
      expect(pts.length >= 3 && pts.length <= 6, c.key).toBe(true);
      expect(isConvexPlanarPolygon(pts, c.plane), c.key).toBe(true);
      for (const p of pts) {
        const xs = vToNumbers(p);
        expect(xs.every((x) => Math.abs(x) <= 1) && xs.some((x) => Math.abs(x) === 1), c.key).toBe(true);
      }
      expect(new Set(c.section.faces).size, c.key).toBe(pts.length);
      // 問題の3点は切り口の上
      for (const p of c.points) expect(planeSide(c.plane, p.position).isZero()).toBe(true);
      expect(c.area2.eq(calculateSectionArea(c.section).square()), c.key).toBe(true);
    }
    for (const c of cuts.filter((_, i) => i % 3 === 0)) {
      const { pieces } = getSplit(c);
      expect(pieces[0].volume.add(pieces[1].volume).eq(8), c.key).toBe(true);
      expect(pieces.every((p) => p.volume.sign() > 0), c.key).toBe(true);
      // 2つの立体は切り口を共有し、それぞれ平面の片側にある（すき間・重なりがない）
      for (const p of pieces) for (const v of p.vertices) expect(planeSide(c.plane, v).mul(p.side).sign() >= 0).toBe(true);
    }
  });

  it('頂点の並べ方は一周する順（どこから始めても同じ多角形）', () => {
    const { section, plane } = cut(mid('AB'), mid('CG'), mid('EH'));
    const shuffled = [...section.polygon].reverse();
    const again = orderSectionVertices(shuffled, plane);
    expect(isConvexPlanarPolygon(again.map((v) => v.position), plane)).toBe(true);
  });

  it('多面体の体積：立方体そのもの = 8、四面体の公式 |det|/6', () => {
    const cube = splitCubeByPlane(planeFromThreePoints(pos.B, pos.D, pos.E)).pieces;
    expect(polyhedronVolume([...cube[0].faces.filter((f) => f.id !== 'section'), ...cube[1].faces.filter((f) => f.id !== 'section')]).toNumber()).toBeGreaterThan(0);
    expect(tetrahedronVolume(pos.A, pos.B, pos.D, pos.E).toString()).toBe('4/3');
  });

  it('辺の上の点の位置（中点・「C側から1:2」）', () => {
    expect(describeEdgePoint(qvec(mid('CG')), 'CG')).toEqual({ kind: 'midpoint', edge: 'CG' });
    expect(describeEdgePoint([Q.of(1), new Q(1, 3), Q.of(-1)], 'CG')).toEqual({ kind: 'ratio', edge: 'CG', from: 'C', ratio: [1, 2] });
  });
});

describe('切断の問題（K01〜K06）', () => {
  it('どの問題も正しい形で、正解は数学エンジンの計算と一致する', () => {
    for (const q of questions(byId.K01)) {
      expect(getQuestionErrors(q)).toEqual([]);
      const plane = planeFromThreePoints(...q.scene.cutting.points.map((p) => p.position));
      expect(q.correctAnswers).toEqual([`n${intersectPlaneWithCube(plane).polygon.length}`]);
    }
  });

  it('K02：P・Q・R のほかに切り口の頂点がある辺（複数回答）。辺を選択肢にし、解説で緑に光らせる', () => {
    for (const q of questions(byId.K02)) {
      expect(q.type).toBe('multiple');
      const plane = planeFromThreePoints(...q.scene.cutting.points.map((p) => p.position));
      const { polygon } = intersectPlaneWithCube(plane);
      const given = q.scene.cutting.points.map((p) => p.id);
      const expected = polygon.map((v) => v.edges[0]).filter((e) => !given.includes(e));
      expect([...q.correctAnswers].sort()).toEqual([...expected].sort());
      expect(q.explanation.highlightElements).toEqual(q.correctAnswers);
      expect(polygon.every((v) => !v.vertex)).toBe(true); // 頂点を通らない（あいまいにならない）
      for (const c of q.choices) expect(given).not.toContain(c.id);
    }
  });

  it('K03：正しい図は切り口と同じ形、まちがいの図はどれも相似でない', () => {
    for (const q of questions(byId.K03)) {
      const plane = planeFromThreePoints(...q.scene.cutting.points.map((p) => p.position));
      const record = allCuts().find((c) => c.plane.normal.join() === plane.normal.join() && c.plane.d.eq(plane.d));
      const truth = sectionShape2D(record);
      const correct = q.choices.find((c) => c.id === 'fig0').visual.points;
      expect(similarShapes(truth, correct)).toBe(true);
      for (const c of q.choices.filter((x) => x.id !== 'fig0')) expect(similarShapes(correct, c.visual.points), q.key).toBe(false);
    }
  });

  it('K04：答えより広い名前（正方形に対する長方形など）は選択肢に入れない', () => {
    for (const q of questions(byId.K04)) {
      const answer = q.choices.find((c) => c.id === q.correctAnswers[0]).label;
      const labels = q.choices.map((c) => c.label);
      if (answer === '正方形') expect(labels).not.toContain('長方形');
      if (answer === '正三角形') expect(labels).not.toContain('二等辺三角形');
      if (answer === '長方形' || answer === 'ひし形') expect(labels).not.toContain('平行四辺形');
    }
  });

  it('K05：面積（公式の計算）＝ 座標から求めた面積 × (1辺÷2)²。選択肢は同じ値が重ならない（√8 と 2√2 など）', () => {
    for (const q of questions(byId.K05)) {
      const s = Number(q.question.match(/1辺(\d+)cm/)[1]);
      const plane = planeFromThreePoints(...q.scene.cutting.points.map((p) => p.position));
      const area = calculateSectionArea(intersectPlaneWithCube(plane)).scale(new Q(s * s, 4));
      expect(q.choices.find((c) => c.id === q.correctAnswers[0]).label).toBe(area.format('cm²'));
      expect(new Set(q.choices.map((c) => c.id)).size).toBe(4);
      expect(q.explanation.text).toContain(area.format('cm²'));
    }
    // 公式で求められる切り口は、どれも座標の計算と一致する
    let checked = 0;
    for (const c of allCuts()) {
      const res = sectionAreaByFormula(c, new Q(1));
      if (res) {
        expect(res.area.square().eq(c.area2)).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('K06：小さいほうの立体の体積＝ 座標から求めた体積 × (1辺÷2)³。大きいほうとの和は立方体の体積', () => {
    for (const q of questions(byId.K06)) {
      const s = Number(q.question.match(/1辺(\d+)cm/)[1]);
      const plane = planeFromThreePoints(...q.scene.cutting.points.map((p) => p.position));
      const { pieces } = splitCubeByPlane(plane);
      const small = pieces[0].volume.cmp(pieces[1].volume) < 0 ? pieces[0] : pieces[1];
      const v = small.volume.mul(new Q(s * s * s, 8));
      expect(v.isInteger()).toBe(true);
      expect(q.choices.find((c) => c.id === q.correctAnswers[0]).label).toBe(`${v}cm³`);
      expect(q.explanation.text).toContain(`${s ** 3}−${v}＝${s ** 3 - v.toNumber()}`);
    }
  });

  it('同じ平面の3点でも、問題文の点と 3D の点は同じ（回答前の 3D は点だけで、切り口の情報を持たない）', () => {
    for (const t of CUTTING_TEMPLATES) {
      const [q] = questions(t, [9], 1);
      expect(Object.keys(q.scene.cutting)).toEqual(['points']);
      for (const p of q.scene.cutting.points) if (p.label) expect(q.question).toContain(p.label);
    }
  });
});

describe('切断の 3D モデルと演出', () => {
  function setup() {
    const model = createCubeModel({ labels: false });
    const state = createOrientationState(model.root);
    const highlights = createHighlightManager(model);
    const cutting = createCuttingModel({ cubeRoot: model.root, labels: false });
    const manager = new AnimationManager({ inputLock: new InputLock() });
    const controls = { setHomeDirection: vi.fn(), resetCamera: vi.fn(), getViewDirection: () => [4, 3, 5], setViewDirection: vi.fn() };
    return { model, state, highlights, cutting, manager, controls };
  }
  const run = (manager) => {
    for (let t = 0; manager.isActive() && t < 60000; t += 50) manager.tick(t);
  };
  const spec = { points: [{ label: null, position: pos.B }, { label: null, position: pos.D }, { label: 'P', position: mid('AE') }] };

  it('切り口のメッシュは、数学エンジンの切り口の頂点だけで作る', () => {
    const { cutting } = setup();
    cutting.set(spec);
    const plane = planeFromThreePoints(pos.B, pos.D, mid('AE'));
    const truth = intersectPlaneWithCube(plane).polygon.map((v) => vToNumbers(v.position));
    expect(cutting.getSectionPoints()).toEqual(truth);
    const meshPts = cutting.getSectionMeshPositions();
    for (let i = 0; i < meshPts.length; i += 3) {
      const p = meshPts.slice(i, i + 3);
      expect(truth.some((t) => t.every((x, k) => Math.abs(x - p[k]) < 1e-6))).toBe(true);
    }
    expect(cutting.getState()).toMatchObject({ active: true, plane: 0, section: 0, split: 0, planeVisible: false, sectionVisible: false, markerCount: 3 });
  });

  it('刃（平面の板）は上から振り下ろされ、通ったところから切り口が上から順に現れる（切り口の平面の上）', () => {
    const { cutting } = setup();
    cutting.set(spec);
    const plane = planeFromThreePoints(pos.B, pos.D, mid('AE'));
    const n = new THREE.Vector3(...vToNumbers(plane.normal)).normalize();
    const d = n.dot(new THREE.Vector3(...pos.B));
    const heights = [];
    let lastLow = Infinity;
    for (const t of [0.15, 0.4, 0.7, 0.9, 1]) {
      cutting.setPlane(t);
      heights.push(cutting.getPlanePosition()[1]);
      const pts = cutting.getSectionMeshPositions({ full: false });
      // 表示している切り口は、いつも本当の切り口の平面の上
      for (let i = 0; i < pts.length; i += 3) expect(Math.abs(n.dot(new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2])) - d)).toBeLessThan(1e-6);
      // 下の部分ほどあとから現れる：表示している部分の一番下は、だんだん下がる
      const ys = pts.filter((_, i) => i % 3 === 1);
      if (ys.length) {
        const low = Math.min(...ys);
        expect(low).toBeLessThanOrEqual(lastLow + 1e-9);
        lastLow = low;
      }
    }
    // 刃は上から下へ動き、最後は切り口の位置
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThan(heights[i - 1]);
    expect(cutting.getSectionMeshPositions({ full: false })).toEqual(cutting.getSectionMeshPositions());
    cutting.dispose();
  });

  it('演出：平面 → 切り口 → 2つに分かれる（小さいほうをはなす）。リプレイで初めから、スキップで最終状態', async () => {
    const { model, state, highlights, cutting, manager, controls } = setup();
    cutting.set(spec);
    const steps = [{ type: 'cutPlane' }, { type: 'cutSection' }, { type: 'cutSplit', to: 1, highlightSmall: true, label: '18cm³' }];
    let done = manager.play(createQuestionReveal({ state, controls, highlights, cutting }, { steps }));
    run(manager);
    await done;
    let s = cutting.getState();
    expect(s).toMatchObject({ plane: 1, section: 1, split: 1, cubeVisible: false, highlightSmall: true, value: '18cm³' });
    expect(s.piecesVisible).toEqual([true, true]);
    const small = s.volumes.map((v) => new Q(...v.split('/').map(Number)).toNumber());
    expect(small[s.movingIndex]).toBeLessThan(small[1 - s.movingIndex]);
    expect(new THREE.Vector3(...s.movingOffset).length()).toBeCloseTo(SPLIT_GAP, 6);
    // リプレイ：はじめ（点だけ）の状態から
    done = manager.play(createQuestionReveal({ state, controls, highlights, cutting }, { steps }));
    manager.tick(0);
    s = cutting.getState();
    expect(s).toMatchObject({ split: 0, section: 0, cubeVisible: true, highlightSmall: false });
    manager.skip();
    await done;
    expect(cutting.getState()).toMatchObject({ split: 1, cubeVisible: false });
    // 次の問題（null）で消え、立方体は表示に戻る
    cutting.set(null);
    expect(cutting.getState().visible).toBe(false);
    expect(model.root.visible).toBe(true);
    cutting.dispose();
  });
});
