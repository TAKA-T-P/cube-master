// 展開図と頂点・辺（N01〜N06）・展開図パズル（C01〜C06）の問題生成
import { describe, it, expect } from 'vitest';
import { NET_MAPPING_TEMPLATES } from '../src/questions/netMapping/netMappingGenerators.js';
import { NET_PUZZLE_TEMPLATES } from '../src/questions/netPuzzle/netPuzzleGenerators.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { QuestionPicker } from '../src/core/questionEngine.js';
import { foldNet } from '../src/core/cubeNetFolding.js';
import { getNetMapping, getCoincidentPoints, getCoincidentSegments, getOppositeCell, getCubeNeighborCells } from '../src/core/cubeNetMapping.js';
import { makeCells, getCanonicalNetKey, getShapeKey, isNetConnected, parseSegmentKey } from '../src/core/cubeNet.js';
import { CUBE_NETS, identifyCubeNet } from '../src/core/cubeNetCatalog.js';
import { byDirection } from '../src/core/cubeFaceLabels.js';
import { viewOf, canMatchView } from '../src/core/cubePuzzle.js';
import { INITIAL_ORIENTATION } from '../src/core/cubeOrientation.js';
import { getCategory } from '../src/questions/questionRegistry.js';
import { createRng } from '../src/utils/random.js';

const ALL = [...NET_MAPPING_TEMPLATES, ...NET_PUZZLE_TEMPLATES];
const byId = Object.fromEntries(ALL.map((t) => [t.id, t]));
const cache = new Map();
function questionsOf(id) {
  if (!cache.has(id)) {
    const out = [];
    for (const seed of [1, 2, 3]) {
      const rng = createRng(seed);
      for (const base of byId[id].bases()) out.push({ ...byId[id].build(base, rng), id: 'test' });
    }
    cache.set(id, out);
  }
  return cache.get(id);
}
const cellsOfVisual = (v) => makeCells(v.cells.map((c) => [c.x, c.y]));
const pointLabels = (preview) => Object.fromEntries(preview.points.map((p) => [p.label, `${p.x},${p.y}`]));

describe('カテゴリとテンプレート', () => {
  it('2カテゴリと N01〜N06・C01〜C06', () => {
    expect(getCategory('netMapping')).toMatchObject({ name: '展開図と頂点・辺', enabled: true });
    expect(getCategory('netPuzzle')).toMatchObject({ name: '展開図パズル', enabled: true });
    expect(NET_MAPPING_TEMPLATES.map((t) => `${t.id}:${t.difficulty}`)).toEqual(['N01:1', 'N02:1', 'N03:2', 'N04:2', 'N05:3', 'N06:3']);
    expect(NET_PUZZLE_TEMPLATES.map((t) => `${t.id}:${t.difficulty}`)).toEqual(['C01:1', 'C02:1', 'C03:2', 'C04:2', 'C05:3', 'C06:3']);
  });
});

describe.each(ALL.map((t) => [t.id]))('%s 共通', (id) => {
  it('すべての基準・シードで正しい形の問題ができる', () => {
    for (const q of questionsOf(id)) expect(getQuestionErrors(q)).toEqual([]);
  });

  it('正解はすべて選択肢に含まれ、選択肢は重ならない', () => {
    for (const q of questionsOf(id)) {
      const ids = q.choices.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(q.choices.map((c) => c.label)).size).toBe(ids.length);
      for (const a of q.correctAnswers) expect(ids).toContain(a);
      expect(q.correctAnswers.length).toBeLessThan(ids.length);
      if (q.type === 'single') expect(q.correctAnswers).toHaveLength(1);
      else expect(q.question).toContain('すべて選びなさい');
    }
  });

  it('回答後に 3D で折りたたむ展開図は立方体の展開図で、回答前は 3D を出さない', () => {
    for (const q of questionsOf(id)) {
      expect(foldNet(q.scene.net.cells).valid).toBe(true);
      expect(q.scene.interaction.allowCameraRotationBeforeAnswer).toBe(false);
      expect(q.explanation.reveal.steps.some((s) => s.type === 'fold' && s.to === 1)).toBe(true);
    }
  });
});

describe('展開図と頂点・辺：正解が折りたたみの対応と一致する', () => {
  it('N01：点Aと重なる点', () => {
    for (const q of questionsOf('N01')) {
      const cells = cellsOfVisual(q.scene.preview);
      const m = getNetMapping(cells);
      const a = pointLabels(q.scene.preview).A;
      expect(q.correctAnswers.sort()).toEqual(getCoincidentPoints(m, a).sort());
      expect(q.correctAnswers.length).toBeGreaterThan(0);
      // 3D の印：点Aと答えの点（折ると同じ位置に集まる）
      expect(q.scene.net.points).toHaveLength(q.correctAnswers.length + 1);
    }
  });

  it('N02：向かい合う面', () => {
    for (const q of questionsOf('N02')) {
      const cells = cellsOfVisual(q.scene.preview);
      const m = getNetMapping(cells);
      const labels = q.scene.preview.cellLabels;
      const target = Object.keys(labels).find((id) => q.question.includes(`面${labels[id]}と向かい合う`));
      expect(q.correctAnswers).toEqual([getOppositeCell(m, target)]);
    }
  });

  it('N03：辺と重なる辺（問題文の辺の名前と図の点のラベルが合う）', () => {
    for (const q of questionsOf('N03')) {
      const cells = cellsOfVisual(q.scene.preview);
      const m = getNetMapping(cells);
      const labels = pointLabels(q.scene.preview);
      const [, name] = q.question.match(/辺([A-N]{2})と重なる/);
      const ends = [...name].map((l) => labels[l]).sort();
      const target = [...m.segments.values()].find((s) => s.ends.map(([x, y]) => `${x},${y}`).sort().join() === ends.join()).key;
      expect(q.correctAnswers).toEqual(getCoincidentSegments(m, target));
    }
  });

  it('N04：組み立て後にとなり合う面は4つ', () => {
    for (const q of questionsOf('N04')) {
      const cells = cellsOfVisual(q.scene.preview);
      const m = getNetMapping(cells);
      const labels = q.scene.preview.cellLabels;
      const target = Object.keys(labels).find((id) => q.question.includes(`面${labels[id]}と辺を共有`));
      expect(q.correctAnswers.sort()).toEqual(getCubeNeighborCells(m, target).sort());
      expect(q.correctAnswers).toHaveLength(4);
    }
  });

  it('N05：組み立てた立方体と合う図は正解だけ（鏡映しなどは合わない）', () => {
    for (const q of questionsOf('N05')) {
      const cells = cellsOfVisual(q.scene.preview);
      const m = getNetMapping(cells);
      const byFace = Object.fromEntries(Object.entries(q.scene.preview.cellFaces).map(([id, f]) => [m.cellToFace[id], f.value]));
      const full = byDirection(byFace, INITIAL_ORIENTATION);
      for (const c of q.choices) {
        const values = Object.fromEntries(Object.entries(c.visual.faces).map(([f, d]) => [f, d.value]));
        const view = viewOf(byDirection(values, c.visual.orientation));
        expect(canMatchView(full, view)).toBe(c.id === 'correct');
      }
    }
  });

  it('N06：点Aと同じ頂点を端にもつ辺', () => {
    for (const q of questionsOf('N06')) {
      const cells = cellsOfVisual(q.scene.preview);
      const m = getNetMapping(cells);
      const vertex = m.points.get(pointLabels(q.scene.preview).A).vertex;
      for (const c of q.choices) {
        const touches = parseSegmentKey(c.id).some(([x, y]) => m.points.get(`${x},${y}`).vertex === vertex);
        expect(q.correctAnswers.includes(c.id)).toBe(touches);
      }
    }
  });
});

describe('展開図パズル：正解が成立判定と一致する', () => {
  it('C01：立方体になる展開図だけが正解（1〜3個）。ならない図には重なるマスの印', () => {
    for (const q of questionsOf('C01')) {
      expect(q.correctAnswers.length).toBeGreaterThanOrEqual(1);
      expect(q.correctAnswers.length).toBeLessThanOrEqual(3);
      for (const c of q.choices) {
        const valid = foldNet(cellsOfVisual(c.visual)).valid;
        expect(q.correctAnswers.includes(c.id)).toBe(valid);
        if (!valid) expect(c.visual.conflicts.length).toBeGreaterThan(0);
      }
    }
  });

  it('C02・C04：候補の場所に置くと立方体になるものが正解', () => {
    for (const id of ['C02', 'C04']) {
      for (const q of questionsOf(id)) {
        const p = q.scene.preview;
        const base = p.cells.filter((c) => !(p.marked ?? []).includes(c.id)).map((c) => [c.x, c.y]);
        for (const cand of p.candidates) {
          const ok = foldNet(makeCells([...base, [cand.x, cand.y]])).valid;
          expect(q.correctAnswers.includes(cand.label)).toBe(ok);
        }
        if (id === 'C04') {
          // 動かす前の形は、つながっているが立方体にならない
          const before = makeCells(p.cells.map((c) => [c.x, c.y]));
          expect(isNetConnected(before)).toBe(true);
          expect(foldNet(before).valid).toBe(false);
        }
      }
    }
  });

  it('C03：取ると立方体になるマスが正解', () => {
    for (const q of questionsOf('C03')) {
      const seven = q.scene.preview.cells;
      expect(seven).toHaveLength(7);
      for (const c of seven) {
        const rest = makeCells(seven.filter((d) => d.id !== c.id).map((d) => [d.x, d.y]));
        expect(q.correctAnswers.includes(c.id)).toBe(isNetConnected(rest) && foldNet(rest).valid);
      }
    }
  });

  it('C05：同じ種類（回転・裏返し）は正解だけで、向きはもとの図とちがう', () => {
    for (const q of questionsOf('C05')) {
      const target = cellsOfVisual(q.scene.preview);
      for (const c of q.choices) {
        const cells = cellsOfVisual(c.visual);
        expect(getCanonicalNetKey(cells) === getCanonicalNetKey(target)).toBe(c.id === 'same');
        expect(foldNet(cells).valid).toBe(true);
      }
      expect(getShapeKey(cellsOfVisual(q.choices.find((c) => c.id === 'same').visual))).not.toBe(getShapeKey(target));
    }
  });

  it('C06：5つのうち種類がちがうのは1つだけ。ほかの4つは同じ種類で向きがすべてちがう', () => {
    for (const q of questionsOf('C06')) {
      expect(q.choices).toHaveLength(5);
      const keys = q.choices.map((c) => getCanonicalNetKey(cellsOfVisual(c.visual)));
      const odd = q.choices.filter((c, i) => keys.filter((k) => k === keys[i]).length === 1);
      expect(odd.map((c) => c.id)).toEqual(['odd']);
      const same = q.choices.filter((c) => c.id !== 'odd').map((c) => getShapeKey(cellsOfVisual(c.visual)));
      expect(new Set(same).size).toBe(4);
    }
  });
});

describe('出題のバランス', () => {
  it('11種類の展開図がかたよらずに出る（N01 を 55 問）', () => {
    const picker = new QuestionPicker({ templates: NET_MAPPING_TEMPLATES.filter((t) => t.id === 'N01'), rng: createRng(8) });
    const seen = new Set();
    for (let i = 0; i < 55; i++) {
      const q = picker.next();
      seen.add(identifyCubeNet(cellsOfVisual(q.scene.preview)).id);
    }
    expect(seen.size).toBe(CUBE_NETS.length);
  });

  it('すべての難易度で 60 問、正しい形', () => {
    for (const templates of [NET_MAPPING_TEMPLATES, NET_PUZZLE_TEMPLATES]) {
      for (const difficulty of [1, 2, 3, 'all']) {
        const picker = new QuestionPicker({ templates, difficulty, rng: createRng(4) });
        for (let i = 0; i < 60; i++) expect(getQuestionErrors(picker.next())).toEqual([]);
      }
    }
  });
});
