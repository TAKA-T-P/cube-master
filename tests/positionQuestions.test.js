import { describe, it, expect } from 'vitest';
import { POSITION_TEMPLATES } from '../src/questions/position/positionGenerators.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { validateAnswer } from '../src/core/answerValidator.js';
import { createRng } from '../src/utils/random.js';
import { elementLabel } from '../src/questions/questionUtils.js';
import * as R from '../src/core/cubeRelations.js';
import { resolveElement } from '../src/core/cubeGeometry.js';

const rng = createRng(20261015);
const byId = Object.fromEntries(POSITION_TEMPLATES.map((t) => [t.id, t]));

/** テンプレートのすべての基準で問題を作る */
const allQuestions = (template) => template.bases().map((base) => ({ base, q: { ...template.build(base, rng), id: 'test' } }));

/** 正解数の期待値（P10〜P12・P14・P15 は基準ごとに変わる） */
const EXPECTED_CORRECT_COUNT = { P01: 3, P02: 4, P03: 1, P04: 4, P05: 2, P06: 2, P07: 2, P08: 4, P09: 4, P10: 1, P11: 1, P13: 4, P14: 2, P15: 1 };

describe('位置関係テンプレート P01〜P15', () => {
  it('15種類あり、難易度の割り当てが仕様どおり', () => {
    expect(POSITION_TEMPLATES.map((t) => t.id)).toEqual(Array.from({ length: 15 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`));
    for (const t of POSITION_TEMPLATES) {
      const n = Number(t.id.slice(1));
      expect(t.difficulty).toBe(n <= 5 ? 1 : n <= 10 ? 2 : 3);
    }
  });

  describe.each(POSITION_TEMPLATES.map((t) => [t.id, t]))('%s', (id, template) => {
    const generated = allQuestions(template);

    it('すべての基準で、スキーマに合う問題を生成できる', () => {
      expect(generated.length).toBeGreaterThan(0);
      for (const { q } of generated) expect(getQuestionErrors(q)).toEqual([]);
    });

    it('正解がすべて選択肢に含まれ、選択肢・表示名に重複がない', () => {
      for (const { q } of generated) {
        const ids = q.choices.map((c) => c.id);
        for (const a of q.correctAnswers) expect(ids).toContain(a);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(q.choices.map((c) => c.label)).size).toBe(ids.length);
        expect(ids.length).toBeGreaterThanOrEqual(2);
        expect(ids.length).toBeLessThanOrEqual(6);
        // 正解を選べば正解と判定される
        expect(validateAnswer(q.correctAnswers, [...q.correctAnswers].reverse()).isCorrect).toBe(true);
      }
    });

    it('正解数が適切', () => {
      for (const { q } of generated) {
        if (EXPECTED_CORRECT_COUNT[id] !== undefined) expect(q.correctAnswers).toHaveLength(EXPECTED_CORRECT_COUNT[id]);
        else expect(q.correctAnswers.length).toBeGreaterThanOrEqual(1);
        if (q.type === 'single') expect(q.correctAnswers).toHaveLength(1);
      }
    });

    it('問題文に基準要素が含まれ、基準要素は選択肢（正解）にならない', () => {
      for (const { base, q } of generated) {
        expect(q.scene.referenceElements).toEqual(base.refs);
        for (const ref of q.scene.referenceElements) expect(q.question).toContain(elementLabel(ref));
        for (const c of q.choices) if (c.elementId) expect(q.scene.referenceElements).not.toContain(c.elementId);
        // 基準要素と正解の強調は重ならない
        for (const e of q.explanation.highlightElements) expect(q.scene.referenceElements).not.toContain(e);
        expect(q.key).toBe(`${id}:${base.key}`);
        expect(q.templateId).toBe(id);
      }
    });
  });
});

describe('正解が数学的な関係と一致する', () => {
  const check = (templateId, compute) => {
    for (const { base, q } of allQuestions(byId[templateId])) {
      expect([...q.correctAnswers].sort()).toEqual([...compute(base)].sort());
    }
  };

  it('P01〜P09・P13', () => {
    check('P01', (b) => R.getParallelEdges(b.edge));
    check('P02', (b) => R.getIntersectingEdges(b.edge));
    check('P03', (b) => R.getParallelFaces(b.face));
    check('P04', (b) => R.getPerpendicularFaces(b.face));
    check('P05', (b) => R.getFacesContainingEdge(b.edge));
    check('P06', (b) => R.getFacesParallelToEdge(b.edge));
    check('P07', (b) => R.getFacesPerpendicularToEdge(b.edge));
    check('P08', (b) => R.getSkewEdges(b.edge));
    check('P09', (b) => R.getEdgesPerpendicularToFace(b.face));
    check('P13', (b) => R.getSkewEdges(b.edge).filter((e) => !R.doEdgesIntersect(b.edge, e) && !R.areEdgesParallel(b.edge, e)));
  });

  it('P10：辺の組の関係', () => {
    check('P10', (b) => [R.classifyEdgePair(b.a, b.b)]);
    const relations = new Set(byId.P10.bases().map((b) => b.group));
    expect([...relations].sort()).toEqual(['intersecting', 'parallel', 'skew']);
  });

  it('P11：隣り合う2面に共通して垂直な辺はない・向かい合う2面には4本ある', () => {
    for (const { base, q } of allQuestions(byId.P11)) {
      const adjacent = R.areFacesPerpendicular(base.f, base.g);
      expect(q.correctAnswers).toEqual([adjacent ? 'none' : 'exists']);
    }
    expect(byId.P11.build({ key: 'x', refs: ['ABCD', 'ABFE'], f: 'ABCD', g: 'ABFE' }, rng).correctAnswers).toEqual(['none']);
  });

  it('P12：両方の辺と平行な面（なければ「あてはまる面はない」）', () => {
    check('P12', (b) => {
      const faces = R.getFacesParallelToEdge(b.a).filter((f) => R.getFacesParallelToEdge(b.b).includes(f));
      return faces.length > 0 ? faces : ['none'];
    });
  });

  it('P14：面ABCDに垂直で辺EFと交わる辺は AE・BF', () => {
    const q = byId.P14.build({ key: 'ABCD-EF', refs: ['ABCD', 'EF'], face: 'ABCD', edge: 'EF' }, rng);
    expect([...q.correctAnswers].sort()).toEqual(['AE', 'BF']);
    check('P14', (b) => R.getEdgesPerpendicularToFace(b.face).filter((e) => R.doEdgesIntersect(e, b.edge)));
  });

  it('P15：辺と面の関係', () => {
    check('P15', (b) => [R.classifyEdgeFace(b.edge, b.face)]);
  });
});

describe('選択肢の生成', () => {
  it('複数回答で正解が4つの問題は6択（正解4＋誤答2）', () => {
    for (const id of ['P02', 'P08', 'P09', 'P13']) {
      for (const { q } of allQuestions(byId[id])) expect(q.choices).toHaveLength(6);
    }
  });

  it('単一回答の要素問題は4択（正解1＋誤答3）', () => {
    for (const { q } of allQuestions(byId.P03)) expect(q.choices).toHaveLength(4);
  });

  it('立方体の要素の選択肢は elementId を持ち、文章の選択肢は持たない', () => {
    for (const { q } of allQuestions(byId.P01)) for (const c of q.choices) expect(resolveElement(c.elementId).id).toBe(c.id);
    for (const { q } of allQuestions(byId.P15)) for (const c of q.choices) expect(c.elementId).toBeUndefined();
  });

  it('P14 は片方の条件だけを満たす辺を誤答に入れる', () => {
    const q = byId.P14.build({ key: 'ABCD-EF', refs: ['ABCD', 'EF'], face: 'ABCD', edge: 'EF' }, rng);
    const ids = q.choices.map((c) => c.id);
    // CG・DH（面に垂直だが EF と交わらない）、FG・HE（EF と交わるが面に垂直でない）
    for (const id of ['CG', 'DH', 'FG', 'HE']) expect(ids).toContain(id);
  });
});
