/**
 * トレーニングの「1分チャレンジ」の進行（1つのカテゴリ・難易度で、1分間に何問正解できるか。Three.js・DOM 非依存）
 *
 * 問題画面（ui/questionScreen）の時間制のモードで使えるよう、段位認定（core/certificationSession）と同じ形の
 * state / nextQuestion / startAnswering / submit / hasNextQuestion / checkTimeUp / finish / abort を持つ。
 * - 出題は既存の QuestionPicker（選んだカテゴリ・難易度）。ヒント・パスは使えない
 * - タイマーは回答できる時間だけ数える（答え合わせ・演出の間は止まる）
 * - 不正解（部分正解をふくむ）は残り時間 −10 秒。正解数が記録になる
 */
import { QuestionPicker } from './questionEngine.js';
import { validateAnswer, canSubmitAnswer, normalizeAnswers } from './answerValidator.js';
import { createCertificationTimer } from './certificationTimer.js';
import { TIMED_REVEAL } from './revealSettings.js';

export const CHALLENGE_RULES = Object.freeze({
  durationMs: 60000,
  overtimeMs: 15000, // ロスタイム：残り0秒のときの問題（最終問題）は、答えるかこの時間がたつまで続けられる
  mistakePenaltyMs: 10000,
  /**
   * 1分チャレンジでは出題しないテンプレート（解くのに時間がかかりすぎるもの）。プレイテストで時間を確かめてから、ここに入れる。
   * どのカテゴリ・難易度にも、出題できるテンプレートが1つ以上残るようにする
   */
  excludedTemplates: Object.freeze([]),
  // カウントダウン・演出の速さは段位認定と同じ（core/revealSettings）
  ...TIMED_REVEAL,
});

export class TimedChallengeSession {
  /**
   * @param {{ category: string, templates: object[], difficulty?: 1|2|3|'all', rules?: object, rng?: () => number, now?: () => number }} options
   */
  constructor({ category, templates, difficulty = 'all', rules = CHALLENGE_RULES, rng = Math.random, now }) {
    this.category = category;
    this.difficulty = difficulty;
    this.rules = rules;
    const usable = templates.filter((t) => !(rules.excludedTemplates ?? []).includes(t.id));
    // 1分チャレンジでは、タイトル画面の設定にかかわらず、三平方の定理・√ が必要な問題は出さない（core/questionEligibility）
    this.picker = new QuestionPicker({ templates: usable, difficulty, rng, allowAdvanced: false });
    this.timer = createCertificationTimer({ durationMs: rules.durationMs, overtimeMs: rules.overtimeMs ?? 0, now });
    this._seq = 0;
    this._questionStartActiveMs = 0;
    this._state = {
      phase: 'ready', // ready → playing → finished
      currentQuestion: null,
      selectedAnswers: [],
      answerLocked: false,
      lastResult: null,
      lastScore: null, // 直前の問題の { penaltyMs }
      hintUsed: false,
      history: [],
      aborted: false,
      endReason: null, // 終わり方：'final'（最終問題に答えた）| 'penalty'（ペナルティ・パスで 0 秒）| null（時間切れ・中断）
    };
  }

  get state() {
    const s = this._state;
    const correct = s.history.filter((h) => h.isCorrect).length;
    return { ...s, difficulty: this.difficulty, correctCount: correct, answeredCount: s.history.length, history: [...s.history] };
  }

  get questionNumber() {
    return this._seq;
  }

  get isEndless() {
    return true;
  }

  get isFinished() {
    return this._state.phase === 'finished';
  }

  /** 最終問題（残り 0 秒・ロスタイム中）か */
  get isFinalQuestion() {
    return this._state.phase === 'playing' && this.timer.isOvertime();
  }

  /** 次の問題（タイマーは止まったまま。時間切れなら null） */
  nextQuestion() {
    const s = this._state;
    if (s.phase === 'finished') return null;
    if (s.currentQuestion && !s.answerLocked) return s.currentQuestion;
    // 残り 0 秒でも、ロスタイムがあれば次の問題（最終問題）を出す
    if (s.phase === 'playing' && this.timer.isExpired()) {
      this.finish();
      return null;
    }
    s.currentQuestion = this.picker.next();
    this._seq += 1;
    s.selectedAnswers = [];
    s.answerLocked = false;
    s.lastResult = null;
    s.lastScore = null;
    return s.currentQuestion;
  }

  /** 表示して回答できるようになった（1問目でタイマー開始、2問目からは再開） */
  startAnswering() {
    const s = this._state;
    if (s.phase === 'finished' || !s.currentQuestion || s.answerLocked) return false;
    if (s.phase === 'ready') {
      s.phase = 'playing';
      this.timer.start();
    } else {
      this.timer.resume();
    }
    if (this.timer.state !== 'running') {
      this.finish();
      return false;
    }
    this._questionStartActiveMs = this.timer.getElapsedActiveMs();
    return true;
  }

  useHint() {
    return null;
  }

  pass() {
    return null;
  }

  setSelectedAnswers(ids) {
    if (this._state.answerLocked) return;
    this._state.selectedAnswers = normalizeAnswers(ids);
  }

  /** 回答を確定する（確定した時刻に時間が残っていなければ null。不正解は残り時間 −10 秒） */
  submit(selected = this._state.selectedAnswers) {
    const s = this._state;
    const q = s.currentQuestion;
    if (!q || s.answerLocked || s.phase !== 'playing' || this.timer.state !== 'running') return null;
    if (!canSubmitAnswer(selected, q.type)) return null;
    if (this.timer.isExpired()) {
      this.finish();
      return null;
    }
    const final = this.timer.getRemainingMs() <= 0;
    this.timer.pause();
    const answerMs = this.timer.getElapsedActiveMs() - this._questionStartActiveMs;
    const result = validateAnswer(q.correctAnswers, selected);
    let penaltyMs = 0;
    if (!result.isCorrect && !final) {
      const before = this.timer.getRemainingMs();
      this.timer.penalize(this.rules.mistakePenaltyMs);
      penaltyMs = before - this.timer.getRemainingMs();
    }
    s.selectedAnswers = result.selected;
    s.answerLocked = true;
    s.lastResult = result;
    s.lastScore = { penaltyMs };
    s.history.push({
      number: this._seq,
      templateId: q.templateId,
      difficulty: q.difficulty,
      status: result.status,
      isCorrect: result.isCorrect,
      penaltyMs,
      answerMs,
      question: q,
    });
    if (!final && penaltyMs > 0 && this.timer.getRemainingMs() <= 0) {
      // 不正解のペナルティで残り 0 秒になったら、その時点で終了
      result.timeOut = true;
      s.endReason = 'penalty';
      this.finish();
      return result;
    }
    if (final) {
      // 最終問題に答えたら（正解でも不正解でも）終了
      result.final = true;
      s.endReason = 'final';
      this.finish();
    }
    return result;
  }

  hasNextQuestion() {
    return this._state.phase !== 'finished' && !this.timer.isExpired();
  }

  isComplete() {
    return !this.hasNextQuestion();
  }

  checkTimeUp() {
    const s = this._state;
    if (s.phase !== 'playing') return s.phase === 'finished';
    if (!this.timer.isExpired()) return false;
    this.finish();
    return true;
  }

  finish() {
    const s = this._state;
    if (s.phase !== 'finished') {
      this.timer.stop();
      s.phase = 'finished';
    }
    return this.getSummary();
  }

  abort() {
    this._state.aborted = true;
    this.finish();
  }

  getSummary() {
    const s = this._state;
    const correct = s.history.filter((h) => h.isCorrect).length;
    return {
      category: this.category,
      difficulty: this.difficulty,
      aborted: s.aborted,
      correctCount: correct,
      answeredCount: s.history.length,
      accuracy: s.history.length === 0 ? 0 : correct / s.history.length,
      penaltyTotalMs: s.history.reduce((t, h) => t + h.penaltyMs, 0),
      history: [...s.history],
    };
  }
}
