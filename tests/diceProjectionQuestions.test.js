import { describe, it, expect } from 'vitest';
import { DICE_TEMPLATES } from '../src/questions/dice/diceGenerators.js';
import { PROJECTION_TEMPLATES } from '../src/questions/projection/projectionGenerators.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { QuestionPicker, TrainingSession } from '../src/core/questionEngine.js';
import { createRng } from '../src/utils/random.js';
import { rotateOrientation, rotateOrientationSequence, isValidOrientation } from '../src/core/cubeOrientation.js';
import { rotateLabeling, DIRECTIONS, DIRECTION_VECTORS, MOVE_IDS } from '../src/core/cubeRotations.js';
import { sequenceMatrix } from '../src/core/cubeOrientation.js';
import { byDirection, arrowAsSeen } from '../src/core/cubeFaceLabels.js';
import { solveUnique, canMatchView, canSatisfyConditions, viewOf, viewKey } from '../src/core/cubePuzzle.js';
import { movesPhrase } from '../src/questions/dice/diceExplanations.js';

const SEEDS = [1, 2, 3];
const ALL = [...DICE_TEMPLATES, ...PROJECTION_TEMPLATES];
const byId = Object.fromEntries(ALL.map((t) => [t.id, t]));

/** すべての基準 × いくつかのシードで問題を作る */
function generate(template) {
  const out = [];
  for (const seed of SEEDS) {
    const rng = createRng(seed);
    for (const base of template.bases()) out.push({ base, q: { ...template.build(base, rng), id: 'test' } });
  }
  return out;
}

const cache = new Map();
const questionsOf = (id) => {
  if (!cache.has(id)) cache.set(id, generate(byId[id]));
  return cache.get(id);
};

/** 装飾 → 値（数字・色 ID） */
const values = (faces) => Object.fromEntries(Object.entries(faces).map(([f, d]) => [f, d.value]));
/** 3D と同じ情報：はじめの向きで見えている3面（方向 → 値） */
const visibleOf = (q) => {
  const byDir = byDirection(values(q.scene.faces), q.scene.orientation);
  return { top: byDir.top, front: byDir.front, right: byDir.right };
};
const fullOf = (q) => byDirection(values(q.scene.faces), q.scene.orientation);
const hasRule = (q) => q.question.includes('向かい合う面の数の和が7');
const hasHiddenList = (q) => (q.visuals ?? []).some((v) => v.type === 'faceList');
const movesOf = (q) => q.visuals.find((v) => v.type === 'moves')?.moves.map((m) => m.id);
const ASKED = { 上の面: 'top', 前の面: 'front', 右の面: 'right' };
const askedOf = (q) => ASKED[Object.keys(ASKED).find((k) => q.question.includes(`${k}の数字`))];

describe('D01〜D06・V01〜V06 の生成', () => {
  it('テンプレートと難易度', () => {
    expect(DICE_TEMPLATES.map((t) => `${t.id}:${t.difficulty}`)).toEqual(['D01:1', 'D02:1', 'D03:2', 'D04:2', 'D05:3', 'D06:3']);
    expect(PROJECTION_TEMPLATES.map((t) => `${t.id}:${t.difficulty}`)).toEqual(['V01:1', 'V02:1', 'V03:2', 'V04:2', 'V05:3', 'V06:3']);
  });

  describe.each(ALL.map((t) => [t.id]))('%s', (id) => {
    it('すべての基準・シードで正しい形の問題ができる', () => {
      for (const { q } of questionsOf(id)) expect(getQuestionErrors(q)).toEqual([]);
    });

    it('正解は選択肢に含まれ、1つだけで、選択肢と図に重複がない', () => {
      for (const { q } of questionsOf(id)) {
        const ids = q.choices.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(q.correctAnswers).toHaveLength(1);
        expect(ids).toContain(q.correctAnswers[0]);
        expect(ids.length).toBeGreaterThanOrEqual(4);
        const cubeChoices = q.choices.filter((c) => c.visual?.type === 'cube');
        const keys = cubeChoices.map((c) => viewKey(viewOf(byDirection(values(c.visual.faces), c.visual.orientation))));
        expect(new Set(keys).size).toBe(keys.length);
      }
    });

    it('3D の設定：装飾・向きが正しく、回答前は視点を回せない', () => {
      for (const { q } of questionsOf(id)) {
        expect(isValidOrientation(q.scene.orientation)).toBe(true);
        expect(Object.keys(q.scene.faces)).toHaveLength(6);
        expect(q.scene.showLabels).toBe(false);
        expect(q.scene.interaction).toEqual({ allowCameraRotationBeforeAnswer: false, allowZoomBeforeAnswer: true, allowCameraRotationAfterAnswer: true });
        expect(q.explanation.reveal.steps.length).toBeGreaterThan(0);
      }
    });

    it('図の選択肢の見取図は、正しい向きと装飾のデータをもつ', () => {
      for (const { q } of questionsOf(id)) {
        for (const c of q.choices) {
          if (c.visual?.type !== 'cube') continue;
          expect(isValidOrientation(c.visual.orientation)).toBe(true);
          expect(Object.keys(c.visual.faces)).toHaveLength(6);
          expect(c.labelByPosition).toBe(true);
        }
      }
    });
  });
});

describe('サイコロ：正解が数学的に正しく、提示した情報だけで一意に決まる', () => {
  it.each(['D01', 'D03', 'D04', 'D06'])('%s', (id) => {
    for (const { q } of questionsOf(id)) {
      const moves = movesOf(q);
      const asked = askedOf(q);
      expect(q.question).toContain(movesPhrase(moves));
      // 正解 = 回転後の向きで、その方向にある面の数字
      const final = rotateOrientationSequence(q.scene.orientation, moves);
      expect(q.correctAnswers).toEqual([String(q.scene.faces[final[asked]].value)]);
      // 正解演出の回転は問題の手順と同じ
      expect(q.explanation.reveal.steps[0].moves).toEqual(moves);
      // 提示した情報（見えている3面 ＋ ルール文 または 見えない面の一覧）だけで答えが1つに決まる
      const info = { values: [1, 2, 3, 4, 5, 6], known: hasHiddenList(q) ? fullOf(q) : visibleOf(q), oppositeSum: hasRule(q) ? 7 : null };
      const m = sequenceMatrix(moves);
      const result = solveUnique(info, (l) => rotateLabeling(l, m)[asked]);
      expect(result.unique).toBe(true);
      expect(result.answers).toEqual([q.scene.faces[final[asked]].value]);
    }
  });

  it('D03 は、はじめ見えていなかった面を問う（ルールか一覧が必ず示される）', () => {
    for (const { q } of questionsOf('D03')) expect(hasRule(q) || hasHiddenList(q)).toBe(true);
  });

  it('すべてのサイコロが通常配置とは限らない（ランダム配置では和7のルールを使わない）', () => {
    const qs = questionsOf('D01').map(({ q }) => q);
    const nonStandard = qs.filter((q) => {
      const v = values(q.scene.faces);
      return v.EFGH + v.ABCD !== 7 || v.ABFE + v.CDHG !== 7 || v.BCGF + v.DAEH !== 7;
    });
    expect(nonStandard.length).toBeGreaterThan(0);
    for (const q of nonStandard) expect(hasRule(q)).toBe(false);
  });

  it('D02：別の向きの図を合わせると、向かい合う面が1つに決まる', () => {
    for (const { q } of questionsOf('D02')) {
      const [first, ...others] = q.visuals.filter((v) => v.type === 'cube');
      expect(first.orientation).toEqual(q.scene.orientation);
      const known = visibleOf(q);
      const views = others.map((v) => viewOf(byDirection(values(v.faces), v.orientation)));
      const targetLabel = q.question.match(/^(.+?)の面と向かい合う/)[1];
      const targetDir = DIRECTIONS.find((d) => q.scene.faces[q.scene.orientation[d]].label === targetLabel);
      const opposite = { top: 'bottom', front: 'back', right: 'left' }[targetDir];
      const result = solveUnique({ values: Object.values(values(q.scene.faces)), known, views }, (l) => l[opposite]);
      expect(result.unique).toBe(true);
      expect(result.answers).toEqual(q.correctAnswers);
    }
  });

  it('D05：正解の図だけが回転で一致し、鏡映しなどは一致しない', () => {
    for (const { q } of questionsOf('D05')) {
      expect(hasRule(q)).toBe(true);
      const full = fullOf(q);
      for (const c of q.choices) {
        const view = viewOf(byDirection(values(c.visual.faces), c.visual.orientation));
        expect(canMatchView(full, view)).toBe(c.id === 'same');
      }
      const path = q.explanation.reveal.steps[0].moves;
      const correct = q.choices.find((c) => c.id === 'same').visual.orientation;
      expect(rotateOrientationSequence(q.scene.orientation, path)).toEqual(correct);
    }
  });
});

describe('見え方：正解が数学的に正しい', () => {
  it.each(['V01', 'V02'])('%s：答えの方向の面の色で、その面はカメラから見えている', (id) => {
    for (const { q } of questionsOf(id)) {
      const dir = DIRECTIONS.find((d) => q.scene.faces[q.scene.orientation[d]].value === q.correctAnswers[0]);
      const cam = q.scene.cameraPreset;
      const v = DIRECTION_VECTORS[dir];
      expect(v[0] * cam[0] + v[1] * cam[1] + v[2] * cam[2]).toBeGreaterThan(0);
      expect(q.question).toContain({ top: '真上', bottom: '真下', front: '正面', back: '後ろ', right: '右側', left: '左側' }[dir]);
      expect(q.visuals[0].viewDirection).toEqual(cam);
    }
  });

  it('V03：矢印の見え方が向きの計算と一致する', () => {
    for (const { q } of questionsOf('V03')) {
      const dir = q.question.includes('真上') ? 'top' : q.question.includes('正面') ? 'front' : 'right';
      const face = q.scene.orientation[dir];
      expect(q.correctAnswers).toEqual([arrowAsSeen(face, q.scene.faces[face].arrow, q.scene.orientation, dir)]);
      expect(q.choices.map((c) => c.id).sort()).toEqual(['down', 'left', 'right', 'up']);
    }
  });

  it('V04：正解の図は回転後の向き、ほかは別の向き', () => {
    for (const { q } of questionsOf('V04')) {
      const move = q.correctAnswers[0];
      expect(MOVE_IDS).toContain(move);
      const correct = q.choices.find((c) => c.id === move);
      expect(correct.visual.orientation).toEqual(rotateOrientation(q.scene.orientation, move));
      expect(q.explanation.reveal.steps[0].moves).toEqual([move]);
      expect(hasHiddenList(q)).toBe(true);
    }
  });

  it('V05：条件どおりに置けるのは正解だけ（鏡映しは置けない）', () => {
    for (const { q } of questionsOf('V05')) {
      const cond = visibleOf(q);
      for (const c of q.choices) {
        const view = viewOf(byDirection(values(c.visual.faces), c.visual.orientation));
        expect(canSatisfyConditions(view, cond)).toBe(c.id === 'match');
      }
    }
  });

  it('V06：回転で作れない図は1つだけで、それが正解', () => {
    for (const { q } of questionsOf('V06')) {
      const full = fullOf(q);
      const impossible = q.choices.filter((c) => !canMatchView(full, viewOf(byDirection(values(c.visual.faces), c.visual.orientation))));
      expect(impossible.map((c) => c.id)).toEqual(q.correctAnswers);
      // 演出は、作れる3つの向きを順番に見せる
      let o = q.scene.orientation;
      const reached = q.explanation.reveal.steps.map((s) => (o = rotateOrientationSequence(o, s.moves)));
      for (const r of reached) {
        expect(q.choices.some((c) => c.id !== 'mirror' && viewKey(viewOf(byDirection(values(c.visual.faces), c.visual.orientation))) === viewKey(viewOf(byDirection(values(q.scene.faces), r))))).toBe(true);
      }
    }
  });
});

describe('エンジンでの連続出題（乱数を固定して大量に検証）', () => {
  it.each(['dice', 'projection'])('%s：すべての難易度で200問、正しい形・3連続なし', (category) => {
    const templates = category === 'dice' ? DICE_TEMPLATES : PROJECTION_TEMPLATES;
    for (const difficulty of [1, 2, 3, 'all']) {
      const picker = new QuestionPicker({ templates, difficulty, rng: createRng(42) });
      const qs = Array.from({ length: 200 }, () => picker.next());
      for (const q of qs) expect(getQuestionErrors(q)).toEqual([]);
      for (let i = 2; i < qs.length; i++) expect(qs[i].templateId === qs[i - 1].templateId && qs[i].templateId === qs[i - 2].templateId).toBe(false);
      // 図の選択肢には、並べ替えたあとの位置でア・イ・ウ・エが付く
      for (const q of qs) {
        const marks = q.choices.filter((c) => c.labelByPosition).map((c) => c.label);
        if (marks.length > 0) expect(marks).toEqual(['ア', 'イ', 'ウ', 'エ'].slice(0, marks.length));
      }
    }
  });

  it('5問のトレーニングを最後まで解ける', () => {
    const session = new TrainingSession({ category: 'dice', templates: DICE_TEMPLATES, questionLimit: 5, rng: createRng(7) });
    while (session.hasNextQuestion()) {
      const q = session.nextQuestion();
      expect(session.submit(q.correctAnswers).isCorrect).toBe(true);
    }
    expect(session.getSummary()).toMatchObject({ answeredCount: 5, correctCount: 5 });
  });

});
