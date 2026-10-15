/**
 * 共通問題エンジン（カテゴリ共通・Three.js / DOM 非依存）
 *
 * QuestionPicker  : 難易度による抽出、テンプレート・基準要素の重複管理、選択肢のシャッフル
 * TrainingSession : 連続出題の進行（問題番号・正解数・履歴・終了判定）
 *
 * テンプレートの形は src/questions/position/positionGenerators.js を参照。
 */
import { assertValidQuestion } from './questionSchema.js';
import { validateAnswer, canSubmitAnswer, normalizeAnswers } from './answerValidator.js';
import { shuffle, pick } from '../utils/random.js';

/** 問題数「エンドレス」 */
export const ENDLESS = 'endless';
export const DIFFICULTY_ALL = 'all';

/** 選択肢をシャッフルする（fixed: true の選択肢は元の順で末尾に置く） */
export function shuffleChoices(choices, rng = Math.random) {
  const movable = choices.filter((c) => !c.fixed);
  const fixed = choices.filter((c) => c.fixed);
  return [...shuffle(movable, rng), ...fixed];
}

export class QuestionPicker {
  /**
   * @param {{ templates: object[], difficulty?: 1|2|3|'all', rng?: () => number, maxSameTemplateRun?: number }} options
   *   maxSameTemplateRun: 同じテンプレートが連続してよい最大数（既定 2 = 3問以上連続しない）
   */
  constructor({ templates, difficulty = DIFFICULTY_ALL, rng = Math.random, maxSameTemplateRun = 2 }) {
    this.templates = templates.filter((t) => difficulty === DIFFICULTY_ALL || t.difficulty === difficulty);
    if (this.templates.length === 0) throw new Error(`難易度 ${difficulty} の問題がありません`);
    this.difficulty = difficulty;
    this.rng = rng;
    this.maxSameTemplateRun = maxSameTemplateRun;
    this.history = []; // { templateId, key, refs }
    this._templateUsage = new Map();
    this._difficultyUsage = new Map();
    this._groupUsage = new Map();
    this._usedKeys = new Map(); // templateId → Set<key>
    this._bases = new Map(); // templateId → bases（キャッシュ）
    this._seq = 0;
  }

  /** 次の問題を作る */
  next() {
    const template = this._pickTemplate();
    const base = this._pickBase(template);
    const raw = template.build(base, this.rng);
    this._seq += 1;
    const question = assertValidQuestion({
      ...raw,
      id: `${raw.category}-${raw.key.replace(':', '-')}-${String(this._seq).padStart(3, '0')}`,
      choices: shuffleChoices(raw.choices, this.rng),
    });
    this._record(template, base);
    return question;
  }

  _pickTemplate() {
    let candidates = this.templates;

    // 「すべて」では難易度ごとに均等に出題する
    if (this.difficulty === DIFFICULTY_ALL) {
      const levels = [...new Set(candidates.map((t) => t.difficulty))];
      const minUse = Math.min(...levels.map((d) => this._difficultyUsage.get(d) ?? 0));
      const level = pick(levels.filter((d) => (this._difficultyUsage.get(d) ?? 0) === minUse), this.rng);
      candidates = candidates.filter((t) => t.difficulty === level);
    }

    // 同じテンプレートの連続を制限する
    const recent = this.history.slice(-this.maxSameTemplateRun).map((h) => h.templateId);
    if (recent.length === this.maxSameTemplateRun && recent.every((id) => id === recent[0])) {
      const others = candidates.filter((t) => t.id !== recent[0]);
      if (others.length > 0) candidates = others;
    }

    // 出題回数の少ないテンプレートを優先し、直前と同じものはなるべく避ける
    const minUse = Math.min(...candidates.map((t) => this._templateUsage.get(t.id) ?? 0));
    let least = candidates.filter((t) => (this._templateUsage.get(t.id) ?? 0) === minUse);
    const last = this.history.at(-1)?.templateId;
    if (least.length > 1) least = least.filter((t) => t.id !== last);
    return pick(least, this.rng);
  }

  _pickBase(template) {
    if (!this._bases.has(template.id)) this._bases.set(template.id, template.bases());
    const all = this._bases.get(template.id);
    if (!this._usedKeys.has(template.id)) this._usedKeys.set(template.id, new Set());
    const used = this._usedKeys.get(template.id);

    let available = all.filter((b) => !used.has(b.key));
    if (available.length === 0) {
      // 一巡したら再出題を許可する（エンドレス用）
      used.clear();
      available = all;
    }

    // 直前の問題と同じ基準要素を使う問題は避ける
    const prevRefs = this.history.at(-1)?.refs ?? [];
    const fresh = available.filter((b) => !b.refs.some((r) => prevRefs.includes(r)));
    if (fresh.length > 0) available = fresh;

    // 答えの種類（group）が偏らないようにする
    if (available.some((b) => b.group !== undefined)) {
      const groups = [...new Set(available.map((b) => b.group))];
      const usage = (g) => this._groupUsage.get(`${template.id}:${g}`) ?? 0;
      const minUse = Math.min(...groups.map(usage));
      const group = pick(groups.filter((g) => usage(g) === minUse), this.rng);
      available = available.filter((b) => b.group === group);
    }
    return pick(available, this.rng);
  }

  _record(template, base) {
    this.history.push({ templateId: template.id, key: `${template.id}:${base.key}`, refs: base.refs });
    this._templateUsage.set(template.id, (this._templateUsage.get(template.id) ?? 0) + 1);
    this._difficultyUsage.set(template.difficulty, (this._difficultyUsage.get(template.difficulty) ?? 0) + 1);
    if (base.group !== undefined) {
      const k = `${template.id}:${base.group}`;
      this._groupUsage.set(k, (this._groupUsage.get(k) ?? 0) + 1);
    }
    this._usedKeys.get(template.id).add(base.key);
  }
}

export class TrainingSession {
  /**
   * @param {{ category: string, templates: object[], difficulty?: 1|2|3|'all',
   *           questionLimit?: number|'endless', rng?: () => number }} options
   */
  constructor({ category, templates, difficulty = DIFFICULTY_ALL, questionLimit = 10, rng = Math.random }) {
    if (!(questionLimit === ENDLESS || (Number.isInteger(questionLimit) && questionLimit > 0))) {
      throw new Error(`無効な問題数です: ${questionLimit}`);
    }
    this.picker = new QuestionPicker({ templates, difficulty, rng });
    this._state = {
      category,
      difficulty,
      questionLimit,
      currentIndex: 0, // 現在の問題の番号 - 1
      correctCount: 0,
      answeredCount: 0,
      currentQuestion: null,
      selectedAnswers: [],
      answerLocked: false,
      lastResult: null,
      history: [],
      finished: false,
    };
  }

  /** 状態のコピー */
  get state() {
    return { ...this._state, history: [...this._state.history] };
  }

  get isEndless() {
    return this._state.questionLimit === ENDLESS;
  }

  /** 表示用の問題番号（1始まり。まだ出題していなければ 0） */
  get questionNumber() {
    return this._state.currentQuestion ? this._state.currentIndex + 1 : 0;
  }

  /** 規定数を解き終えたか（エンドレスは finish() するまで false） */
  isComplete() {
    return this._state.finished || (!this.isEndless && this._state.answeredCount >= this._state.questionLimit);
  }

  hasNextQuestion() {
    return !this.isComplete();
  }

  /**
   * 次の問題へ進む。回答前の問題があるときはエラー（UI で「次へ」を出さない）。
   * @returns {object|null} 問題（終了していれば null）
   */
  nextQuestion() {
    const s = this._state;
    if (s.currentQuestion && !s.answerLocked) throw new Error('回答していない問題があります');
    if (!this.hasNextQuestion()) return null;
    if (s.currentQuestion) s.currentIndex += 1;
    s.currentQuestion = this.picker.next();
    s.selectedAnswers = [];
    s.answerLocked = false;
    s.lastResult = null;
    return s.currentQuestion;
  }

  /** 回答中の選択を記録する（ロック後は変更しない） */
  setSelectedAnswers(ids) {
    if (this._state.answerLocked) return;
    this._state.selectedAnswers = normalizeAnswers(ids);
  }

  /**
   * 回答を確定して判定する
   * @returns {ReturnType<typeof validateAnswer>}
   */
  submit(selected = this._state.selectedAnswers) {
    const s = this._state;
    const q = s.currentQuestion;
    if (!q) throw new Error('出題中の問題がありません');
    if (s.answerLocked) throw new Error('この問題はすでに回答済みです');
    if (!canSubmitAnswer(selected, q.type)) throw new Error('回答が選ばれていません');

    const result = validateAnswer(q.correctAnswers, selected);
    s.selectedAnswers = result.selected;
    s.answerLocked = true;
    s.lastResult = result;
    s.answeredCount += 1;
    if (result.isCorrect) s.correctCount += 1;
    s.history.push({
      number: s.currentIndex + 1,
      questionId: q.id,
      templateId: q.templateId,
      key: q.key,
      difficulty: q.difficulty,
      selected: result.selected,
      correctAnswers: [...q.correctAnswers],
      status: result.status,
      isCorrect: result.isCorrect,
    });
    return result;
  }

  /** 途中終了・エンドレス終了 */
  finish() {
    this._state.finished = true;
    return this.getSummary();
  }

  /** 結果（正答率は完全正解のみを数える） */
  getSummary() {
    const s = this._state;
    return {
      category: s.category,
      difficulty: s.difficulty,
      questionLimit: s.questionLimit,
      answeredCount: s.answeredCount,
      correctCount: s.correctCount,
      accuracy: s.answeredCount === 0 ? 0 : s.correctCount / s.answeredCount,
      history: [...s.history],
    };
  }
}
