/**
 * トライアルの進行（Three.js・DOM 非依存）
 *
 * 90 秒タイマーは core/certificationTimer（回答できる時間だけを数える）を使う。
 *   - 問題を作る・表示する間は止まっている。startAnswering() で始める／再開する
 *   - submit() で回答を確定すると止まる（正解でも不正解でも、○×・正しい答えの演出の間は止まったまま）
 *   - 次の問題を表示して startAnswering() を呼ぶと再開する
 * 時間切れのあとに確定した回答は数えない。
 */
import { createCertificationTimer } from '../certificationTimer.js';
import { TRIAL_RULES, difficultyForLevel, levelAfter, isTrialMode } from './trialRules.js';
import { generateTrialQuestion, checkTrialAnswer } from './trialGenerators.js';

export class TrialSession {
  /**
   * @param {{ mode: string, rules?: object, rng?: () => number, now?: () => number }} options
   */
  constructor({ mode, rules = TRIAL_RULES, rng = Math.random, now }) {
    if (!isTrialMode(mode)) throw new Error(`トライアルの種類が不正です: ${mode}`);
    this.mode = mode;
    this.rules = rules;
    this.rng = rng;
    this.timer = createCertificationTimer({ durationMs: rules.durationMs, now });
    this._seq = 0;
    this._state = {
      phase: 'ready', // ready → playing → finished
      level: rules.startLevel,
      highestLevel: rules.startLevel,
      currentQuestion: null,
      answerLocked: false,
      lastResult: null,
      history: [],
      aborted: false,
    };
  }

  get state() {
    const s = this._state;
    const correctCount = s.history.filter((h) => h.isCorrect).length;
    return { ...s, difficulty: difficultyForLevel(s.level), correctCount, incorrectCount: s.history.length - correctCount, answeredCount: s.history.length, history: [...s.history] };
  }

  get level() {
    return this._state.level;
  }

  get highestLevel() {
    return this._state.highestLevel;
  }

  get isFinished() {
    return this._state.phase === 'finished';
  }

  /** 次の問題（今の LEVEL の難易度。タイマーは止まったまま。時間切れなら null） */
  nextQuestion() {
    const s = this._state;
    if (s.phase === 'finished') return null;
    if (this.timer.state !== 'ready' && this.timer.isExpired()) {
      this.finish();
      return null;
    }
    const difficulty = difficultyForLevel(s.level);
    this._seq += 1;
    const question = { ...generateTrialQuestion(this.mode, difficulty, this.rng), number: this._seq, level: s.level, difficulty };
    s.currentQuestion = question;
    s.answerLocked = false;
    s.lastResult = null;
    return question;
  }

  /** 問題を表示して回答できるようになった（1問目でタイマー開始、2問目からは再開）。時間切れなら false */
  startAnswering() {
    const s = this._state;
    if (s.phase === 'finished' || !s.currentQuestion || s.answerLocked) return false;
    if (s.phase === 'ready') {
      s.phase = 'playing';
      this.timer.start();
      return true;
    }
    if (this.timer.state === 'running') return true;
    if (!this.timer.resume()) {
      this.finish();
      return false;
    }
    return true;
  }

  /**
   * 回答を確定する（タイマーを止めて判定し、LEVEL を変える）。時間切れ・二重の回答は null
   * @returns {{ isCorrect: boolean, levelBefore: number, levelAfter: number, highestLevel: number, detail: object }|null}
   */
  submit(answer) {
    const s = this._state;
    if (s.phase !== 'playing' || !s.currentQuestion || s.answerLocked) return null;
    if (this.timer.state !== 'running') return null;
    this.timer.pause();
    if (this.timer.state === 'finished') {
      // 確定した時刻に時間が残っていなかった
      this.finish();
      return null;
    }
    s.answerLocked = true;
    const detail = checkTrialAnswer(s.currentQuestion, answer);
    const before = s.level;
    s.level = levelAfter(before, detail.isCorrect, this.mode, this.rules);
    s.highestLevel = Math.max(s.highestLevel, s.level);
    const result = { isCorrect: detail.isCorrect, levelBefore: before, levelAfter: s.level, highestLevel: s.highestLevel, detail };
    s.lastResult = result;
    s.history.push({ number: s.currentQuestion.number, level: before, difficulty: s.currentQuestion.difficulty, isCorrect: detail.isCorrect });
    return result;
  }

  /** 進んでいる途中で時間切れになったか（時間切れなら終了にする） */
  checkTimeUp() {
    if (this._state.phase === 'finished') return true;
    if (this.timer.state === 'ready') return false;
    if (this.timer.isExpired()) {
      this.finish();
      return true;
    }
    return false;
  }

  /** 中断（記録しない） */
  abort() {
    if (this._state.phase === 'finished') return;
    this._state.aborted = true;
    this.finish();
  }

  finish() {
    const s = this._state;
    this.timer.stop();
    s.phase = 'finished';
    s.answerLocked = true;
    return this.getSummary();
  }

  /** 結果（正式な記録は highestLevel。finalLevel は記録には使わない） */
  getSummary() {
    const st = this.state;
    return {
      mode: this.mode,
      highestLevel: st.highestLevel,
      finalLevel: st.level,
      correctCount: st.correctCount,
      incorrectCount: st.incorrectCount,
      answeredCount: st.answeredCount,
      aborted: st.aborted,
    };
  }
}
