// 全75テンプレートの総点検（乱数のシードを変えて多数の問題を作り、表示・データの品質を確かめる）
// 失敗したときは、メッセージのシードで同じ問題を作り直せる（createRng(seed) → template.build(base, rng)）
import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '../src/questions/questionRegistry.js';
import { QuestionPicker } from '../src/core/questionEngine.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { validateAnswer } from '../src/core/answerValidator.js';
import { createRng } from '../src/utils/random.js';

const SEEDS = [1, 7, 23, 101, 977];
const PER_SEED = 4;
const BAD_TEXT = /undefined|NaN|null|\[object Object\]/;

const templates = CATEGORIES.filter((c) => c.enabled).flatMap((c) => c.templates.map((t) => ({ category: c.id, t })));

describe('全テンプレートの総点検', () => {
  it('テンプレートは10カテゴリ・75種類（Phase 7 で K01〜K06・S01〜S06、Phase 8 で I01〜I06・G01〜G06 を追加）', () => {
    expect(new Set(templates.map((x) => x.category)).size).toBe(10);
    expect(templates).toHaveLength(75);
    expect(new Set(templates.map((x) => x.t.id)).size).toBe(75);
  });

  describe.each(templates.map((x) => [x.t.id, x]))('%s', (id, { t }) => {
    it('どのシードでも、正しい形・選択肢の重複なし・正解をふくむ・文に undefined などが出ない・解説の記号が選択肢にある', () => {
      for (const seed of SEEDS) {
        const picker = new QuestionPicker({ templates: [t], rng: createRng(seed) });
        for (let i = 0; i < PER_SEED; i++) {
          const q = picker.next();
          const where = `${id} seed=${seed} #${i}`;
          expect(getQuestionErrors(q), where).toEqual([]);
          const ids = q.choices.map((c) => c.id);
          expect(new Set(ids).size, where).toBe(ids.length);
          expect(new Set(q.choices.map((c) => c.label)).size, where).toBe(ids.length);
          for (const a of q.correctAnswers) expect(ids, where).toContain(a);
          // 正解を選べば完全正解、正解以外を1つだけ選べば完全正解にならない
          expect(validateAnswer(q.correctAnswers, q.correctAnswers).isCorrect, where).toBe(true);
          const wrong = ids.find((c) => !q.correctAnswers.includes(c));
          expect(validateAnswer(q.correctAnswers, [wrong]).isCorrect, where).toBe(false);
          // 1つ選ぶ問題と、すべて選ぶ問題が正しく区別されている
          if (q.type === 'single') expect(q.correctAnswers, where).toHaveLength(1);
          // 文・解説・ヒントに、計算のまちがいからくる表示が出ない
          for (const text of [q.question, q.explanation.text, q.hint?.text ?? '', ...q.choices.map((c) => c.label)]) {
            expect(BAD_TEXT.test(text), `${where}: ${text}`).toBe(false);
          }
          expect(q.explanation.text.length, where).toBeGreaterThan(10);
          // 解説の〔choice:ID〕は、実際にある選択肢を指す
          for (const [, ref] of q.explanation.text.matchAll(/〔choice:([^〕]+)〕/g)) expect(ids, `${where}: ${ref}`).toContain(ref);
          expect(q.hint?.text?.length ?? 0, where).toBeGreaterThan(5);
        }
      }
    });
  });
});
