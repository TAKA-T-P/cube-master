import { describe, it, expect, vi } from 'vitest';
import { validateAnswer, canSubmitAnswer, normalizeAnswers, ANSWER_STATUS } from '../src/core/answerValidator.js';
import { AnswerSelection } from '../src/core/answerSelection.js';

describe('validateAnswer', () => {
  const correct = ['CD', 'EF', 'GH'];

  it('単一回答', () => {
    expect(validateAnswer(['EFGH'], ['EFGH']).status).toBe(ANSWER_STATUS.CORRECT);
    const r = validateAnswer(['EFGH'], ['ABFE']);
    expect(r.status).toBe(ANSWER_STATUS.INCORRECT);
    expect(r.wrong).toEqual(['ABFE']);
    expect(r.missing).toEqual(['EFGH']);
  });

  it('複数回答（順序が違っても正解）', () => {
    expect(validateAnswer(correct, ['CD', 'EF', 'GH']).isCorrect).toBe(true);
    expect(validateAnswer(correct, ['GH', 'CD', 'EF']).isCorrect).toBe(true);
  });

  it('回答不足は不正解（1つ不足は「おしい」）', () => {
    const r = validateAnswer(correct, ['CD', 'EF']);
    expect(r.isCorrect).toBe(false);
    expect(r.status).toBe(ANSWER_STATUS.PARTIAL);
    expect(r.missing).toEqual(['GH']);
    expect(validateAnswer(correct, ['CD']).status).toBe(ANSWER_STATUS.INCORRECT);
  });

  it('誤答の混入は不正解（1つだけなら「おしい」）', () => {
    const r = validateAnswer(correct, ['CD', 'EF', 'GH', 'AE']);
    expect(r.isCorrect).toBe(false);
    expect(r.status).toBe(ANSWER_STATUS.PARTIAL);
    expect(r.wrong).toEqual(['AE']);
    expect(validateAnswer(correct, ['CD', 'EF', 'AE']).status).toBe(ANSWER_STATUS.INCORRECT);
    expect(validateAnswer(correct, ['AE', 'BF']).status).toBe(ANSWER_STATUS.INCORRECT);
  });

  it('未選択', () => {
    const r = validateAnswer(correct, []);
    expect(r.status).toBe(ANSWER_STATUS.UNANSWERED);
    expect(r.isCorrect).toBe(false);
    expect(canSubmitAnswer([], 'multiple')).toBe(false);
    expect(canSubmitAnswer([], 'single')).toBe(false);
  });

  it('重複回答は1つとして扱う', () => {
    expect(normalizeAnswers(['CD', 'CD', 'EF', null, ''])).toEqual(['CD', 'EF']);
    expect(validateAnswer(correct, ['CD', 'CD', 'EF', 'GH', 'GH']).isCorrect).toBe(true);
    expect(canSubmitAnswer(['A', 'A'], 'single')).toBe(true);
    expect(canSubmitAnswer(['A', 'B'], 'single')).toBe(false);
  });

  it('選択肢 ID は立方体の要素に限らない', () => {
    expect(validateAnswer(['3/4'], ['3/4']).isCorrect).toBe(true);
    expect(validateAnswer(['square', 'hexagon'], ['hexagon', 'square']).isCorrect).toBe(true);
  });

  it('正解のない問題はエラー', () => {
    expect(() => validateAnswer([], ['A'])).toThrow();
  });
});

describe('AnswerSelection', () => {
  it('単一選択はラジオ形式（選び直すと入れ替わる）', () => {
    const s = new AnswerSelection({ type: 'single', choiceIds: ['a', 'b', 'c'] });
    expect(s.canSubmit()).toBe(false);
    s.toggle('a');
    s.toggle('b');
    expect(s.getSelected()).toEqual(['b']);
    expect(s.canSubmit()).toBe(true);
  });

  it('複数選択はチェック形式（選択肢の並び順で返す）', () => {
    const s = new AnswerSelection({ type: 'multiple', choiceIds: ['a', 'b', 'c'] });
    s.toggle('c');
    s.toggle('a');
    expect(s.getSelected()).toEqual(['a', 'c']);
    s.toggle('c');
    expect(s.getSelected()).toEqual(['a']);
  });

  it('ロック後は変更できず、無効な ID は無視する', () => {
    const listener = vi.fn();
    const s = new AnswerSelection({ type: 'multiple', choiceIds: ['a', 'b'] });
    s.onChange(listener);
    expect(s.toggle('zzz')).toBe(false);
    s.toggle('a');
    s.lock();
    expect(s.toggle('b')).toBe(false);
    s.clear();
    expect(s.getSelected()).toEqual(['a']);
    expect(s.canSubmit()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2); // toggle と lock
  });
});
