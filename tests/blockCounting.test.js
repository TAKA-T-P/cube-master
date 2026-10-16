// 立方体の個数・着色：積み木の個数（B09〜B12）の数え方・問題生成・段ごとに分ける演出
import { describe, it, expect, vi } from 'vitest';
import { heightsToCubes, cubesToHeights, cubeKey, isGrounded, hasDuplicateCubes, isBlockStructureReadable, BLOCK_VIEW_DIRECTION } from '../src/core/blockGeometry.js';
import {
  countAllBlocks,
  countBlocksByLayer,
  countBlocksByColumn,
  countHiddenBlocks,
  countRemainingBlocks,
  blocksInLayer,
  isBlockVisible,
  isCountDetermined,
  projectedTopCenter,
  blocksToAdd,
  sumHeights,
  MAX_DETERMINED_SIZE,
} from '../src/core/blockCounting.js';
import { BLOCK_COUNT_TEMPLATES } from '../src/questions/paintedCube/blockCountGenerators.js';
import { layerFormula } from '../src/questions/paintedCube/blockCountExplanations.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { QuestionPicker } from '../src/core/questionEngine.js';
import { getTemplates } from '../src/questions/questionRegistry.js';
import { createBlockModel, LAYER_GAP } from '../src/three/blockModel.js';
import { createCubeModel } from '../src/three/cubeModel.js';
import { createHighlightManager } from '../src/three/cubeHighlight.js';
import { AnimationManager } from '../src/three/animationManager.js';
import { createOrientationState, createQuestionReveal } from '../src/three/cubeRotationAnimations.js';
import { InputLock } from '../src/core/inputLock.js';
import { createRng } from '../src/utils/random.js';

const SAMPLE = [
  [1, 2, 0],
  [2, 3, 1],
  [1, 1, 2],
];

describe('個数の計算', () => {
  it('高さマップの合計・小立方体の数・段ごとの合計が一致する', () => {
    const cubes = heightsToCubes(SAMPLE);
    expect(countAllBlocks(cubes)).toBe(13);
    expect(sumHeights(SAMPLE)).toBe(13);
    const { layers, total } = countBlocksByLayer(cubes);
    expect(layers).toEqual([
      { level: 1, count: 8 },
      { level: 2, count: 4 },
      { level: 3, count: 1 },
    ]);
    expect(layers.reduce((s, l) => s + l.count, 0)).toBe(total);
    expect(blocksInLayer(cubes, 2).every((c) => c.y === 1)).toBe(true);
    expect(countBlocksByColumn(cubes)).toEqual(SAMPLE);
    expect(hasDuplicateCubes(cubes)).toBe(false);
    expect(isGrounded(cubes)).toBe(true);
  });

  it('取り除いた残り・完成形に加える積み木', () => {
    const cubes = heightsToCubes(SAMPLE);
    expect(countRemainingBlocks(cubes, [{ x: 1, y: 2, z: 1 }, '0,0,0'])).toBe(11);
    const target = heightsToCubes([[2, 2, 1], [2, 3, 1], [1, 1, 2]]);
    expect(blocksToAdd(cubes, target)).toEqual([{ x: 0, y: 1, z: 0 }, { x: 2, y: 0, z: 0 }]);
    expect(blocksToAdd(target, cubes)).toBeNull(); // 完成形が今の形をふくまない
  });

  it('見えない小立方体：面の一部でも見えれば見えるものとして数える', () => {
    // 3×1 の1列：真ん中の奥・下は、手前と上の積み木にかくれる
    const box = heightsToCubes([
      [2, 2],
      [2, 2],
    ]);
    const hidden = countHiddenBlocks(box);
    expect(hidden.cubes).toEqual([{ x: 0, y: 0, z: 0 }]); // 奥・左・下の1個だけがかくれる
    // 1個だけなら見える
    expect(countHiddenBlocks(heightsToCubes([[1]])).count).toBe(0);
    // となりが低いと、一部が見える
    const partly = heightsToCubes([[1, 1], [1, 0]]);
    expect(isBlockVisible({ x: 0, y: 0, z: 0 }, partly)).toBe(true);
  });

  it('見取図の中で、ちがうマス・高さの上の面が同じ位置に描かれない（大きさ 4 以下）', () => {
    const seen = new Map();
    const n = MAX_DETERMINED_SIZE;
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) for (let h = 0; h <= n; h++) {
      const [u, v] = projectedTopCenter(x, h, z);
      const key = `${u.toFixed(6)},${v.toFixed(6)}`;
      expect(seen.has(key), `${x},${h},${z} と ${seen.get(key)}`).toBe(false);
      seen.set(key, `${x},${h},${z}`);
    }
  });

  it('総当たり：見取図で読み取れる配置は、上の面の位置だけで区別でき、個数がただ1つに決まる', () => {
    // 2×2（高さ 0〜3）と 3×2（高さ 0〜2）のすべての高さマップ
    for (const [w, d, maxH] of [[2, 2, 3], [3, 2, 2]]) {
      const signatures = new Map();
      const cells = w * d;
      for (let code = 0; code < (maxH + 1) ** cells; code++) {
        const flat = [...Array(cells).keys()].map((i) => Math.floor(code / (maxH + 1) ** i) % (maxH + 1));
        const heights = [...Array(d).keys()].map((z) => flat.slice(z * w, z * w + w));
        const cubes = heightsToCubes(heights);
        if (cubes.length === 0 || !isBlockStructureReadable(cubes)) continue;
        // 図に描かれる上の面（空きマスは床）の位置の集まり
        const sig = heights.flatMap((row, z) => row.map((h, x) => projectedTopCenter(x, h, z).map((t) => t.toFixed(5)).join(','))).sort().join('|');
        if (signatures.has(sig)) expect(signatures.get(sig)).toBe(cubes.length);
        signatures.set(sig, cubes.length);
      }
      expect(signatures.size).toBeGreaterThan(10);
    }
  });

  it('個数が決まらない配置（浮き・見取図で上の面がかくれる・大きすぎる）は出題しない', () => {
    expect(isCountDetermined(heightsToCubes(SAMPLE))).toBe(isBlockStructureReadable(heightsToCubes(SAMPLE)));
    expect(isCountDetermined([{ x: 0, y: 1, z: 0 }])).toBe(false); // 浮いている
    // 手前が高く、奥の柱の上がかくれる
    expect(isCountDetermined(heightsToCubes([[1, 1], [4, 4]]))).toBe(false);
    expect(isCountDetermined(heightsToCubes([[1, 1, 1, 1, 1]]))).toBe(false); // 横が 5
  });
});

// ---------------- 問題生成 ----------------
const byId = Object.fromEntries(BLOCK_COUNT_TEMPLATES.map((t) => [t.id, t]));
const cache = new Map();
function questionsOf(id) {
  if (!cache.has(id)) {
    const out = [];
    for (const seed of [1, 2, 3]) {
      const rng = createRng(seed);
      for (const base of byId[id].bases()) out.push({ ...byId[id].build(base, rng), id: 'test', base });
    }
    cache.set(id, out);
  }
  return cache.get(id);
}

describe('B09〜B12 の生成', () => {
  it('難易度：B09 基本、B10・B11 標準、B12 応用', () => {
    expect(BLOCK_COUNT_TEMPLATES.map((t) => `${t.id}:${t.difficulty}`)).toEqual(['B09:1', 'B10:2', 'B11:2', 'B12:3']);
  });

  describe.each(BLOCK_COUNT_TEMPLATES.map((t) => [t.id]))('%s', (id) => {
    it('正しい形・4択・正解は1つ・重複なし・個数は1以上・見取図だけで個数が決まる', () => {
      for (const q of questionsOf(id)) {
        expect(getQuestionErrors(q)).toEqual([]);
        expect(q.choices).toHaveLength(4);
        expect(new Set(q.choices.map((c) => c.id)).size).toBe(4);
        expect(q.correctAnswers).toHaveLength(1);
        expect(q.choices.map((c) => c.id)).toContain(q.correctAnswers[0]);
        for (const c of q.choices) expect(Number(c.id)).toBeGreaterThanOrEqual(1);
        expect(q.hint.text.length).toBeGreaterThan(0);
        expect(isCountDetermined(q.scene.blocks)).toBe(true);
        expect(q.scene.counting).toBe(true);
        expect(q.scene.interaction.allowCameraRotationBeforeAnswer).toBe(false);
        expect(q.question).toContain('床から隙間なく積んであり');
        // 図（回答前）と 3D は同じ配置データ
        const fig = q.scene.preview.type === 'blocksPair' ? q.scene.preview.items[1] : q.scene.preview;
        expect(fig.cubes).toEqual(q.scene.blocks);
        expect(fig.arrows).toEqual([]);
      }
    });
  });

  it('B09：全部の個数（底面 2×2〜3×2・3段まで・5〜15個）。解説の式は配置から作る', () => {
    for (const q of questionsOf('B09')) {
      const { layers, total } = countBlocksByLayer(q.scene.blocks);
      expect(Number(q.correctAnswers[0])).toBe(total);
      expect(total).toBe(sumHeights(cubesToHeights(q.scene.blocks)));
      expect(total >= 5 && total <= 15).toBe(true);
      expect(layers.length).toBeLessThanOrEqual(3);
      expect(q.explanation.text).toContain(layerFormula(layers, total));
    }
  });

  it('B10：見えない積み木が1個以上あり、全部の個数が正解。まちがいに「見えている数」がある', () => {
    for (const q of questionsOf('B10')) {
      const hidden = countHiddenBlocks(q.scene.blocks);
      expect(hidden.count).toBeGreaterThanOrEqual(1);
      expect(Number(q.correctAnswers[0])).toBe(q.scene.blocks.length);
      expect(q.choices.map((c) => Number(c.id))).toContain(q.scene.blocks.length - hidden.count);
      const step = q.explanation.reveal.steps.find((s) => s.type === 'countLayers');
      expect(step.hidden).toEqual(hidden.cubes);
      expect(q.question).toContain('その下にも必ず積み木があります');
    }
  });

  it('B11：問題文の段の個数が正解（2〜4段・段によって個数がちがう）', () => {
    for (const q of questionsOf('B11')) {
      const level = Number(q.question.match(/下から(\d)段目/)[1]);
      const { layers } = countBlocksByLayer(q.scene.blocks);
      expect(layers.length >= 2 && layers.length <= 4).toBe(true);
      expect(Number(q.correctAnswers[0])).toBe(blocksInLayer(q.scene.blocks, level).length);
      const step = q.explanation.reveal.steps.find((s) => s.type === 'countLayer');
      expect(step.level).toBe(level);
      expect(step.cubes.map(cubeKey).sort()).toEqual(blocksInLayer(q.scene.blocks, level).map(cubeKey).sort());
    }
  });

  it('B12：完成形は今の形をふくみ、加える数 = 完成形 − 今の形。2つの図で示し、どちらも見取図で数が決まる', () => {
    for (const q of questionsOf('B12')) {
      const [now, goal] = q.scene.preview.items;
      expect([now.caption, goal.caption]).toEqual(['今の形', '完成形']);
      expect(isCountDetermined(now.cubes) && isCountDetermined(goal.cubes)).toBe(true);
      const add = blocksToAdd(now.cubes, goal.cubes);
      expect(add).not.toBeNull();
      expect(Number(q.correctAnswers[0])).toBe(goal.cubes.length - now.cubes.length);
      expect(add).toHaveLength(Number(q.correctAnswers[0]));
      const step = q.explanation.reveal.steps.find((s) => s.type === 'addBlocks');
      expect(step.cubes.map(cubeKey).sort()).toEqual(add.map(cubeKey).sort());
      expect(isGrounded(goal.cubes)).toBe(true);
    }
  });

  it('連続出題：基本・標準・応用・すべてで正しい形、同じテンプレートが3回続かない', () => {
    for (const difficulty of [1, 2, 3, 'all']) {
      const picker = new QuestionPicker({ templates: getTemplates('paintedCube'), difficulty, rng: createRng(8) });
      const ids = [];
      for (let i = 0; i < 40; i++) {
        const q = picker.next();
        expect(getQuestionErrors(q)).toEqual([]);
        ids.push(q.templateId);
      }
      for (let i = 2; i < ids.length; i++) expect(ids[i] === ids[i - 1] && ids[i] === ids[i - 2]).toBe(false);
    }
  });
});

// ---------------- 3D の演出 ----------------
describe('段ごとに分けて数える演出', () => {
  function setup(q) {
    const cube = createCubeModel({ labels: false });
    const state = createOrientationState(cube.root);
    const highlights = createHighlightManager(cube);
    const blocks = createBlockModel({ labels: false });
    blocks.set(q.scene.blocks, { arrows: [], countingRoom: true });
    const inputLock = new InputLock();
    const manager = new AnimationManager({ inputLock });
    const controls = { setHomeDirection: vi.fn(), resetCamera: vi.fn(), getViewDirection: () => [...BLOCK_VIEW_DIRECTION], setViewDirection: vi.fn() };
    const play = () => manager.play(createQuestionReveal({ state, controls, highlights, blocks }, { steps: q.explanation.reveal.steps }));
    return { blocks, manager, inputLock, play };
  }
  const run = (manager) => {
    for (let t = 0; manager.isActive() && t < 120000; t += 50) manager.tick(t);
  };

  it('B09：上の段ほど高く持ち上がり、各段の個数と合計のラベルが正しい。リプレイははじめから、スキップは最終状態', async () => {
    const q = questionsOf('B09')[0];
    const { blocks, manager, inputLock, play } = setup(q);
    const { layers, total } = countBlocksByLayer(q.scene.blocks);
    let done = play();
    manager.tick(0);
    run(manager);
    await done;
    const st = blocks.getCountingState();
    for (const c of q.scene.blocks) expect(st.lifts[cubeKey(c)]).toBeCloseTo(LAYER_GAP * c.y, 9);
    expect(st.labels.map((l) => l.text)).toEqual([...layers.map((l) => `${l.level}段目 ${l.count}個`), `合計 ${total}個`]);
    expect(inputLock.isLocked()).toBe(false);

    done = play();
    manager.tick(0);
    expect(Object.values(blocks.getCountingState().lifts).every((v) => v === 0)).toBe(true); // リプレイ：はじめの状態
    expect(blocks.getCountingState().labels).toEqual([]);
    manager.skip();
    await expect(done).resolves.toEqual({ status: 'skipped' });
    expect(blocks.getCountingState().labels.at(-1).text).toBe(`合計 ${total}個`);
  });

  it('B10：見えない積み木だけを色付きにし（ほかは半透明）、そのあと段ごとに数える', () => {
    const q = questionsOf('B10')[0];
    const { blocks, manager, play } = setup(q);
    const hidden = new Set(countHiddenBlocks(q.scene.blocks).cubes.map(cubeKey));
    play();
    for (let t = 0; t <= 1500; t += 50) manager.tick(t); // カメラ移動のあと、見えない積み木を示しているところ
    const st = blocks.getCountingState();
    for (const c of q.scene.blocks) expect(st.styles[cubeKey(c)]).toBe(hidden.has(cubeKey(c)) ? 'hidden' : 'dim');
    manager.skip();
    const end = blocks.getCountingState();
    for (const c of q.scene.blocks) expect(end.styles[cubeKey(c)]).toBe(hidden.has(cubeKey(c)) ? 'hidden' : 'base');
    expect(end.labels.at(-1).text).toBe(`合計 ${q.scene.blocks.length}個`);
  });

  it('B11：指定した段だけ緑で持ち上げ、ほかは半透明。1個ずつ数えて段の個数を表示', () => {
    const q = questionsOf('B11')[0];
    const level = q.explanation.reveal.steps.find((s) => s.type === 'countLayer').level;
    const { blocks, manager, play } = setup(q);
    play();
    manager.skip();
    const st = blocks.getCountingState();
    const n = blocksInLayer(q.scene.blocks, level).length;
    for (const c of q.scene.blocks) {
      expect(st.styles[cubeKey(c)]).toBe(c.y === level - 1 ? 'highlight' : 'dim');
      expect(st.lifts[cubeKey(c)]).toBeCloseTo(c.y < level - 1 ? 0 : c.y === level - 1 ? LAYER_GAP : 2 * LAYER_GAP, 9);
    }
    expect(st.labels.filter((l) => l.kind === 'cube').map((l) => l.text)).toEqual([...Array(n).keys()].map((i) => String(i + 1)));
    expect(st.labels.at(-1).text).toBe(`${level}段目 ${n}個`);
  });

  it('B12：加える積み木を1つずつ置いて完成形に。途中は今の形、最後はすべて置かれている', () => {
    const q = questionsOf('B12')[0];
    const add = q.explanation.reveal.steps.find((s) => s.type === 'addBlocks').cubes;
    const { blocks, manager, play } = setup(q);
    play();
    for (let t = 0; t <= 400; t += 50) manager.tick(t);
    let st = blocks.getCountingState();
    for (const c of add) expect(st.visible[cubeKey(c)]).toBe(false); // はじめは今の形
    manager.skip();
    st = blocks.getCountingState();
    for (const c of q.scene.blocks) {
      expect(st.visible[cubeKey(c)]).toBe(true);
      expect(st.lifts[cubeKey(c)] ?? 0).toBeCloseTo(0, 9);
    }
    for (const c of add) expect(st.styles[cubeKey(c)]).toBe('highlight');
    expect(st.labels.at(-1).text).toBe(`完成！ あと${add.length}個`);
  });

  it('途中でキャンセルしても操作ロックが残らず、次の問題で前の状態が残らない', async () => {
    const q = questionsOf('B09')[1];
    const { blocks, manager, inputLock, play } = setup(q);
    const done = play();
    for (let t = 0; t <= 1500; t += 50) manager.tick(t);
    manager.cancel();
    await expect(done).resolves.toEqual({ status: 'cancelled' });
    expect(inputLock.isLocked()).toBe(false);
    const next = questionsOf('B11')[0];
    blocks.set(next.scene.blocks, { arrows: [], countingRoom: true });
    const st = blocks.getCountingState();
    expect(Object.values(st.lifts).every((v) => v === 0)).toBe(true);
    expect(Object.values(st.styles).every((s) => s === 'base')).toBe(true);
    expect(st.labels).toEqual([]);
  });
});
