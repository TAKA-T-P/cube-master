// 立方体の表面の最短経路（Phase 7）：部分展開・最短経路の数学エンジン、S01〜S06 の問題、3D の道と展開の演出
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Q, qvec, vToNumbers } from '../src/core/rational.js';
import { Surd } from '../src/core/surd.js';
import { unfoldFaces, unfoldedFaceCorners, sharedEdge, adjacentFaces, isOnCubeSurface, facesOfPoint } from '../src/core/cubeSurfaceUnfolding.js';
import { enumerateFacePaths, validateUnfoldedPath, findShortestSurfacePaths, calculatePathLength, isSurfacePolyline, bentPath } from '../src/core/cubeSurfacePath.js';
import { VERTICES, EDGES } from '../src/core/cubeConstants.js';
import { SURFACE_PATH_TEMPLATES, basePairs, candidatePaths } from '../src/questions/surfacePath/surfacePathGenerators.js';
import { CUBE_ROTATIONS, rotatePoint, VERTEX_POINTS, MIDPOINTS, FACE_CENTERS } from '../src/questions/surfacePoints.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { QuestionPicker } from '../src/core/questionEngine.js';
import { createRng } from '../src/utils/random.js';
import { createSurfacePathModel } from '../src/three/surfacePathModel.js';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { AnimationManager } from '../src/three/animationManager.js';
import { createOrientationState, createQuestionReveal } from '../src/three/cubeRotationAnimations.js';
import { InputLock } from '../src/core/inputLock.js';

const pos = Object.fromEntries(VERTICES.map((v) => [v.id, v.position]));
const byId = Object.fromEntries(SURFACE_PATH_TEMPLATES.map((t) => [t.id, t]));
const questions = (t, seeds = [1, 2, 3, 4, 5], per = 4) =>
  seeds.flatMap((seed) => {
    const picker = new QuestionPicker({ templates: [t], rng: createRng(seed) });
    return Array.from({ length: per }, () => picker.next());
  });

/** 小数で、2面を通る道の最短を調べる（共通の辺の上の点を細かく動かす） */
function numericTwoFace(p, q, edgeId) {
  const [a, b] = EDGES.find((e) => e.id === edgeId).vertices.map((id) => new THREE.Vector3(...pos[id]));
  const P = new THREE.Vector3(...p);
  const Qv = new THREE.Vector3(...q);
  const f = (s) => {
    const x = a.clone().lerp(b, s);
    return P.distanceTo(x) + x.distanceTo(Qv);
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2;
    else lo = m1;
  }
  return Math.min(f((lo + hi) / 2), f(0), f(1));
}

describe('部分展開（一部の面だけを広げる）', () => {
  it('となり合う面・共通の辺', () => {
    expect(adjacentFaces('ABCD').sort()).toEqual(['ABFE', 'BCGF', 'CDHG', 'DAEH']);
    expect(sharedEdge('ABCD', 'BCGF')).toBe('BC');
    expect(sharedEdge('ABCD', 'EFGH')).toBeNull();
  });

  it('広げた面はどれも1辺2の正方形で、となりの面と共通の辺がぴったり重なる（座標は正確な有理数）', () => {
    for (const path of [['ABCD', 'BCGF', 'EFGH'], ['ABFE', 'BCGF', 'CDHG', 'DAEH'], ['DAEH', 'ABCD', 'BCGF']]) {
      const u = unfoldFaces(path);
      path.forEach((_, k) => {
        const c = unfoldedFaceCorners(u, k).map((x) => x.at);
        for (let i = 0; i < 4; i++) {
          const a = c[i];
          const b = c[(i + 1) % 4];
          expect(a[0].sub(b[0]).mul(a[0].sub(b[0])).add(a[1].sub(b[1]).mul(a[1].sub(b[1]))).eq(4)).toBe(true);
        }
        if (k > 0) {
          const edge = sharedEdge(path[k - 1], path[k]);
          for (const id of EDGES.find((e) => e.id === edge).vertices) {
            const p = qvec(pos[id]);
            expect(u.toPlane(p, k).map(String)).toEqual(u.toPlane(p, k - 1).map(String));
          }
        }
        // 広げたあとの面は、はじめの面と同じ平面の上
        for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
          const face = path[k];
          if (!face.includes(id)) continue;
          const x = u.to3D(qvec(pos[id]), k);
          expect(x[1].toNumber()).toBe(path[0] === 'ABCD' ? 1 : x[1].toNumber());
        }
      });
    }
  });

  it('表面の点・面の判定（保存した小数の座標でも）', () => {
    expect(isOnCubeSurface([0, 1, 0])).toBe(true);
    expect(isOnCubeSurface([0, 0.5, 0])).toBe(false);
    expect(isOnCubeSurface([1 / 3, 1, -1])).toBe(true);
    expect(facesOfPoint(pos.A).sort()).toEqual(['ABCD', 'ABFE', 'DAEH']);
    expect(isSurfacePolyline([pos.A, [1, 1, 0], pos.G])).toBe(true);
    expect(isSurfacePolyline([pos.A, pos.G])).toBe(false); // 立方体の内部を通る
  });
});

describe('最短経路の数学エンジン', () => {
  it('頂点Aから頂点G：長さ 2√5（一辺 2）の最短経路が6本', () => {
    const r = findShortestSurfacePaths(pos.A, pos.G);
    expect(r.length.format()).toBe('2√5');
    expect(r.shortest).toHaveLength(6);
    expect(new Set(r.shortest.map((x) => x.faces.join())).size).toBe(6);
    // 6本とも、共通の辺の中点を通る
    for (const s of r.shortest) expect(vToNumbers(s.polyline[1]).filter((x) => x === 0)).toHaveLength(1);
  });

  it('向かい合う面の中心どうし：3面を通る長さ4の道が4本。2面だけの道はない', () => {
    const r = findShortestSurfacePaths([0, 1, 0], [0, -1, 0]);
    expect(r.length.format()).toBe('4');
    expect(r.shortest).toHaveLength(4);
    expect(r.shortest.every((s) => s.faces.length === 3)).toBe(true);
    expect(r.all.some((x) => x.faces.length === 2)).toBe(false);
  });

  it('頂点Aから辺CGの中点：√13（広げると、たて2・よこ3の直角三角形の斜辺）', () => {
    const r = findShortestSurfacePaths(pos.A, [1, 0, -1]);
    expect(r.length.format()).toBe('√13');
    const d = r.shortest[0].plane;
    const legs = [d.q[0].sub(d.p[0]).abs().toNumber(), d.q[1].sub(d.p[1]).abs().toNumber()].sort();
    expect(legs).toEqual([2, 3]);
  });

  it('成り立たない展開（直線が共通の辺の外を通る）は除く', () => {
    // 頂点Aから頂点G へ、上の面 → 左の面 → 後ろの面…のような遠回りの並びは、直線が辺の外を通る
    const bad = enumerateFacePaths('ABCD', 'BCGF', 4).filter((fp) => fp.length === 4);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.some((fp) => !validateUnfoldedPath(pos.A, pos.G, fp).valid)).toBe(true);
  });

  it('どの点の組でも：最短の長さは、2面を通る道を小数で細かく調べた最小値以下で、同じ面の並びでは一致する', () => {
    const pts = [...VERTEX_POINTS, ...MIDPOINTS, ...FACE_CENTERS];
    let checked = 0;
    for (let i = 0; i < pts.length; i += 2) {
      for (let j = 1; j < pts.length; j += 3) {
        const p = pts[i].position;
        const q = pts[j].position;
        const fp = facesOfPoint(p);
        if (i === j || facesOfPoint(q).some((f) => fp.includes(f))) continue;
        const r = findShortestSurfacePaths(p, q);
        for (const path of r.all.filter((x) => x.faces.length === 2)) {
          const numeric = numericTwoFace(p, q, sharedEdge(path.faces[0], path.faces[1]));
          expect(path.length.toNumber()).toBeCloseTo(numeric, 6);
        }
        // どの道も表面の上で、長さ（折れ線の長さ）は展開した直線の長さと同じ
        for (const path of r.all) {
          expect(isSurfacePolyline(path.polyline)).toBe(true);
          expect(calculatePathLength(path.polyline).eq(path.length)).toBe(true);
          expect(path.length2.cmp(r.length2)).toBeGreaterThanOrEqual(0);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('立方体を回転しても、最短の長さ・本数は変わらない', () => {
    const rng = createRng(5);
    for (const pair of basePairs().filter((_, i) => i % 4 === 0)) {
      const m = CUBE_ROTATIONS[Math.floor(rng() * 24)];
      const r = findShortestSurfacePaths(rotatePoint(m, pair.p.position), rotatePoint(m, pair.q.position));
      expect(r.length.eq(pair.res.length)).toBe(true);
      expect(r.shortest).toHaveLength(pair.res.shortest.length);
    }
    expect(CUBE_ROTATIONS).toHaveLength(24);
  });

  it('折れ曲がった道は、同じ面を通るまっすぐな道より長い', () => {
    const r = findShortestSurfacePaths(pos.A, [1, 0, -1]);
    const s = r.shortest[0];
    const b = bentPath(pos.A, [1, 0, -1], s.faces, [EDGES.find((e) => e.id === sharedEdge(s.faces[0], s.faces[1])).vertices.map((id) => pos[id])[0]]);
    expect(b.length.cmp(s.length)).toBe(1);
  });
});

describe('最短経路の問題（S01〜S06）', () => {
  it('どの問題も正しい形（道はどれも表面の上・正解の道は解説の長さと一致）', () => {
    for (const t of SURFACE_PATH_TEMPLATES) for (const q of questions(t, [3, 8], 3)) expect(getQuestionErrors(q), q.key).toEqual([]);
  });

  it('S01：正解の道だけが最短で、ほかの候補はどれも長い（候補は色つき・ア〜エの順）', () => {
    for (const q of questions(byId.S01)) {
      const sp = q.scene.surfacePath;
      const [p, qq] = sp.points.map((x) => x.position);
      const min = findShortestSurfacePaths(p, qq).length.toNumber();
      const len = (c) => sp.candidates.find((x) => x.id === c).polyline.reduce((s, pt, i, a) => (i ? s + new THREE.Vector3(...pt).distanceTo(new THREE.Vector3(...a[i - 1])) : 0), 0);
      expect(len(q.correctAnswers[0])).toBeCloseTo(min, 9);
      for (const c of q.choices.filter((x) => x.id !== q.correctAnswers[0])) expect(len(c.id)).toBeGreaterThan(min * 1.04);
      expect(q.choices.map((c) => c.label)).toEqual(['ア', 'イ', 'ウ', 'エ'].slice(0, q.choices.length));
      expect(q.choices.every((c) => c.visual?.type === 'swatch')).toBe(true);
    }
  });

  it('S02：「同じ長さ」をふくむ3択。答えは道の長さの正確な比較と一致する', () => {
    const answers = new Set();
    for (const q of questions(byId.S02, [1, 2, 3, 4, 5, 6], 6)) {
      const [a, b] = q.scene.surfacePath.candidates.map((c) => calculatePathLength(c.polyline.map((pt) => pt.map((x) => toQ(x)))));
      const cmp = a.cmp(b);
      expect(q.correctAnswers).toEqual([cmp === 0 ? 'same' : cmp < 0 ? 'a' : 'b']);
      answers.add(q.correctAnswers[0]);
    }
    expect([...answers].sort()).toEqual(['a', 'b', 'same']);
  });

  it('S03・S05：道のりは、最短経路の長さ × (1辺÷2)。S03 は2面だけ、S05 は3面以上の道もくらべる', () => {
    for (const [id, check] of [
      ['S03', (r) => r.shortest.every((s) => s.faces.length === 2)],
      ['S05', (r) => r.all.some((s) => s.faces.length >= 3)],
    ]) {
      for (const q of questions(byId[id])) {
        const s = Number(q.question.match(/1辺(\d+)cm/)[1]);
        const [p, qq] = q.scene.surfacePath.points.map((x) => x.position);
        const r = findShortestSurfacePaths(p, qq);
        expect(check(r), q.key).toBe(true);
        const answer = r.length.scale(new Q(s, 2));
        expect(q.choices.find((c) => c.id === q.correctAnswers[0]).label).toBe(answer.format('cm'));
        expect(q.explanation.text).toContain(answer.format('cm'));
        expect(q.scene.surfacePath.solution.label).toBe(answer.format('cm'));
        // 回答前は道を表示しない
        expect(q.scene.surfacePath.candidates).toEqual([]);
      }
    }
  });

  it('S04：正解の図は、広げた面の上で2点を結ぶ直線（同じ縮尺の4つの図）', () => {
    for (const q of questions(byId.S04, [1, 2, 3], 3)) {
      const figs = q.choices.map((c) => c.visual);
      expect(new Set(figs.map((f) => f.frame.join())).size).toBe(1);
      const correct = q.choices.find((c) => c.id === 'net0').visual;
      const [a, b] = [correct.points[0].at, correct.points[1].at];
      // 道の点は、すべて P と Q を結ぶ直線の上
      for (const p of correct.path) expect(Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))).toBeLessThan(1e-9);
      const [p, qq] = q.scene.surfacePath.points.map((x) => x.position);
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(findShortestSurfacePaths(p, qq).length.toNumber(), 9);
    }
  });

  it('S06：最短経路をすべて選ぶ（2本以上）。正解は候補のうち最短の長さのものすべて', () => {
    for (const q of questions(byId.S06)) {
      expect(q.type).toBe('multiple');
      expect(q.correctAnswers.length).toBeGreaterThanOrEqual(2);
      const lengths = Object.fromEntries(q.scene.surfacePath.candidates.map((c) => [c.id, calculatePathLength(c.polyline.map((pt) => pt.map(toQ)))]));
      const min = Object.values(lengths).reduce((m, x) => (x.cmp(m) < 0 ? x : m));
      expect(Object.keys(lengths).filter((id) => lengths[id].eq(min)).sort()).toEqual([...q.correctAnswers].sort());
    }
  });

  it('候補の道のまちがいは、最短より5%以上長い（見分けられる）', () => {
    for (const pair of basePairs().filter((_, i) => i % 5 === 0)) {
      const { longer } = candidatePaths(pair.res, pair.p, pair.q);
      for (const c of longer) expect(c.length.toNumber()).toBeGreaterThanOrEqual(pair.res.length.toNumber() * 1.05 - 1e-9);
    }
  });
});

/** 保存した小数の座標を有理数に戻す（分母 1〜12） */
function toQ(x) {
  for (let d = 1; d <= 12; d++) if (Math.abs(Math.round(x * d) - x * d) < 1e-9) return new Q(Math.round(x * d), d);
  throw new Error(`有理数に戻せません: ${x}`);
}

describe('最短経路の 3D モデルと展開の演出', () => {
  function setup(q) {
    const model = createCubeModel({ labels: false });
    const state = createOrientationState(model.root);
    const highlights = createHighlightManager(model);
    const surface = createSurfacePathModel({ cubeRoot: model.root, labels: false });
    surface.set(q.scene.surfacePath);
    const manager = new AnimationManager({ inputLock: new InputLock() });
    let dir = [4, 3, 5];
    const controls = { setHomeDirection: vi.fn(), resetCamera: vi.fn(() => (dir = [4, 3, 5])), getViewDirection: () => dir, setViewDirection: vi.fn((d) => (dir = d)) };
    return { model, state, highlights, surface, manager, controls };
  }

  it('広げきると、道は一直線になり、長さは最短経路の長さと一致する', () => {
    for (const q of [...questions(byId.S05, [2], 2), ...questions(byId.S03, [4], 2), ...questions(byId.S01, [6], 2)]) {
      const { surface } = setup(q);
      surface.setUnfold(1);
      const pts = surface.getUnfoldedPathPoints().map((p) => new THREE.Vector3(...p));
      expect(pts.length).toBeGreaterThanOrEqual(2);
      const ends = [...pts].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
      const a = ends[0];
      const b = ends.at(-1);
      const dir = b.clone().sub(a).normalize();
      for (const p of pts) expect(p.clone().sub(a).cross(dir).length()).toBeLessThan(1e-6);
      // 画面に収めるため縮めているので、縮めた分を戻して長さをくらべる
      const [p0, q0] = q.scene.surfacePath.points.map((x) => x.position);
      const scale = surface.root.children.find((c) => c.visible && c.scale.x !== 1)?.scale.x ?? 1;
      const span = Math.max(...pts.map((p) => p.distanceTo(a))) / scale;
      expect(span).toBeCloseTo(findShortestSurfacePaths(p0, q0).length.toNumber(), 5);
      surface.dispose();
    }
  });

  it('演出：正解を緑に → 点が動く → 面を広げる → 立方体に戻す。リプレイで初めから、スキップで最終状態', async () => {
    const [q] = questions(byId.S01, [7], 1);
    const { model, state, highlights, surface, manager, controls } = setup(q);
    expect(surface.getState()).toMatchObject({ active: true, candidateCount: q.choices.length, solutionVisible: false, unfoldVisible: false });
    const steps = q.explanation.reveal.steps;
    const states = [];
    let done = manager.play(createQuestionReveal({ state, controls, highlights, surface }, { steps }));
    for (let t = 0; manager.isActive() && t < 60000; t += 50) {
      manager.tick(t);
      states.push(surface.getState());
    }
    await done;
    expect(states.some((s) => s.dotVisible)).toBe(true);
    expect(states.some((s) => s.unfoldVisible && s.cubeVisible === false)).toBe(true);
    const last = surface.getState();
    expect(last).toMatchObject({ highlight: true, unfold: 0, unfoldVisible: false, cubeVisible: true, solutionVisible: true });
    expect(last.dimmedCandidates.sort()).toEqual(q.choices.map((c) => c.id).filter((id) => !q.correctAnswers.includes(id)).sort());
    expect(controls.setViewDirection).toHaveBeenCalled(); // 広げた面の正面へカメラを動かす
    // リプレイ：はじめから（再生を始めた時点で、強調・展開をもとに戻す）
    done = manager.play(createQuestionReveal({ state, controls, highlights, surface }, { steps }));
    expect(surface.getState()).toMatchObject({ highlight: false, unfold: 0, travel: 0, solutionVisible: false });
    manager.skip();
    await done;
    expect(surface.getState()).toMatchObject({ highlight: true, unfold: 0, cubeVisible: true });
    surface.set(null);
    expect(model.root.visible).toBe(true);
    surface.dispose();
  });
});
