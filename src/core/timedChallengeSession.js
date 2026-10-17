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
  mistakePenaltyMs: 10000,
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
    this.picker = new QuestionPicker({ templates, difficulty, rng });
    this.timer = createCertificationTimer({ durationMs: rules.durationMs, now });
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

  /** 次の問題（タイマーは止まったまま。時間切れなら null） */
  nextQuestion() {
    const s = this._state;
    if (s.phase === 'finished') return null;
    if (s.currentQuestion && !s.answerLocked) return s.currentQuestion;
    if (s.phase === 'playing' && this.timer.getRemainingMs() <= 0) {
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
    if (this.timer.getRemainingMs() <= 0) {
      this.finish();
      return null;
    }
    this.timer.pause();
    const answerMs = this.timer.getElapsedActiveMs() - this._questionStartActiveMs;
    const result = validateAnswer(q.correctAnswers, selected);
    let penaltyMs = 0;
    if (!result.isCorrect) {
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
    return result;
  }

  hasNextQuestion() {
    return this._state.phase !== 'finished' && this.timer.getRemainingMs() > 0;
  }

  isComplete() {
    return !this.hasNextQuestion();
  }

  checkTimeUp() {
    const s = this._state;
    if (s.phase !== 'playing') return s.phase === 'finished';
    if (this.timer.getRemainingMs() > 0) return false;
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
