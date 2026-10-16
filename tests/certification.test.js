// 段位認定：ルール（21段階の段位）・スコア・90秒タイマー・出題・記録
import { describe, it, expect } from 'vitest';
import {
  CERTIFICATION_RULES,
  RANK_NAMES,
  MAX_RANK,
  LEVELS,
  getRankLabel,
  getRankForScore,
  getNextRank,
  recommendedSecondsFor,
} from '../src/core/certificationRules.js';
import { createScoreState, applyAnswer, basePoints, streakBonus } from '../src/core/certificationScore.js';
import { createCertificationTimer } from '../src/core/certificationTimer.js';
import { CertificationSession } from '../src/core/certificationSession.js';
import { createEmptyRecords, normalizeRecords, recordCertificationResult, RECENT_LIMIT } from '../src/core/certificationRecords.js';
import { getQuestionErrors } from '../src/core/questionSchema.js';
import { CATEGORIES, getTemplates } from '../src/questions/questionRegistry.js';
import { createRng } from '../src/utils/random.js';

const R = CERTIFICATION_RULES;
const templatesByCategory = Object.fromEntries(CATEGORIES.filter((c) => c.enabled).map((c) => [c.id, getTemplates(c.id)]));

/** 好きな時刻を返す時計 */
function fakeClock(start = 1000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => (t += ms);
  return now;
}

const correctOf = (q) => q.correctAnswers;
const wrongOf = (q) => [q.choices.find((c) => !q.correctAnswers.includes(c.id)).id];

describe('段位（21段階）', () => {
  it('10級から皆伝まで21段階で、順序と表記が正しい', () => {
    expect(RANK_NAMES).toHaveLength(21);
    expect(MAX_RANK).toBe(21);
    expect(RANK_NAMES).toEqual(['10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級', '2級', '1級', '初段', '二段', '三段', '四段', '五段', '六段', '七段', '八段', '九段', '十段', '皆伝']);
    expect(getRankLabel(1, 'basic')).toBe('10級');
    expect(getRankLabel(10, 'basic')).toBe('1級');
    expect(getRankLabel(11, 'basic')).toBe('初段');
    expect(getRankLabel(20, 'basic')).toBe('十段');
    expect(getRankLabel(21, 'basic')).toBe('皆伝');
    expect(getRankLabel(0, 'expert')).toBe('認定なし');
  });

  it('ベーシックは記号なし、スタンダードは「＋」、エキスパートは「★」を直後に付ける（皆伝も同じ）', () => {
    expect(getRankLabel(15, 'basic')).toBe('五段');
    expect(getRankLabel(15, 'standard')).toBe('五段＋');
    expect(getRankLabel(15, 'expert')).toBe('五段★');
    expect([21].map((r) => LEVELS.map((l) => getRankLabel(r, l)))).toEqual([['皆伝', '皆伝＋', '皆伝★']]);
    for (let r = 1; r <= 21; r++) {
      expect(getRankLabel(r, 'basic')).not.toMatch(/[＋★ ]/);
      expect(getRankLabel(r, 'standard')).toMatch(/^\S+＋$/);
      expect(getRankLabel(r, 'expert')).toMatch(/^\S+★$/);
    }
    expect(() => getRankLabel(22, 'basic')).toThrow();
    expect(() => getRankLabel(3, 'master')).toThrow();
  });

  it('3レベルとも21段階の基準があり、昇順。境界の点数で正しい段位になり、21を超えない', () => {
    for (const level of LEVELS) {
      const th = R.levels[level].thresholds;
      expect(th).toHaveLength(21);
      for (let i = 1; i < th.length; i++) expect(th[i]).toBeGreaterThan(th[i - 1]);
      expect(getRankForScore(level, 0)).toBe(0);
      expect(getRankForScore(level, th[0] - 1)).toBe(0);
      expect(getRankForScore(level, th[0])).toBe(1);
      expect(getRankForScore(level, th[10])).toBe(11); // 初段
      expect(getRankForScore(level, th[10] - 1)).toBe(10);
      expect(getRankForScore(level, th[20])).toBe(21); // 皆伝
      expect(getRankForScore(level, 999999)).toBe(21);
    }
    // レベルごとに基準は別
    expect(R.levels.basic.thresholds[10]).not.toBe(R.levels.expert.thresholds[10]);
  });

  it('次の段位と、あと何点かがわかる（皆伝は次がない）', () => {
    const th = R.levels.standard.thresholds;
    expect(getNextRank('standard', th[13] + 5)).toEqual({ rankLevel: 15, label: '五段＋', score: th[14], remaining: th[14] - th[13] - 5 });
    expect(getNextRank('basic', 0)).toMatchObject({ rankLevel: 1, label: '10級', remaining: R.levels.basic.thresholds[0] });
    expect(getNextRank('expert', 999999)).toBeNull();
  });

  it('問題ごとの考える時間の目安を設定できる', () => {
    expect(recommendedSecondsFor('P01', 1)).toBe(R.recommendedSeconds.byDifficulty[1]);
  });
});

describe('スコア', () => {
  it('難易度別の得点。不正解・部分正解は0点で連続正解が0に戻る', () => {
    expect([1, 2, 3].map((d) => basePoints(d))).toEqual([100, 150, 220]);
    let s = createScoreState();
    s = applyAnswer(s, { difficulty: 2, isCorrect: true }).state;
    expect(s).toMatchObject({ score: 150, streak: 1, correct: 1, answered: 1 });
    const wrong = applyAnswer(s, { difficulty: 3, isCorrect: false });
    expect(wrong.points).toBe(0);
    expect(wrong.state).toMatchObject({ score: 150, streak: 0, maxStreak: 1, answered: 2 });
  });

  it('連続正解ボーナス：1〜2問 0、3〜4問 +20、5問以上 +40', () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => streakBonus(n))).toEqual([0, 0, 20, 20, 40, 40]);
    let s = createScoreState();
    for (let i = 0; i < 6; i++) s = applyAnswer(s, { difficulty: 1, isCorrect: true }).state;
    expect(s.score).toBe(600 + 20 + 20 + 40 + 40);
    expect(s.maxStreak).toBe(6);
  });
});

describe('90秒タイマー', () => {
  it('90秒から始まり、回答できる時間だけ進む（止めている間は減らない）', () => {
    const now = fakeClock();
    const t = createCertificationTimer({ durationMs: 90000, now });
    expect(t.getRemainingMs()).toBe(90000);
    now.advance(5000); // 始める前は減らない
    expect(t.getRemainingMs()).toBe(90000);
    t.start();
    now.advance(12345);
    expect(t.getRemainingMs()).toBe(90000 - 12345);
    t.pause();
    now.advance(60000); // 演出中
    expect(t.getRemainingMs()).toBe(90000 - 12345);
    t.resume();
    now.advance(1000);
    expect(t.getRemainingMs()).toBe(90000 - 13345);
    expect(t.getElapsedActiveMs()).toBe(13345);
  });

  it('二重に止める・再開しても時間はずれない', () => {
    const now = fakeClock();
    const t = createCertificationTimer({ durationMs: 90000, now });
    t.start();
    now.advance(1000);
    expect(t.pause()).toBe(true);
    expect(t.pause()).toBe(false);
    now.advance(5000);
    expect(t.resume()).toBe(true);
    expect(t.resume()).toBe(false);
    now.advance(1000);
    expect(t.getRemainingMs()).toBe(88000);
  });

  it('ペナルティで減り、0 未満にならない。0 で終了し、終了後は変わらない', () => {
    const now = fakeClock();
    const t = createCertificationTimer({ durationMs: 10000, now });
    t.start();
    now.advance(8000);
    t.pause();
    t.penalize(3000);
    expect(t.getRemainingMs()).toBe(0);
    expect(t.state).toBe('finished');
    expect(t.resume()).toBe(false);
    const u = createCertificationTimer({ durationMs: 10000, now });
    u.start();
    now.advance(10001);
    expect(u.isExpired()).toBe(true);
    expect(u.state).toBe('finished');
    now.advance(5000);
    expect(u.getRemainingMs()).toBe(0);
  });
});

describe('段位認定の出題・進行', () => {
  function play(level, { seed = 3, answers = 30, answerMs = 2000, correct = () => true } = {}) {
    const now = fakeClock();
    const session = new CertificationSession({ level, templatesByCategory, rng: createRng(seed), now });
    const questions = [];
    for (let i = 0; i < answers; i++) {
      const q = session.nextQuestion();
      if (!q) break;
      questions.push(q);
      expect(session.startAnswering()).toBe(true);
      now.advance(answerMs);
      if (session.checkTimeUp()) break;
      const result = session.submit(correct(i) ? correctOf(q) : wrongOf(q));
      now.advance(3000); // 演出（タイマーは止まっている）
      if (!result) break;
    }
    return { session, questions, now };
  }

  it('6カテゴリから出題し、同じカテゴリは3問続かず、同じテンプレートも続かない。正しい形の問題', () => {
    for (const level of LEVELS) {
      const { questions } = play(level, { answers: 40, answerMs: 1000, seed: 7 });
      expect(questions.length).toBeGreaterThanOrEqual(40);
      expect(new Set(questions.map((q) => q.category))).toEqual(new Set(R.categories));
      for (let i = 2; i < questions.length; i++) {
        expect(questions[i].category === questions[i - 1].category && questions[i].category === questions[i - 2].category).toBe(false);
      }
      for (let i = 1; i < questions.length; i++) expect(questions[i].templateId).not.toBe(questions[i - 1].templateId);
      for (const q of questions) {
        expect(getQuestionErrors(q)).toEqual([]);
        expect(q.hint).toBeDefined(); // 問題データにはあるが、段位認定では useHint で見られない
      }
      // カテゴリがかたよらない（どのカテゴリも 40 問中 4 問以上）
      const counts = R.categories.map((c) => questions.filter((q) => q.category === c).length);
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(4);
    }
  });

  it('レベル別の難易度：ベーシック ★1 だけ、スタンダード ★1 約30%・★2 約70%、エキスパート ★2 約30%・★3 約70%', () => {
    const share = (qs, d) => qs.filter((q) => q.difficulty === d).length / qs.length;
    const basic = play('basic', { answers: 40, answerMs: 500 }).questions;
    expect(basic.every((q) => q.difficulty === 1)).toBe(true);
    const standard = play('standard', { answers: 40, answerMs: 500 }).questions;
    expect(share(standard, 1)).toBeCloseTo(0.3, 1);
    expect(share(standard, 2)).toBeCloseTo(0.7, 1);
    expect(standard.every((q) => q.difficulty !== 3)).toBe(true);
    const expert = play('expert', { answers: 40, answerMs: 500 }).questions;
    expect(share(expert, 3)).toBeCloseTo(0.7, 1);
    expect(expert.every((q) => q.difficulty !== 1)).toBe(true);
  });

  it('正解で得点、誤答で0点・残り時間が3秒減る。単一・複数回答とも判定は従来どおり', () => {
    const now = fakeClock();
    const session = new CertificationSession({ level: 'standard', templatesByCategory, rng: createRng(5), now });
    const q1 = session.nextQuestion();
    session.startAnswering();
    now.advance(4000);
    const r1 = session.submit(correctOf(q1));
    expect(r1.isCorrect).toBe(true);
    expect(session.state.lastScore).toEqual({ points: R.points[q1.difficulty], bonus: 0, penaltyMs: 0 });
    expect(session.timer.getRemainingMs()).toBe(86000);
    const q2 = session.nextQuestion();
    session.startAnswering();
    now.advance(1000);
    expect(session.submit(wrongOf(q2)).isCorrect).toBe(false);
    expect(session.timer.getRemainingMs()).toBe(82000);
    expect(session.state.score).toMatchObject({ score: R.points[q1.difficulty], streak: 0, correct: 1, answered: 2 });
    // 二重の回答は受け付けない
    expect(session.submit(correctOf(q2))).toBeNull();
    expect(session.state.answeredCount).toBe(2);
    expect(session.useHint()).toBeNull(); // ヒントは使えない
  });

  it('時間切れ：回答中の問題は未回答。90秒を過ぎた回答は数えない', () => {
    const now = fakeClock();
    const session = new CertificationSession({ level: 'basic', templatesByCategory, rng: createRng(2), now });
    const q1 = session.nextQuestion();
    session.startAnswering();
    now.advance(30000);
    session.submit(correctOf(q1));
    const q2 = session.nextQuestion();
    session.startAnswering();
    now.advance(60001); // 90 秒を過ぎた
    expect(session.submit(correctOf(q2))).toBeNull();
    expect(session.isFinished).toBe(true);
    const summary = session.getSummary();
    expect(summary).toMatchObject({ answeredCount: 1, correctCount: 1, aborted: false, remainingMs: 0 });
    expect(session.nextQuestion()).toBeNull();
    expect(session.hasNextQuestion()).toBe(false);
  });

  it('ペナルティで 0 秒になったら、次の問題は出ずに終了。結果の集計（カテゴリ別・平均時間・最大連続）', () => {
    const { session } = play('basic', { answers: 100, answerMs: 9000, correct: (i) => i % 3 !== 2 });
    expect(session.hasNextQuestion()).toBe(false);
    session.finish();
    const s = session.getSummary();
    expect(s.answeredCount).toBeGreaterThan(0);
    expect(s.averageAnswerMs).toBeCloseTo(9000, 0);
    expect(Object.values(s.byCategory).reduce((a, c) => a + c.answered, 0)).toBe(s.answeredCount);
    expect(s.maxStreak).toBe(2);
    expect(s.rankLevel).toBe(getRankForScore('basic', s.score));
  });

  it('中断した挑戦は aborted になる', () => {
    const { session } = play('basic', { answers: 2 });
    session.abort();
    expect(session.getSummary().aborted).toBe(true);
  });
});

describe('段位認定の記録', () => {
  const summary = (level, score, extra = {}) => ({ level, score, correctCount: Math.floor(score / 100), answeredCount: 10, rankLevel: getRankForScore(level, score), aborted: false, ...extra });

  it('レベルごとに別々に、挑戦回数・最高得点・最高段位を記録する。低い成績で下がらない', () => {
    let res = recordCertificationResult(createEmptyRecords(), summary('basic', 1500));
    expect(res).toMatchObject({ previousRank: 0, newRank: 15, rankUp: true, bestScoreUpdated: true, recorded: true });
    res = recordCertificationResult(res.records, summary('basic', 300));
    expect(res).toMatchObject({ previousRank: 15, newRank: 15, rankUp: false, bestScoreUpdated: false });
    expect(res.records.levels.basic).toMatchObject({ attempts: 2, bestScore: 1500, bestRank: 15 });
    // 同じ段位でも最高得点の更新は自己ベスト
    res = recordCertificationResult(res.records, summary('basic', 1540));
    expect(res).toMatchObject({ rankUp: false, bestScoreUpdated: true });
    expect(res.records.levels.standard).toMatchObject({ attempts: 0, bestRank: 0 });
  });

  it('中断した挑戦は記録しない。最近の結果は20件まで。段位は21を超えない', () => {
    let res = recordCertificationResult(createEmptyRecords(), summary('expert', 5000, { aborted: true }));
    expect(res.recorded).toBe(false);
    expect(res.records.levels.expert.attempts).toBe(0);
    let records = res.records;
    for (let i = 0; i < RECENT_LIMIT + 3; i++) records = recordCertificationResult(records, summary('expert', 99999)).records;
    expect(records.levels.expert.recent).toHaveLength(RECENT_LIMIT);
    expect(records.levels.expert.bestRank).toBe(21);
    expect(normalizeRecords({ ...records, levels: { ...records.levels, expert: { ...records.levels.expert, bestRank: 99 } } }).levels.expert.bestRank).toBe(21);
  });

  it('こわれた・古い保存データでもエラーにならない。段位の基準が変わったら前の記録は分けて残す', () => {
    expect(normalizeRecords(null)).toEqual(createEmptyRecords());
    expect(normalizeRecords({ version: 9 })).toEqual(createEmptyRecords());
    const old = recordCertificationResult(createEmptyRecords(), summary('basic', 1000)).records;
    const newRules = { ...R, rulesVersion: R.rulesVersion + 1 };
    const migrated = normalizeRecords(old, newRules);
    expect(migrated.levels.basic).toMatchObject({ attempts: 1, bestScore: 0, bestRank: 0, previous: { rulesVersion: R.rulesVersion, bestScore: 1000, bestRank: 10 } });
    expect(migrated.rulesVersion).toBe(R.rulesVersion + 1);
  });
});
