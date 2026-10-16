// 積み木の見え方・投影図（V01〜V06）の問題生成
import { describe, it, expect } from 'vitest';
import { PROJECTION_TEMPLATES, STRAIGHT_VIEWS } from '../src/questions/projection/projectionGenerators.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { QuestionPicker } from '../src/core/questionEngine.js';
import { getProjection, getShapeKey, columnHeights } from '../src/core/blockProjection.js';
import { getBlockErrors, isBlockStructureReadable, getBlockBounds, blocksKey, BLOCK_VIEW_DIRECTION } from '../src/core/blockGeometry.js';
import { getCategory } from '../src/questions/questionRegistry.js';
import { createRng } from '../src/utils/random.js';

const byId = Object.fromEntries(PROJECTION_TEMPLATES.map((t) => [t.id, t]));
const SEEDS = [1, 2, 3, 4];
const cache = new Map();
function questionsOf(id) {
  if (!cache.has(id)) {
    const out = [];
    for (const seed of SEEDS) {
      const rng = createRng(seed);
      for (const base of byId[id].bases()) out.push({ ...byId[id].build(base, rng), id: 'test' });
    }
    cache.set(id, out);
  }
  return cache.get(id);
}
const shapeOfChoice = (c) => getShapeKey(c.visual.projection);

describe('カテゴリ', () => {
  it('「積み木の見え方・投影図」に変わり、内部 ID は projection のまま', () => {
    expect(getCategory('projection')).toMatchObject({ name: '積み木の見え方・投影図', grades: '小学4年生～中学2年生', enabled: true });
    expect(PROJECTION_TEMPLATES.map((t) => `${t.id}:${t.difficulty}`)).toEqual(['V01:1', 'V02:1', 'V03:2', 'V04:2', 'V05:3', 'V06:3']);
  });
});

describe.each(PROJECTION_TEMPLATES.map((t) => [t.id]))('%s 共通', (id) => {
  it('すべての基準・シードで正しい形の問題ができる', () => {
    for (const q of questionsOf(id)) expect(getQuestionErrors(q)).toEqual([]);
  });

  it('積み木の配置は正しく、見取図・3D・投影図が同じ配置データから作られる', () => {
    for (const q of questionsOf(id)) {
      const cubes = q.scene.blocks;
      expect(getBlockErrors(cubes)).toEqual([]);
      expect(isBlockStructureReadable(cubes)).toBe(true);
      expect(cubes.length).toBeGreaterThanOrEqual(4);
      expect(cubes.length).toBeLessThanOrEqual(25);
      expect(q.scene.model).toBe('blocks');
      expect(q.scene.cameraPreset).toEqual([...BLOCK_VIEW_DIRECTION]);
      // 回答前の静的な図
      if (q.scene.preview.type === 'blocks') {
        expect(q.scene.preview.cubes).toEqual(cubes);
        expect(q.scene.preview.arrows).toEqual(q.scene.arrows);
      }
      // サイコロの目やマークは使わない
      expect(q.scene.faces).toBeUndefined();
    }
  });

  it('正解は選択肢に1つだけ含まれ、選択肢の ID・図が重ならない', () => {
    for (const q of questionsOf(id)) {
      const ids = q.choices.map((c) => c.id);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
      expect(q.correctAnswers).toHaveLength(1);
      expect(ids).toContain(q.correctAnswers[0]);
    }
  });

  it('回答前は 3D を回せず、回答後に視点移動の演出がある', () => {
    for (const q of questionsOf(id)) {
      expect(q.scene.interaction.allowCameraRotationBeforeAnswer).toBe(false);
      expect(q.scene.interaction.allowCameraRotationAfterAnswer).toBe(true);
      expect(q.explanation.reveal.steps.some((s) => s.type === 'camera')).toBe(true);
    }
  });
});

describe('矢印の方向から見た形（V01・V02）', () => {
  it('正解は矢印の方向の投影図で、誤答は正解と同じ形にならない', () => {
    for (const id of ['V01', 'V02']) {
      for (const q of questionsOf(id)) {
        const [dir] = q.scene.arrows;
        expect(q.scene.arrows).toHaveLength(1);
        const correct = getShapeKey(getProjection(q.scene.blocks, dir));
        const shapes = q.choices.map(shapeOfChoice);
        expect(shapes.filter((s) => s === correct)).toHaveLength(1);
        expect(shapeOfChoice(q.choices.find((c) => c.id === 'correct'))).toBe(correct);
        expect(new Set(shapes).size).toBe(4);
        // 問題文と矢印の向きが一致し、演出のカメラも同じ向きへ動く
        expect(q.question).toContain({ front: '正面', right: '右', top: '真上' }[dir]);
        expect(q.explanation.reveal.steps[0].direction).toEqual(STRAIGHT_VIEWS[dir]);
      }
    }
    expect(questionsOf('V02').every((q) => q.scene.arrows[0] === 'top')).toBe(true);
  });

  it('誤答には「左右の反転」などの考えちがいが入る', () => {
    const reasons = questionsOf('V01').flatMap((q) => q.choices.filter((c) => c.id !== 'correct').map((c) => c.description));
    expect(reasons.some((r) => r.includes('左右が反対'))).toBe(true);
    expect(reasons.some((r) => r.includes('奥にあるブロックを見落として'))).toBe(true);
    expect(reasons.some((r) => r.includes('高さがちがいます'))).toBe(true);
  });
});

describe('正面図と右側面図の組み合わせ（V03）', () => {
  it('両方正しいのは1つだけで、片方だけ正しい選択肢がある', () => {
    for (const q of questionsOf('V03')) {
      const front = getShapeKey(getProjection(q.scene.blocks, 'front'));
      const right = getShapeKey(getProjection(q.scene.blocks, 'right'));
      const status = q.choices.map((c) => {
        const [f, r] = c.visual.items.map((i) => getShapeKey(i.projection));
        return `${f === front ? 'F' : '-'}${r === right ? 'R' : '-'}`;
      });
      expect(status.filter((s) => s === 'FR')).toHaveLength(1);
      expect(status).toContain('F-');
      expect(status).toContain('-R');
      expect(q.choices.find((c) => c.id === 'both').visual.items.map((i) => i.caption)).toEqual(['正面図', '右側面図']);
      expect(q.scene.arrows).toEqual(['front', 'right']);
    }
  });
});

describe('指定方向からの高さ（V04）', () => {
  it('答えはその向きから見た左から k 列目の高さで、強調する小立方体はその列のもの', () => {
    for (const q of questionsOf('V04')) {
      const [dir] = q.scene.arrows;
      const k = Number(q.question.match(/左から(\d+)列目/)[1]);
      const heights = columnHeights(getProjection(q.scene.blocks, dir));
      expect(q.correctAnswers).toEqual([String(heights[k - 1])]);
      const highlight = q.explanation.reveal.steps.find((s) => s.type === 'highlightBlocks').cubes;
      const { depth: D } = getBlockBounds(q.scene.blocks);
      for (const c of highlight) expect(dir === 'front' ? c.x === k - 1 : c.z === D - k).toBe(true);
      expect(Math.max(...highlight.map((c) => c.y)) + 1).toBe(heights[k - 1]);
      expect(q.choices.every((c) => /^[1-5]マス$/.test(c.label))).toBe(true);
    }
  });
});

describe('3方向の図から立体を推理（V05）', () => {
  it('3方向の図に合う積み木は選択肢の中で正解だけ', () => {
    for (const q of questionsOf('V05')) {
      const target = q.scene.preview.items.map((i) => getShapeKey(i.projection));
      expect(q.scene.preview.items.map((i) => i.caption)).toEqual(['正面図', '右側面図', '上面図']);
      // 回答前の図は、正解の積み木の3方向の図
      expect(target).toEqual(['front', 'right', 'top'].map((d) => getShapeKey(getProjection(q.scene.blocks, d))));
      const matching = q.choices.filter((c) =>
        ['front', 'right', 'top'].every((d, i) => getShapeKey(getProjection(c.visual.cubes, d)) === target[i]),
      );
      expect(matching.map((c) => c.id)).toEqual(['correct']);
      expect(blocksKey(q.choices.find((c) => c.id === 'correct').visual.cubes)).toBe(blocksKey(q.scene.blocks));
      // 選択肢の積み木も見取図で読み取れる
      for (const c of q.choices) expect(isBlockStructureReadable(c.visual.cubes)).toBe(true);
    }
  });
});

describe('ありえない投影図（V06）', () => {
  it('積み木と合わない図は1つだけで、それが正解', () => {
    for (const q of questionsOf('V06')) {
      const wrong = q.choices.filter((c) => getShapeKey(c.visual.projection) !== getShapeKey(getProjection(q.scene.blocks, c.id)));
      expect(wrong.map((c) => c.id)).toEqual(q.correctAnswers);
      // 図には見た方向を書いてある
      for (const c of q.choices) expect(c.visual.caption).toMatch(/見た図$/);
      expect(q.explanation.reveal.steps[0].direction).toEqual(STRAIGHT_VIEWS[q.correctAnswers[0]]);
    }
  });
});

describe('連続出題', () => {
  it('すべての難易度で 100 問、正しい形', () => {
    for (const difficulty of [1, 2, 3, 'all']) {
      const picker = new QuestionPicker({ templates: PROJECTION_TEMPLATES, difficulty, rng: createRng(5) });
      for (let i = 0; i < 100; i++) expect(getQuestionErrors(picker.next())).toEqual([]);
    }
  });
});

describe('「正面」の文字（矢印のない積み木の図だけ）', () => {
  const blockFigures = (q) => [q.scene.preview, ...(q.visuals ?? []), ...q.choices.map((c) => c.visual)].filter((v) => v?.type === 'blocks');
  it('矢印のある図（V01〜V04）にはつけず、矢印のない図（V05 の選択肢・V06 の見取図）にはつける', () => {
    for (const t of PROJECTION_TEMPLATES) {
      for (const q of questionsOf(t.id)) {
        for (const v of blockFigures(q)) expect(Boolean(v.showFront)).toBe(v.arrows.length === 0);
      }
    }
    for (const q of questionsOf('V05')) expect(q.choices.every((c) => c.visual.showFront)).toBe(true);
    for (const q of questionsOf('V06')) expect(q.scene.preview.showFront).toBe(true);
    for (const id of ['V01', 'V02', 'V03', 'V04']) for (const q of questionsOf(id)) expect(q.scene.preview.showFront).toBeUndefined();
  });
});
