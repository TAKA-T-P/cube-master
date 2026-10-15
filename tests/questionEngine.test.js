import { describe, it, expect } from 'vitest';
import { QuestionPicker, TrainingSession, shuffleChoices, ENDLESS } from '../src/core/questionEngine.js';
import { POSITION_TEMPLATES } from '../src/questions/position/positionGenerators.js';
import { getTemplates, getCategory, CATEGORIES } from '../src/questions/questionRegistry.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { createRng } from '../src/utils/random.js';

const run = (picker, n) => Array.from({ length: n }, () => picker.next());

describe('QuestionPicker', () => {
  it('難易度別に抽出する', () => {
    for (const level of [1, 2, 3]) {
      const qs = run(new QuestionPicker({ templates: POSITION_TEMPLATES, difficulty: level, rng: createRng(level) }), 30);
      expect(qs.every((q) => q.difficulty === level)).toBe(true);
      // その難易度の5テンプレートがすべて出る
      expect(new Set(qs.map((q) => q.templateId)).size).toBe(5);
    }
  });

  it('「すべて」は各難易度からバランスよく出題する', () => {
    const qs = run(new QuestionPicker({ templates: POSITION_TEMPLATES, rng: createRng(7) }), 30);
    const count = (d) => qs.filter((q) => q.difficulty === d).length;
    expect([count(1), count(2), count(3)]).toEqual([10, 10, 10]);
    expect(new Set(qs.map((q) => q.templateId)).size).toBe(15);
  });

  it('生成した問題はすべて正しい形で、id が一意', () => {
    const qs = run(new QuestionPicker({ templates: POSITION_TEMPLATES, rng: createRng(1) }), 60);
    for (const q of qs) expect(getQuestionErrors(q)).toEqual([]);
    expect(new Set(qs.map((q) => q.id)).size).toBe(60);
  });

  it('同じテンプレートが3問以上連続しない（いろいろなシードで確認）', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const difficulty of [1, 2, 3, 'all']) {
        const qs = run(new QuestionPicker({ templates: POSITION_TEMPLATES, difficulty, rng: createRng(seed) }), 40);
        for (let i = 2; i < qs.length; i++) {
          expect(qs[i].templateId === qs[i - 1].templateId && qs[i].templateId === qs[i - 2].templateId).toBe(false);
        }
      }
    }
  });

  it('テンプレートが1つしかなくても出題でき、基準要素の重複が一巡するまで起きない', () => {
    const p01 = POSITION_TEMPLATES.filter((t) => t.id === 'P01');
    const picker = new QuestionPicker({ templates: p01, rng: createRng(3) });
    const first = run(picker, 12);
    expect(new Set(first.map((q) => q.key)).size).toBe(12); // 12辺すべて別の基準
    // 直前と同じ基準要素は続かない
    for (let i = 1; i < first.length; i++) expect(first[i].key).not.toBe(first[i - 1].key);
    // 一巡後は再出題を許可（エンドレス）
    const second = run(picker, 12);
    expect(new Set(second.map((q) => q.key)).size).toBe(12);
  });

  it('答えの種類（group）が偏らない', () => {
    const p11 = POSITION_TEMPLATES.filter((t) => t.id === 'P11');
    const qs = run(new QuestionPicker({ templates: p11, rng: createRng(5) }), 6);
    const exists = qs.filter((q) => q.correctAnswers[0] === 'exists').length;
    expect(exists).toBe(3);
  });

  it('選択肢をシャッフルし、fixed の選択肢は末尾に固定する', () => {
    const choices = [
      { id: 'a', label: 'a' },
      { id: 'b', label: 'b' },
      { id: 'c', label: 'c' },
      { id: 'none', label: 'なし', fixed: true },
    ];
    const orders = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      const out = shuffleChoices(choices, createRng(seed));
      expect(out.at(-1).id).toBe('none');
      expect(out.map((c) => c.id).sort()).toEqual(['a', 'b', 'c', 'none']);
      orders.add(out.map((c) => c.id).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('該当する問題がない難易度はエラー', () => {
    expect(() => new QuestionPicker({ templates: [], difficulty: 1 })).toThrow();
  });
});

describe('TrainingSession', () => {
  const create = (opts = {}) => new TrainingSession({ category: 'position', templates: POSITION_TEMPLATES, rng: createRng(11), ...opts });

  it('規定数を解くと終了し、正解数・正答率を集計する', () => {
    const s = create({ questionLimit: 5 });
    expect(s.state).toMatchObject({ currentIndex: 0, answeredCount: 0, correctCount: 0, currentQuestion: null, answerLocked: false });
    for (let i = 0; i < 5; i++) {
      const q = s.nextQuestion();
      expect(s.questionNumber).toBe(i + 1);
      // 偶数番目は正解、奇数番目は不正解を答える
      const answer = i % 2 === 0 ? q.correctAnswers : q.choices.filter((c) => !q.correctAnswers.includes(c.id)).map((c) => c.id).slice(0, 1);
      const r = s.submit(answer);
      expect(r.isCorrect).toBe(i % 2 === 0);
      expect(s.state.answerLocked).toBe(true);
    }
    expect(s.isComplete()).toBe(true);
    expect(s.nextQuestion()).toBeNull();
    const summary = s.getSummary();
    expect(summary).toMatchObject({ answeredCount: 5, correctCount: 3, questionLimit: 5 });
    expect(summary.accuracy).toBeCloseTo(0.6);
    expect(summary.history.map((h) => h.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('回答のロック：二重回答・未回答で次へ・未選択の回答はエラー', () => {
    const s = create();
    const q = s.nextQuestion();
    expect(() => s.nextQuestion()).toThrow();
    expect(() => s.submit([])).toThrow();
    s.submit(q.correctAnswers);
    expect(() => s.submit(q.correctAnswers)).toThrow();
    expect(s.state.correctCount).toBe(1);
  });

  it('おしい（一部正解）は正解数に入らない', () => {
    const s = create({ difficulty: 1 });
    let q = s.nextQuestion();
    while (q.type !== 'multiple' || q.correctAnswers.length < 2) {
      s.submit(q.correctAnswers);
      q = s.nextQuestion();
    }
    const before = s.state.correctCount;
    const r = s.submit(q.correctAnswers.slice(1));
    expect(r.status).toBe('partial');
    expect(s.state.correctCount).toBe(before);
  });

  it('エンドレスは finish() するまで続き、途中終了でも回答済み分を集計する', () => {
    const s = create({ questionLimit: ENDLESS });
    for (let i = 0; i < 25; i++) {
      const q = s.nextQuestion();
      s.submit(q.correctAnswers);
    }
    expect(s.hasNextQuestion()).toBe(true);
    s.nextQuestion(); // 回答しないまま終了
    const summary = s.finish();
    expect(summary).toMatchObject({ answeredCount: 25, correctCount: 25, accuracy: 1 });
    expect(s.hasNextQuestion()).toBe(false);
  });

  it('無効な問題数はエラー', () => {
    expect(() => create({ questionLimit: 0 })).toThrow();
    expect(() => create({ questionLimit: 'many' })).toThrow();
  });
});

describe('questionRegistry', () => {
  it('10カテゴリがあり、Phase 1 で遊べるのは位置関係だけ', () => {
    expect(CATEGORIES).toHaveLength(10);
    expect(CATEGORIES.filter((c) => c.enabled).map((c) => c.id)).toEqual(['position']);
    expect(getCategory('position')).toMatchObject({ name: '位置関係', grades: '小学6年生～中学1年生' });
    expect(getTemplates('position', 2).map((t) => t.id)).toEqual(['P06', 'P07', 'P08', 'P09', 'P10']);
    expect(getTemplates('dice')).toEqual([]);
  });
});
