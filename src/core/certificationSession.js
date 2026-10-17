/**
 * 段位認定の進行（制限時間の中で複数カテゴリの問題を解き続ける。Three.js・DOM 非依存）
 *
 * 問題画面（ui/questionScreen）がトレーニングと同じように使えるよう、TrainingSession と同じ形の
 * state / nextQuestion / submit / hasNextQuestion / useHint を持つ（ヒントは使えない）。
 *
 * 出題：カテゴリごと・難易度ごとに QuestionPicker（既存の問題生成・数学的な確かめ・重複管理）を使い、
 *   - カテゴリはなるべく均等に、同じカテゴリは maxSameCategoryRun 問までしか続けない
 *   - 同じテンプレートは続けない
 *   - 難易度はレベルの割合（例：★1 30%・★2 70%）に近くなるように選ぶ
 * タイマー：問題を表示して回答できるようになったら resume、回答を確定したら pause（○△×・3D 演出・次の問題の準備の間は止まる）。
 * 回答の確定時刻に時間が残っていなければ、その回答は受け付けない（未回答。正解にも不正解にも数えない）。
 * パス：回答する前に問題を入れかえられる。n 回目のパスで残り時間が perPassMs × n へる（回答・正答率には数えず、減点もしない。連続正解は 0 に戻る）。
 */
import { QuestionPicker } from './questionEngine.js';
import { validateAnswer, canSubmitAnswer, normalizeAnswers } from './answerValidator.js';
import { CERTIFICATION_RULES, getRankForScore, isLevel } from './certificationRules.js';
import { createScoreState, applyAnswer } from './certificationScore.js';
import { createCertificationTimer } from './certificationTimer.js';

export class CertificationSession {
  /**
   * @param {{
   *   level: 'basic'|'standard'|'expert',
   *   templatesByCategory: Record<string, object[]>,   // 遊べるカテゴリのテンプレート（questions/questionRegistry から渡す）
   *   rules?: object, rng?: () => number, now?: () => number,
   * }} options
   */
  constructor({ level, templatesByCategory, rules = CERTIFICATION_RULES, rng = Math.random, now }) {
    if (!isLevel(level)) throw new Error(`レベルが不正です: ${level}`);
    this.level = level;
    this.rules = rules;
    this.rng = rng;
    this.timer = createCertificationTimer({ durationMs: rules.durationMs, now });
    this._now = now;
    const weights = rules.levels[level].difficultyWeights;
    this.difficulties = Object.keys(weights).map(Number);
    // 出題するカテゴリ（このレベルの難易度の問題があるものだけ）
    this._pool = {};
    for (const category of rules.categories) {
      const templates = (templatesByCategory[category] ?? []).filter((t) => !rules.excludedTemplates.includes(t.id));
      const byDifficulty = {};
      for (const d of this.difficulties) {
        const list = templates.filter((t) => t.difficulty === d);
        if (list.length > 0) byDifficulty[d] = list;
      }
      if (Object.keys(byDifficulty).length > 0) this._pool[category] = byDifficulty;
    }
    this.categories = Object.keys(this._pool);
    if (this.categories.length === 0) throw new Error('段位認定で出題できる問題がありません');
    this._pickers = new Map();
    this._categoryUsage = new Map();
    this._difficultyUsage = new Map();
    this._seq = 0;
    this._questionStartActiveMs = 0;
    this._state = {
      level,
      phase: 'ready', // ready → playing → finished（aborted：中断）
      currentQuestion: null,
      selectedAnswers: [],
      answerLocked: false,
      lastResult: null,
      lastScore: null, // 直前の問題の { points, bonus, deduction, timeBonusMs }
      hintUsed: false,
      score: createScoreState(),
      history: [],
      passes: [], // パスした問題 { number, templateId, category, difficulty, penaltyMs }
      aborted: false,
    };
  }

  get state() {
    const s = this._state;
    return {
      ...s,
      difficulty: 'all',
      correctCount: s.score.correct,
      answeredCount: s.score.answered,
      history: [...s.history],
    };
  }

  /** 問題番号（表示用） */
  get questionNumber() {
    return this._seq;
  }

  get isEndless() {
    return true;
  }

  get isFinished() {
    return this._state.phase === 'finished';
  }

  // ---------- 出題 ----------

  _picker(category, difficulty) {
    const key = `${category}:${difficulty}`;
    if (!this._pickers.has(key)) this._pickers.set(key, new QuestionPicker({ templates: this._pool[category][difficulty], rng: this.rng }));
    return this._pickers.get(key);
  }

  /** 次の難易度：割合（weights）に対して出題が少ない難易度 */
  _pickDifficulty(category) {
    const weights = this.rules.levels[this.level].difficultyWeights;
    const available = this.difficulties.filter((d) => this._pool[category][d]);
    const total = [...this._difficultyUsage.values()].reduce((s, v) => s + v, 0) + 1;
    let best = null;
    for (const d of available) {
      const deficit = weights[d] * total - (this._difficultyUsage.get(d) ?? 0);
      if (best === null || deficit > best.deficit + 1e-9 || (Math.abs(deficit - best.deficit) < 1e-9 && this.rng() < 0.5)) best = { d, deficit };
    }
    return best.d;
  }

  /** 次のカテゴリ：出題の少ないカテゴリから選び、同じカテゴリを続けすぎない */
  _pickCategory(exclude = new Set()) {
    const recent = this._state.history.map((h) => h.category);
    if (this._state.currentQuestion && !this._state.answerLocked) recent.push(this._state.currentQuestion.category);
    const last = recent.slice(-this.rules.maxSameCategoryRun);
    let candidates = this.categories.filter((c) => !exclude.has(c));
    if (candidates.length === 0) return null;
    if (last.length === this.rules.maxSameCategoryRun && last.every((c) => c === last[0])) {
      const others = candidates.filter((c) => c !== last[0]);
      if (others.length > 0) candidates = others;
    }
    const minUse = Math.min(...candidates.map((c) => this._categoryUsage.get(c) ?? 0));
    let least = candidates.filter((c) => (this._categoryUsage.get(c) ?? 0) === minUse);
    // 直前と同じカテゴリはなるべく避ける
    const prev = this._lastCategory;
    if (least.length > 1) least = least.filter((c) => c !== prev);
    return least[Math.floor(this.rng() * least.length)];
  }

  _generate() {
    const failed = new Set();
    for (let attempt = 0; attempt < this.categories.length * 2; attempt++) {
      const category = this._pickCategory(failed);
      if (!category) break;
      const difficulty = this._pickDifficulty(category);
      try {
        const picker = this._picker(category, difficulty);
        let q = picker.next();
        // 同じテンプレートは続けない
        for (let i = 0; i < 3 && q.templateId === this._lastTemplate; i++) q = picker.next();
        if (q.templateId === this._lastTemplate) {
          failed.add(category);
          continue;
        }
        this._categoryUsage.set(category, (this._categoryUsage.get(category) ?? 0) + 1);
        this._difficultyUsage.set(difficulty, (this._difficultyUsage.get(difficulty) ?? 0) + 1);
        this._lastCategory = category;
        this._lastTemplate = q.templateId;
        return q;
      } catch (err) {
        // 問題を作れなかったときは、ほかのカテゴリで作る（タイマーは止まっているので時間は減らない）
        console.warn('[certification] 問題の生成に失敗しました', err);
        failed.add(category);
      }
    }
    throw new Error('問題を作れませんでした');
  }

  /**
   * 次の問題を作る（タイマーは止まったまま。表示して回答できるようになったら startAnswering を呼ぶ）
   * @returns {object|null} 時間切れ・終了なら null
   */
  nextQuestion() {
    const s = this._state;
    if (s.phase === 'finished') return null;
    if (s.currentQuestion && !s.answerLocked) return s.currentQuestion;
    if (s.phase === 'playing' && this.timer.state === 'finished') {
      this.finish();
      return null;
    }
    if (s.phase === 'playing' && this.timer.getRemainingMs() <= 0) {
      this.finish();
      return null;
    }
    const q = this._generate();
    this._seq += 1;
    s.currentQuestion = q;
    s.selectedAnswers = [];
    s.answerLocked = false;
    s.lastResult = null;
    s.lastScore = null;
    return q;
  }

  /** 問題を表示して回答できるようになった（1問目でタイマーを始め、2問目からは再開する） */
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

  /** 次にパスしたときに減る時間（ms） */
  nextPassPenaltyMs() {
    return this.rules.passPenalty.perPassMs * (this._state.passes.length + 1);
  }

  /**
   * パス（今の問題を入れかえる）。回答前・時間が残っているときだけ。残り時間を減らし、タイマーを止める
   * （次の問題を作って表示し、startAnswering で再開する）。
   * @returns {{ penaltyMs: number, count: number }|null} 実際に減った時間とパスの回数（パスできなければ null）
   */
  pass() {
    const s = this._state;
    const q = s.currentQuestion;
    if (!q || s.answerLocked || s.phase !== 'playing' || this.timer.state !== 'running') return null;
    if (this.timer.getRemainingMs() <= 0) {
      this.finish();
      return null;
    }
    const penalty = this.nextPassPenaltyMs();
    const before = this.timer.getRemainingMs();
    this.timer.pause();
    this.timer.penalize(penalty);
    const penaltyMs = before - this.timer.getRemainingMs();
    s.passes.push({ number: this._seq, templateId: q.templateId, category: q.category, difficulty: q.difficulty, penaltyMs });
    // 減点はしないが、連続正解ボーナスは途切れる
    s.score = { ...s.score, streak: 0 };
    // 今の問題は答えずに終える（次の nextQuestion で新しい問題を作る）
    s.currentQuestion = null;
    s.selectedAnswers = [];
    if (this.timer.getRemainingMs() <= 0) this.finish();
    return { penaltyMs, count: s.passes.length };
  }

  /** ヒントは段位認定では使えない */
  useHint() {
    return null;
  }

  setSelectedAnswers(ids) {
    if (this._state.answerLocked) return;
    this._state.selectedAnswers = normalizeAnswers(ids);
  }

  /**
   * 回答を確定する。確定した時刻に時間が残っていなければ受け付けない（null を返して終了する）
   * @returns {ReturnType<typeof validateAnswer>|null}
   */
  submit(selected = this._state.selectedAnswers) {
    const s = this._state;
    const q = s.currentQuestion;
    if (!q || s.answerLocked || s.phase !== 'playing' || this.timer.state !== 'running') return null;
    if (!canSubmitAnswer(selected, q.type)) return null;
    // 確定した時刻で時間を決める（制限時間を過ぎた回答は数えない）
    if (this.timer.getRemainingMs() <= 0) {
      this.finish();
      return null;
    }
    this.timer.pause();
    const answerMs = this.timer.getElapsedActiveMs() - this._questionStartActiveMs;
    const result = validateAnswer(q.correctAnswers, selected);
    const applied = applyAnswer(s.score, { difficulty: q.difficulty, isCorrect: result.isCorrect }, this.rules);
    s.score = applied.state;
    // 答えが複数ある問題（多答問題）に完全正解したら、残り時間を増やす
    let timeBonusMs = 0;
    if (result.isCorrect && q.type === 'multiple') {
      timeBonusMs = this.rules.multipleAnswerTimeBonusMs;
      this.timer.addTime(timeBonusMs);
    }
    s.selectedAnswers = result.selected;
    s.answerLocked = true;
    s.lastResult = result;
    s.lastScore = { points: applied.points, bonus: applied.bonus, deduction: applied.deduction, timeBonusMs };
    s.history.push({
      number: this._seq,
      questionId: q.id,
      templateId: q.templateId,
      category: q.category,
      difficulty: q.difficulty,
      status: result.status,
      isCorrect: result.isCorrect,
      points: applied.points,
      bonus: applied.bonus,
      deduction: applied.deduction,
      timeBonusMs,
      answerMs,
      question: q, // 結果画面から間違えた問題を復習するため
    });
    return result;
  }

  /** まだ問題を続けられるか（時間が残っている・終了していない） */
  hasNextQuestion() {
    return this._state.phase !== 'finished' && this.timer.getRemainingMs() > 0;
  }

  isComplete() {
    return !this.hasNextQuestion();
  }

  /** 時間切れか（回答中に 0 になったら終了する。回答中の問題は未回答） */
  checkTimeUp() {
    const s = this._state;
    if (s.phase !== 'playing') return s.phase === 'finished';
    if (this.timer.getRemainingMs() > 0) return false;
    this.finish();
    return true;
  }

  /** 終了する（時間切れ・最後の問題のあと） */
  finish() {
    const s = this._state;
    if (s.phase === 'finished') return this.getSummary();
    this.timer.stop();
    s.phase = 'finished';
    return this.getSummary();
  }

  /** 中断する（タブの切りかえ・画面を離れたとき）。中断した挑戦は記録に入れない */
  abort() {
    this._state.aborted = true;
    this.finish();
  }

  getSummary() {
    const s = this._state;
    const answered = s.history;
    const byCategory = {};
    for (const h of answered) {
      byCategory[h.category] ??= { answered: 0, correct: 0 };
      byCategory[h.category].answered += 1;
      if (h.isCorrect) byCategory[h.category].correct += 1;
    }
    const answerTimes = answered.map((h) => h.answerMs);
    return {
      level: this.level,
      rulesVersion: this.rules.rulesVersion,
      aborted: s.aborted,
      score: s.score.score,
      correctCount: s.score.correct,
      answeredCount: s.score.answered,
      accuracy: s.score.answered === 0 ? 0 : s.score.correct / s.score.answered,
      maxStreak: s.score.maxStreak,
      mistakeCount: s.score.mistakes,
      deductionTotal: answered.reduce((t, h) => t + h.deduction, 0),
      timeBonusTotalMs: answered.reduce((t, h) => t + h.timeBonusMs, 0),
      passCount: s.passes.length,
      passPenaltyTotalMs: s.passes.reduce((t, p) => t + p.penaltyMs, 0),
      averageAnswerMs: answerTimes.length === 0 ? 0 : answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length,
      byCategory,
      rankLevel: getRankForScore(this.level, s.score.score, this.rules),
      remainingMs: this.timer.getRemainingMs(),
      history: [...answered],
    };
  }
}
