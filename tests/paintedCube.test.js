// 小立方体の個数・着色：分割と着色の計算、B01〜B08 の問題生成、3D モデルと演出
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createSubdividedCube,
  getExteriorFaces,
  classifySubcube,
  subcubeKey,
  removeSubcubes,
  uniqueSubcubes,
  cornerSubcubes,
  edgeSubcubes,
  columnSubcubes,
  getSubcubeListErrors,
} from '../src/core/subdividedCube.js';
import { getPaintedFaces, countPaintedFaces, getCubesByPaintCount, getCubeCountByPaintCount, getCubesByPaintCounts, paintFormula } from '../src/core/cubePainting.js';
import { PAINTED_CUBE_TEMPLATES, countChoices } from '../src/questions/paintedCube/paintedCubeGenerators.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { QuestionPicker } from '../src/core/questionEngine.js';
import { getCategory, getTemplates } from '../src/questions/questionRegistry.js';
import { createSubdividedCubeModel, SEPARATION_GAP } from '../src/three/subdividedCubeModel.js';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { AnimationManager } from '../src/three/animationManager.js';
import { createOrientationState, createQuestionReveal } from '../src/three/cubeRotationAnimations.js';
import { InputLock } from '../src/core/inputLock.js';
import { createRng } from '../src/utils/random.js';

describe('分割', () => {
  it.each([1, 2, 3, 4, 5])('%i 等分で n³ 個、座標は 0〜n-1 で重複なし', (n) => {
    const { cubes } = createSubdividedCube(n);
    expect(cubes).toHaveLength(n ** 3);
    expect(new Set(cubes.map(subcubeKey)).size).toBe(n ** 3);
    expect(getSubcubeListErrors(cubes, n)).toEqual([]);
    for (const c of cubes) for (const v of [c.x, c.y, c.z]) expect(v >= 0 && v < n).toBe(true);
  });

  it('範囲外・重複を見つける。不正な分け方はエラー', () => {
    expect(getSubcubeListErrors([{ x: 3, y: 0, z: 0 }], 3)).toHaveLength(1);
    expect(getSubcubeListErrors([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], 3)).toHaveLength(1);
    expect(() => createSubdividedCube(0)).toThrow();
    expect(() => createSubdividedCube(7)).toThrow();
  });

  it('角・辺・面の中央・内部の分類（3×3×3）', () => {
    const counts = {};
    for (const c of createSubdividedCube(3).cubes) counts[classifySubcube(c, 3)] = (counts[classifySubcube(c, 3)] ?? 0) + 1;
    expect(counts).toEqual({ corner: 8, edge: 12, face: 6, inner: 1 });
    expect(getExteriorFaces({ x: 2, y: 2, z: 2 }, 3).sort()).toEqual(['front', 'right', 'top']);
    expect(getExteriorFaces({ x: 1, y: 1, z: 1 }, 3)).toEqual([]);
  });

  it('取り除く：重なりを2回数えない', () => {
    const n = 3;
    const corners = cornerSubcubes(n).filter((c) => c.y === n - 1);
    const edge = edgeSubcubes(n, 'topFront');
    const removed = uniqueSubcubes([...corners, ...edge]);
    expect(corners.length + edge.length).toBe(7);
    expect(removed).toHaveLength(5); // 手前の2つの角が重なる
    expect(removeSubcubes(createSubdividedCube(n).cubes, removed)).toHaveLength(22);
    expect(columnSubcubes(4, 1, 1)).toHaveLength(4);
  });
});

describe('着色', () => {
  it.each([2, 3, 4, 5, 6])('6面すべてを塗った %i 等分：公式と一致し、合計は n³', (n) => {
    const counts = getCubeCountByPaintCount({ divisions: n });
    expect(counts).toEqual(paintFormula(n));
    expect(counts[0] + counts[1] + counts[2] + counts[3]).toBe(n ** 3);
    for (const c of createSubdividedCube(n).cubes) expect(countPaintedFaces(c, n)).toBeGreaterThanOrEqual(0);
    for (const c of createSubdividedCube(n).cubes) expect(countPaintedFaces(c, n)).toBeLessThanOrEqual(3);
  });

  it('2等分では8個すべてが3面', () => {
    expect(getCubeCountByPaintCount({ divisions: 2 })).toEqual({ 0: 0, 1: 0, 2: 0, 3: 8 });
  });

  it('一部の面だけ塗る：上面と前面（3×3×3）', () => {
    const spec = { divisions: 3, paintedFaces: ['top', 'front'] };
    // 2面：上と前の共通の辺の3個、1面：上面の6個 + 前面の6個、0面：残り
    expect(getCubeCountByPaintCount(spec)).toEqual({ 0: 12, 1: 12, 2: 3, 3: 0 });
    expect(getCubesByPaintCount(spec, 2).every((c) => c.y === 2 && c.z === 2)).toBe(true);
    // 向かい合う2面（上と下）では、2面に色がつく小立方体はない
    expect(getCubeCountByPaintCount({ divisions: 3, paintedFaces: ['top', 'bottom'] })[2]).toBe(0);
    // 切り口（内側の面）には色がつかない：中心の小立方体はどの面も塗られていない
    expect(getPaintedFaces({ x: 1, y: 1, z: 1 }, 3, ['top', 'front'])).toEqual([]);
  });

  it('取り除いた残りでも数えられ、複数の条件を合わせられる', () => {
    const n = 4;
    const cubes = removeSubcubes(createSubdividedCube(n).cubes, cornerSubcubes(n));
    expect(getCubesByPaintCount({ divisions: n, cubes }, 3)).toHaveLength(0);
    expect(getCubesByPaintCounts({ divisions: n }, [0, 1])).toHaveLength(8 + 24);
  });
});

// ---------------- 問題生成 ----------------
const byId = Object.fromEntries(PAINTED_CUBE_TEMPLATES.map((t) => [t.id, t]));
const cache = new Map();
function questionsOf(id) {
  if (!cache.has(id)) {
    const out = [];
    for (const seed of [1, 2]) {
      const rng = createRng(seed);
      for (const base of byId[id].bases()) out.push({ ...byId[id].build(base, rng), id: 'test', base });
    }
    cache.set(id, out);
  }
  return cache.get(id);
}
const numberIn = (text, re) => Number(text.match(re)[1]);
const divisionsIn = (text) => numberIn(text, /(\d)×\d×\d/);

describe('カテゴリとテンプレート', () => {
  it('⑦ 立方体の個数・着色（B01〜B08・難易度）', () => {
    expect(getCategory('paintedCube')).toMatchObject({ name: '立方体の個数・着色', enabled: true, grades: '小学5年生～中学2年生' });
    expect(PAINTED_CUBE_TEMPLATES.map((t) => `${t.id}:${t.difficulty}`)).toEqual(['B01:1', 'B02:1', 'B03:2', 'B04:2', 'B05:2', 'B06:3', 'B07:3', 'B08:3']);
    expect(getTemplates('paintedCube', 1).map((t) => t.id)).toEqual(['B01', 'B02', 'B09']);
    expect(getTemplates('paintedCube', 2).map((t) => t.id)).toEqual(['B03', 'B04', 'B05', 'B10', 'B11']);
    expect(getTemplates('paintedCube', 3).map((t) => t.id)).toEqual(['B06', 'B07', 'B08', 'B12']);
  });

  it('個数の選択肢：4つ・重複なし・0 以上', () => {
    expect(countChoices(8, [8, -1, 6, 6, 12]).map((c) => c.label)).toEqual(['8個', '6個', '12個', '9個']);
    expect(countChoices(0, []).map((c) => Number(c.id)).every((v) => v >= 0)).toBe(true);
  });
});

describe.each(PAINTED_CUBE_TEMPLATES.map((t) => [t.id]))('%s 共通', (id) => {
  it('すべての基準で正しい形の問題ができ、正解が選択肢に1つだけある', () => {
    for (const q of questionsOf(id)) {
      expect(getQuestionErrors(q)).toEqual([]);
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices.map((c) => c.id)).size).toBe(4);
      expect(q.correctAnswers).toHaveLength(1);
      expect(q.choices.map((c) => c.id)).toContain(q.correctAnswers[0]);
      for (const c of q.choices) expect(Number(c.id)).toBeGreaterThanOrEqual(0);
      expect(q.hint.text.length).toBeGreaterThan(0);
      // 回答前は回せない（静的な見取図）・回答後は 3D
      expect(q.scene.interaction.allowCameraRotationBeforeAnswer).toBe(false);
      expect(q.scene.preview.type).toBe('subcubes');
    }
  });

  it('正解演出で強調する小立方体・個数の表示が、正解と一致する', () => {
    for (const q of questionsOf(id)) {
      const step = q.explanation.reveal.steps.find((s) => s.type === 'highlightSubcubes');
      expect(step).toBeDefined();
      expect(q.explanation.reveal.steps.map((s) => s.type)).toEqual(['pause', 'divide', 'separate', 'highlightSubcubes']);
      if (id === 'B07') expect(step.label).toBe(`残り${q.correctAnswers[0]}個`);
      else if (id === 'B08') expect(step.cubes).toHaveLength(numberIn(q.question, /小立方体は(\d+)個/));
      else expect(step.cubes).toHaveLength(Number(q.correctAnswers[0]));
    }
  });
});

describe('正解が数学的な計算と一致する（問題文の分け方・塗り方から計算し直す）', () => {
  const allCounts = (n) => getCubeCountByPaintCount({ divisions: n });
  it('B01〜B04：6面を塗ったときの 3面・2面・1面・0面', () => {
    const k = { B01: 3, B02: 2, B03: 1, B04: 0 };
    for (const [id, faces] of Object.entries(k)) {
      for (const q of questionsOf(id)) {
        const n = divisionsIn(q.question);
        expect(q.scene.subcubes.divisions).toBe(n);
        expect(q.scene.subcubes.paintedFaces.sort()).toEqual(['back', 'bottom', 'front', 'left', 'right', 'top']);
        expect(Number(q.correctAnswers[0])).toBe(allCounts(n)[faces]);
        expect(Number(q.correctAnswers[0])).toBe(paintFormula(n)[faces]);
      }
    }
  });

  it('B01 は 2〜3 等分が中心、B04 は内側がある大きさ（3 等分以上）', () => {
    expect(questionsOf('B01').map((q) => q.scene.subcubes.divisions).every((n) => n <= 4)).toBe(true);
    expect(questionsOf('B04').map((q) => q.scene.subcubes.divisions).every((n) => n >= 3 && n <= 5)).toBe(true);
  });

  it('B05：問題文の面だけを塗った計算と一致し、見取図も同じ面だけ塗る', () => {
    const names = { 上面: 'top', 下面: 'bottom', 前面: 'front', 後ろの面: 'back', 右の面: 'right', 左の面: 'left' };
    for (const q of questionsOf('B05')) {
      const sides = Object.entries(names).filter(([name]) => q.question.includes(name)).map(([, s]) => s).sort();
      expect([...q.scene.subcubes.paintedFaces].sort()).toEqual(sides);
      expect([...q.scene.preview.paintedFaces].sort()).toEqual(sides);
      const k = q.question.includes('1面も') ? 0 : q.question.includes('1面だけ') ? 1 : q.question.includes('2面') ? 2 : 3;
      expect(Number(q.correctAnswers[0])).toBe(getCubeCountByPaintCount({ divisions: divisionsIn(q.question), paintedFaces: sides })[k]);
      expect(Number(q.correctAnswers[0])).toBeGreaterThan(0);
    }
  });

  it('B06：2つの条件の合計', () => {
    for (const q of questionsOf('B06')) {
      const n = divisionsIn(q.question);
      const [a, b] = q.question.includes('2面以上') ? [2, 3] : q.question.match(/(\d)面または(\d)面/).slice(1).map(Number);
      expect(Number(q.correctAnswers[0])).toBe(allCounts(n)[a] + allCounts(n)[b]);
    }
  });

  it('B07：取り除いた小立方体は重複なしで図に示し、残りは n³ − 取り除いた数', () => {
    for (const q of questionsOf('B07')) {
      const n = divisionsIn(q.question);
      const removed = q.scene.subcubes.removed;
      expect(getSubcubeListErrors(removed, n)).toEqual([]);
      expect(q.scene.preview.removed).toEqual(removed);
      expect(Number(q.correctAnswers[0])).toBe(n ** 3 - removed.length);
    }
  });

  it('B08：個数から分けた数がただ1つに決まる（2〜8 等分で同じ個数になる分け方はない）', () => {
    for (const q of questionsOf('B08')) {
      const count = numberIn(q.question, /小立方体は(\d+)個/);
      const k = q.question.includes('1面も') ? 0 : q.question.includes('1面だけ') ? 1 : 2;
      const matches = [2, 3, 4, 5, 6, 7, 8].filter((n) => paintFormula(n)[k] === count);
      expect(matches).toEqual([Number(q.correctAnswers[0])]);
      expect(q.scene.subcubes.divisions).toBe(matches[0]);
      // 回答前の図では分け方を見せない
      expect(q.scene.preview.showGrid).toBe(false);
      for (const c of q.choices) expect(c.label).toMatch(/^\d+等分$/);
    }
  });

  it('連続出題：「すべて」で 60 問、正しい形で同じテンプレートが3回続かない', () => {
    const picker = new QuestionPicker({ templates: getTemplates('paintedCube'), rng: createRng(5) });
    const ids = [];
    for (let i = 0; i < 60; i++) {
      const q = picker.next();
      expect(getQuestionErrors(q)).toEqual([]);
      ids.push(q.templateId);
    }
    for (let i = 2; i < ids.length; i++) expect(ids[i] === ids[i - 1] && ids[i] === ids[i - 2]).toBe(false);
    expect(new Set(ids).size).toBe(12); // B01〜B12 がかたよらずに出る
  });
});

// ---------------- 3D ----------------
describe('小立方体の 3D モデル', () => {
  it('分ける前・分けたあとの位置。分離するとすきまができ、位置関係は保つ', () => {
    const m = createSubdividedCubeModel({ labels: false });
    m.set({ divisions: 3, paintedFaces: ['top', 'bottom', 'front', 'back', 'left', 'right'] });
    expect(m.getState()).toMatchObject({ visible: true, cubeCount: 27, division: 0, separation: 0, edgesVisible: false, outlineVisible: true });
    expect(m.getCubePosition({ x: 0, y: 0, z: 0 }).toArray()).toEqual([-1, -1, -1]);
    expect(m.getCubePosition({ x: 1, y: 1, z: 1 }).toArray()).toEqual([0, 0, 0]);
    m.setDivision(1);
    m.setSeparation(1);
    const k = 1 + SEPARATION_GAP;
    expect(m.getCubePosition({ x: 2, y: 2, z: 2 }).distanceTo(new THREE.Vector3(k, k, k))).toBeLessThan(1e-9);
    expect(m.getState()).toMatchObject({ edgesVisible: true, outlineVisible: false });
    m.dispose();
  });

  it('色を塗った外側の面にだけ板を貼る（内側の小立方体・切り口には色がつかない）', () => {
    const m = createSubdividedCubeModel({ labels: false });
    m.set({ divisions: 3, paintedFaces: ['top', 'bottom', 'front', 'back', 'left', 'right'] });
    const plates = m.getState().plates;
    expect(plates).toHaveLength(6 * 9);
    expect(plates.some((p) => p.key === '1,1,1')).toBe(false);
    for (const p of plates) {
      const [x, y, z] = p.key.split(',').map(Number);
      expect(getPaintedFaces({ x, y, z }, 3)).toContain(p.side);
    }
    m.set({ divisions: 3, paintedFaces: ['top'] });
    expect(m.getState().plates.every((p) => p.side === 'top')).toBe(true);
    expect(m.getState().plates).toHaveLength(9);
    // 取り除いた小立方体は数えず、赤い箱で示す
    m.set({ divisions: 3, paintedFaces: [], removed: cornerSubcubes(3) });
    expect(m.getState()).toMatchObject({ cubeCount: 19, removedCount: 8 });
    m.dispose();
  });

  it('条件に合う小立方体だけ強調し、ほかは半透明。個数を表示。null で消える', () => {
    const m = createSubdividedCubeModel({ labels: false });
    m.set({ divisions: 4, paintedFaces: ['top', 'bottom', 'front', 'back', 'left', 'right'] });
    const targets = getCubesByPaintCount({ divisions: 4 }, 2);
    m.highlight(targets, { label: '24個' });
    expect(m.getState()).toMatchObject({ highlighted: 24, dimmed: 40, normal: 0, label: '24個' });
    m.clearHighlights();
    expect(m.getState()).toMatchObject({ highlighted: 0, dimmed: 0, normal: 64, label: '' });
    m.set(null);
    expect(m.getState().visible).toBe(false);
    m.dispose();
  });

  it('5 等分（125 個）でも、描画オブジェクトの数は小立方体の数によらない（InstancedMesh）', () => {
    const m = createSubdividedCubeModel({ labels: false });
    m.set({ divisions: 3, paintedFaces: [] });
    const few = m.root.children[0].children.length;
    m.set({ divisions: 5, paintedFaces: [] });
    expect(m.getState().cubeCount).toBe(125);
    expect(m.root.children[0].children.length).toBe(few);
    m.dispose();
  });
});

describe('小立方体の正解演出', () => {
  function setup() {
    const cube = createCubeModel({ labels: false });
    const state = createOrientationState(cube.root);
    const highlights = createHighlightManager(cube);
    const subcubes = createSubdividedCubeModel({ labels: false });
    const inputLock = new InputLock();
    const manager = new AnimationManager({ inputLock });
    const controls = { setHomeDirection: vi.fn(), resetCamera: vi.fn(), getViewDirection: () => [4, 5, 6], setViewDirection: vi.fn() };
    return { state, highlights, subcubes, inputLock, manager, controls };
  }
  const run = (manager) => {
    for (let t = 0; manager.isActive() && t < 60000; t += 50) manager.tick(t);
  };

  it('分割 → 分離 → 強調。リプレイは切り分ける前から、スキップは最終状態', async () => {
    const { state, highlights, subcubes, inputLock, manager, controls } = setup();
    const q = questionsOf('B02')[0];
    subcubes.set(q.scene.subcubes);
    const parts = { state, controls, highlights, subcubes };
    let done = manager.play(createQuestionReveal(parts, { steps: q.explanation.reveal.steps }));
    manager.tick(0);
    expect(subcubes.getState()).toMatchObject({ division: 0, separation: 0, highlighted: 0 });
    run(manager);
    await done;
    expect(subcubes.getState()).toMatchObject({ division: 1, separation: 1, highlighted: Number(q.correctAnswers[0]) });
    expect(inputLock.isLocked()).toBe(false);

    done = manager.play(createQuestionReveal(parts, { steps: q.explanation.reveal.steps }));
    manager.tick(0);
    expect(subcubes.getState()).toMatchObject({ division: 0, separation: 0, highlighted: 0 }); // もう一度見る：はじめから
    manager.skip();
    await expect(done).resolves.toEqual({ status: 'skipped' });
    expect(subcubes.getState()).toMatchObject({ separation: 1, highlighted: Number(q.correctAnswers[0]) });
  });

  it('次の問題で前の問題の表示が残らない', () => {
    const { subcubes } = setup();
    subcubes.set({ divisions: 4, paintedFaces: [] });
    subcubes.setSeparation(1);
    subcubes.highlight([{ x: 0, y: 0, z: 0 }], { label: '1個' });
    subcubes.set({ divisions: 3, paintedFaces: ['top'] });
    expect(subcubes.getState()).toMatchObject({ divisions: 3, cubeCount: 27, separation: 0, highlighted: 0, label: '' });
  });
});
