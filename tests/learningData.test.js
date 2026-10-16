// 学習記録・復習データ・保存（core/storageManager・learningHistory・reviewManager）とヒント
import { describe, it, expect } from 'vitest';
import { createStorage, createMemoryBackend, STORAGE_PREFIX } from '../src/core/storageManager.js';
import { createEmptyHistory, normalizeHistory, recordTrainingResult, recordReviewAnswer, getCategoryStats, RECENT_LIMIT } from '../src/core/learningHistory.js';
import {
  createEmptyReviewStore,
  normalizeReviewStore,
  addReviewEntries,
  recordReviewResult,
  getReviewEntries,
  trimReviewStore,
  snapshotQuestion,
  MAX_ENTRIES_PER_CATEGORY,
} from '../src/core/reviewManager.js';
import { TrainingSession, QuestionPicker } from '../src/core/questionEngine.js';
import { getQuestionErrors, QUESTION_SCHEMA_VERSION } from '../src/core/questionSchema.js';
import { validateAnswer } from '../src/core/answerValidator.js';
import { CATEGORIES, getTemplates } from '../src/questions/questionRegistry.js';
import { createRng } from '../src/utils/random.js';

function playSession(category, flags, { hints = [] } = {}) {
  const session = new TrainingSession({ category, templates: getTemplates(category), questionLimit: flags.length, rng: createRng(3) });
  flags.forEach((ok, i) => {
    const q = session.nextQuestion();
    if (hints.includes(i)) session.useHint();
    session.submit(ok ? q.correctAnswers : [q.choices.find((c) => !q.correctAnswers.includes(c.id)).id]);
  });
  return session.finish();
}

describe('保存（storageManager）', () => {
  it('JSON で保存・読み込み。こわれた値は null', () => {
    const backend = createMemoryBackend();
    const s = createStorage(backend);
    expect(s.available).toBe(true);
    expect(s.write('history', { a: 1 })).toBe(true);
    expect(backend.getItem(`${STORAGE_PREFIX}history`)).toBe('{"a":1}');
    expect(s.read('history')).toEqual({ a: 1 });
    backend.setItem(`${STORAGE_PREFIX}broken`, '{not json');
    expect(s.read('broken')).toBeNull();
    expect(s.read('none')).toBeNull();
  });

  it('使えない保存先（null・書き込みでエラー）でもエラーにならず、練習は続けられる', () => {
    const none = createStorage(null);
    expect(none.available).toBe(false);
    expect(none.write('x', 1)).toBe(false);
    expect(none.read('x')).toBeNull();
    const full = createStorage({ ...createMemoryBackend(), setItem: () => { throw new Error('QuotaExceededError'); } });
    expect(full.available).toBe(false);
    expect(full.write('x', 1)).toBe(false);
  });

  it('大きすぎるデータは保存しない', () => {
    const s = createStorage(createMemoryBackend());
    expect(s.write('big', 'x'.repeat(2_000_000))).toBe(false);
  });

  it('消去は CUBE MASTER のキーだけ（ほかのアプリのデータは消さない）', () => {
    const backend = createMemoryBackend();
    backend.setItem('otherApp:data', 'keep');
    const s = createStorage(backend);
    s.write('history', {});
    s.write('review', {});
    expect(s.clearAll()).toBe(2);
    expect(backend.getItem('otherApp:data')).toBe('keep');
    expect(backend.length).toBe(1);
  });
});

describe('学習記録（learningHistory）', () => {
  it('カテゴリ別・難易度別に、回答数・正解数・ヒント・最近の結果を記録する', () => {
    const summary = playSession('position', [true, false, true, true], { hints: [1, 2] });
    let h = recordTrainingResult(createEmptyHistory(), summary, { date: '2026-10-01T09:00:00.000Z' });
    h = recordTrainingResult(h, playSession('position', [true, true]), { date: '2026-10-02T09:00:00.000Z' });
    const stats = getCategoryStats(h, 'position');
    expect(stats).toMatchObject({ playedSessions: 2, answeredCount: 6, correctCount: 5, hintUsedCount: 2 });
    expect(stats.accuracy).toBeCloseTo(5 / 6);
    const byLevel = [1, 2, 3].reduce((s, d) => s + stats.byDifficulty[d].answered, 0);
    expect(byLevel).toBe(6);
    expect(stats.recent.map((r) => r.date)).toEqual(['2026-10-02T09:00:00.000Z', '2026-10-01T09:00:00.000Z']);
    expect(getCategoryStats(h, 'dice')).toBeNull(); // まだ記録がない
  });

  it('回答0問は記録しない。最近の結果は上限まで', () => {
    let h = recordTrainingResult(createEmptyHistory(), { category: 'dice', answeredCount: 0, correctCount: 0, history: [] });
    expect(getCategoryStats(h, 'dice')).toBeNull();
    for (let i = 0; i < RECENT_LIMIT + 5; i++) h = recordTrainingResult(h, playSession('dice', [true]));
    expect(h.categories.dice.recent).toHaveLength(RECENT_LIMIT);
    expect(h.categories.dice.playedSessions).toBe(RECENT_LIMIT + 5);
  });

  it('復習の結果は、通常の正解数に入れずに別に数える', () => {
    let h = recordTrainingResult(createEmptyHistory(), playSession('dice', [false]));
    h = recordReviewAnswer(h, 'dice', true);
    expect(h.categories.dice).toMatchObject({ answeredCount: 1, correctCount: 0, reviewAnswered: 1, reviewCorrect: 1 });
  });

  it('古い形・こわれた保存データでもエラーにならない（直すか、空にする）', () => {
    expect(normalizeHistory(null)).toEqual(createEmptyHistory());
    expect(normalizeHistory('xx')).toEqual(createEmptyHistory());
    expect(normalizeHistory({ version: 0, categories: {} })).toEqual(createEmptyHistory());
    const fixed = normalizeHistory({
      version: 1,
      categories: {
        position: { playedSessions: -3, answeredCount: 5, correctCount: 99, recent: [{ date: 'bad' }, { date: '2026-01-01', answered: 2, correct: 1, difficulty: 2 }], byDifficulty: { 1: { answered: 'a' } } },
        'bad key!': { answeredCount: 3 },
      },
    });
    expect(fixed.categories.position).toMatchObject({ playedSessions: 0, answeredCount: 5, correctCount: 5 });
    expect(fixed.categories.position.recent).toHaveLength(1);
    expect(fixed.categories['bad key!']).toBeUndefined();
  });
});

describe('復習データ（reviewManager）', () => {
  const wrongOf = (summary) => summary.history.filter((h) => !h.isCorrect).map((h) => h.question);

  it('不正解・部分正解の問題を、回答前の状態のまま保存し、読み込んでも同じ問題になる', () => {
    const summary = playSession('netPuzzle', [false, true, false]);
    const { store, ids } = addReviewEntries(createEmptyReviewStore(), wrongOf(summary));
    expect(ids.every(Boolean)).toBe(true);
    expect(getReviewEntries(store, 'netPuzzle')).toHaveLength(2);
    // JSON にして保存し、読み込みなおしても、同じ問題・同じ正解
    const loaded = normalizeReviewStore(JSON.parse(JSON.stringify(store)));
    expect(loaded.entries.map((e) => e.question)).toEqual(wrongOf(summary).map(snapshotQuestion));
    for (const e of loaded.entries) {
      expect(e.schemaVersion).toBe(QUESTION_SCHEMA_VERSION);
      expect(getQuestionErrors(e.question)).toEqual([]);
      expect(validateAnswer(e.question.correctAnswers, e.question.correctAnswers).isCorrect).toBe(true);
    }
  });

  it('正しく解けたら外し、まちがえたら回数を増やす', () => {
    const { store, ids } = addReviewEntries(createEmptyReviewStore(), wrongOf(playSession('dice', [false, false])));
    let s = recordReviewResult(store, ids[0], false);
    expect(s.entries.find((e) => e.id === ids[0]).incorrectCount).toBe(2);
    s = recordReviewResult(s, ids[0], true);
    expect(s.entries.map((e) => e.id)).toEqual([ids[1]]);
  });

  it('今の形と合わない保存データ（schemaVersion・不正な問題・知らないテンプレート）は作り直さずに除外する', () => {
    const { store } = addReviewEntries(createEmptyReviewStore(), wrongOf(playSession('position', [false, false])));
    const [a, b] = store.entries;
    const broken = { ...b, question: { ...b.question, correctAnswers: ['nothing'] } };
    const old = { ...a, id: 'old', schemaVersion: QUESTION_SCHEMA_VERSION - 1 };
    const raw = { version: 1, entries: [a, broken, old, { id: 'x' }, null] };
    expect(normalizeReviewStore(raw).entries.map((e) => e.id)).toEqual([a.id]);
    expect(normalizeReviewStore(raw, { isKnownTemplate: () => false }).entries).toEqual([]);
    expect(normalizeReviewStore({ version: 99, entries: [a] }).entries).toEqual([]);
    expect(normalizeReviewStore('broken')).toEqual(createEmptyReviewStore());
  });

  it('保存する数・大きさの上限を守る（新しく間違えたものを残す）', () => {
    let store = createEmptyReviewStore();
    for (let i = 0; i < 4; i++) {
      store = addReviewEntries(store, wrongOf(playSession('position', Array(6).fill(false))), { now: `2026-10-0${i + 1}T00:00:00.000Z` }).store;
    }
    expect(getReviewEntries(store, 'position')).toHaveLength(MAX_ENTRIES_PER_CATEGORY);
    expect(store.entries.every((e) => e.lastIncorrectAt >= '2026-10-02')).toBe(true);
    const small = trimReviewStore(store, { maxChars: 20000 });
    expect(JSON.stringify(small).length).toBeLessThanOrEqual(20000);
    expect(small.entries.length).toBeGreaterThan(0);
  });

  it('すべてのカテゴリ・テンプレートの問題を JSON で保存して、そのまま復元できる', () => {
    for (const c of CATEGORIES.filter((x) => x.enabled)) {
      const picker = new QuestionPicker({ templates: getTemplates(c.id), rng: createRng(11) });
      const seen = new Set();
      for (let i = 0; i < 40 && seen.size < c.templates.length; i++) {
        const q = picker.next();
        seen.add(q.templateId);
        const copy = snapshotQuestion(q);
        expect(copy).toEqual(q);
        expect(getQuestionErrors(copy)).toEqual([]);
      }
    }
  });
});

describe('ヒント（すべてのカテゴリ）', () => {
  const enabled = CATEGORIES.filter((c) => c.enabled);

  it('すべてのテンプレートの問題にヒントがあり、答え（正解の選択肢）を直接書かない', () => {
    let total = 0;
    for (const c of enabled) {
      for (const t of c.templates) {
        const picker = new QuestionPicker({ templates: [t], rng: createRng(7) });
        for (let i = 0; i < 4; i++) {
          const q = picker.next();
          expect(q.hint?.text, `${t.id} のヒント`).toBeTruthy();
          for (const id of q.correctAnswers) {
            const label = q.choices.find((ch) => ch.id === id).label;
            // 数・頂点の名前をふくむ答え（「8個」「辺CD」）と3文字以上の答えを調べる（「ア」「ある」などの短い言葉と、問題文にも出てくる言葉は除く）
            if ((/[0-9A-Z]/.test(label) || label.length >= 3) && !q.question.includes(label)) expect(q.hint.text.includes(label), `${t.id}: ${q.hint.text} / ${label}`).toBe(false);
          }
        }
        total += 1;
      }
    }
    expect(total).toBe(39 + 8);
  });

  it('回答前だけ使え、何度見ても同じ。使ったかどうかを記録し、正誤判定は変わらない', () => {
    const session = new TrainingSession({ category: 'paintedCube', templates: getTemplates('paintedCube'), questionLimit: 2, rng: createRng(2) });
    const q = session.nextQuestion();
    expect(session.state.hintUsed).toBe(false);
    const first = session.useHint();
    expect(first).toBe(q.hint.text);
    expect(session.useHint()).toBe(first);
    expect(session.state.hintUsed).toBe(true);
    const result = session.submit(q.correctAnswers);
    expect(result.isCorrect).toBe(true);
    expect(session.useHint()).toBeNull(); // 回答後は使えない
    const q2 = session.nextQuestion();
    expect(session.state.hintUsed).toBe(false);
    session.submit([q2.choices.find((c) => !q2.correctAnswers.includes(c.id)).id]);
    const summary = session.finish();
    expect(summary.history.map((h) => h.hintUsed)).toEqual([true, false]);
    expect(summary.hintUsedCount).toBe(1);
    expect(summary.correctCount).toBe(1);
  });
});
