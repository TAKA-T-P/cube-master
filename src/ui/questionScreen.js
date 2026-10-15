/**
 * 問題画面（出題 → 回答 → 正誤・解説 → 次の問題）
 *
 * 役割の分担
 * - 進行と正誤判定 : TrainingSession（core/questionEngine）
 * - 回答の選択状態 : AnswerSelection（core/answerSelection）… 選択肢ボタンはこの状態を表示するだけ
 * - 3D 表示       : cubeViewer（基準要素は reference レイヤー、正誤は wrong / correct レイヤー）
 *
 * 3D ビューアは画面を開いている間 1つだけ作り、問題ごとに作り直さない。
 * WebGL が使えない端末でも、3D なしで問題に答えられる。
 */
import { h } from '../utils/dom.js';
import { button, confirmDialog } from './components.js';
import { createCubeViewer, FACE_DISPLAY_MODES } from '../three/cubeViewer.js';
import { AnswerSelection } from '../core/answerSelection.js';
import { ANSWER_STATUS } from '../core/answerValidator.js';
import { difficultyLabel } from '../questions/questionRegistry.js';
import { getSession, finishTraining } from './trainingStore.js';

const RESULT_TITLES = {
  [ANSWER_STATUS.CORRECT]: '正解！',
  [ANSWER_STATUS.PARTIAL]: 'おしい！',
  [ANSWER_STATUS.INCORRECT]: '不正解',
};

/** 選択肢の文字数がこれより長ければ1列で表示する */
const LONG_LABEL = 9;

export function mountQuestionScreen(container, { navigate }) {
  const session = getSession();
  if (!session) {
    navigate('categories');
    return { unmount() {} };
  }
  if (session.isComplete() && !session.state.currentQuestion) {
    navigate('result');
    return { unmount() {} };
  }

  const cleanups = [];
  let question = null;
  let selection = null;
  let disposed = false;
  let firstQuestion = true;

  // ---------- 画面の骨組み ----------
  const progress = h('span', { class: 'quiz-progress' });
  const difficulty = h('span', { class: 'badge badge--info' }, difficultyLabel(session.state.difficulty));
  const score = h('span', { class: 'quiz-score' });
  const quitButton = button(session.isEndless ? '終了する' : 'やめる', () => confirmQuit(), 'btn--ghost');

  const typeHint = h('p', { class: 'quiz-type' });
  const questionText = h('h2', { class: 'quiz-text', tabindex: '-1' });
  const viewport = h('div', { class: 'viewport viewport--quiz', 'aria-label': '3D立方体（ドラッグで回転）' });
  const legend = h(
    'div',
    { class: 'quiz-legend', 'aria-hidden': 'true' },
    h('span', { class: 'legend legend--reference' }, '基準'),
    h('span', { class: 'legend legend--correct' }, '正解'),
    h('span', { class: 'legend legend--wrong' }, 'まちがい'),
  );
  const resetViewButton = button('視点リセット', () => viewer?.resetCamera(), 'btn--small');
  let faceMode = FACE_DISPLAY_MODES.TRANSLUCENT;
  const faceModeButton = button('面を不透明に', () => toggleFaceMode(), 'btn--small');

  const choicesEl = h('div', { class: 'choices', role: 'group', 'aria-label': '選択肢' });
  const submitButton = button('回答する', () => submit(), 'btn--primary btn--large');

  const resultTitle = h('p', { class: 'feedback__title', role: 'status' });
  const resultDetail = h('p', { class: 'feedback__detail' });
  const explanationText = h('p', { class: 'feedback__explanation' });
  const replayButton = button('もう一度見る', () => playReveal(), 'btn--small');
  const skipButton = button('スキップ', () => viewer?.animations.skip(), 'btn--small btn--ghost');
  const nextButton = button('次の問題へ', () => goNext(), 'btn--primary btn--large');
  const feedback = h(
    'section',
    { class: 'feedback', hidden: true, 'aria-live': 'polite' },
    resultTitle,
    resultDetail,
    h('div', { class: 'feedback__box' }, h('h3', {}, '解説'), explanationText, h('div', { class: 'feedback__tools' }, replayButton, skipButton)),
    nextButton,
  );

  container.append(
    h(
      'div',
      { class: 'quiz' },
      h('header', { class: 'quiz-header' }, quitButton, progress, difficulty, score),
      h(
        'div',
        { class: 'quiz-body' },
        h('section', { class: 'quiz-question' }, typeHint, questionText),
        h('section', { class: 'quiz-view' }, viewport, legend, h('div', { class: 'quiz-view__tools' }, resetViewButton, faceModeButton)),
        h('section', { class: 'quiz-answer' }, choicesEl, submitButton, feedback),
      ),
    ),
  );

  // ---------- 3D ビューア ----------
  let viewer = null;
  try {
    viewer = createCubeViewer(viewport);
    viewer.setSelectionEnabled(false); // 回答は選択肢ボタンで行う
    viewer.setFaceDisplayMode(faceMode);
    cleanups.push(
      viewer.events.on('animation:state', ({ playing }) => {
        skipButton.disabled = !playing;
        replayButton.disabled = playing;
      }),
    );
    window.cubeMaster = { viewer, session };
  } catch (err) {
    console.error(err);
    viewport.append(h('div', { class: 'error-panel error-panel--overlay' }, h('p', {}, '3D 表示を利用できない端末です。問題文と選択肢で回答できます。')));
    resetViewButton.disabled = true;
    faceModeButton.disabled = true;
  }
  skipButton.disabled = true;

  function toggleFaceMode() {
    faceMode = faceMode === FACE_DISPLAY_MODES.TRANSLUCENT ? FACE_DISPLAY_MODES.OPAQUE : FACE_DISPLAY_MODES.TRANSLUCENT;
    viewer?.setFaceDisplayMode(faceMode);
    faceModeButton.textContent = faceMode === FACE_DISPLAY_MODES.TRANSLUCENT ? '面を不透明に' : '面を半透明に';
  }

  // ---------- 出題 ----------
  function showQuestion(q) {
    question = q;
    const state = session.state;

    progress.textContent = session.isEndless ? `第${session.questionNumber}問` : `第${session.questionNumber}問 / ${state.questionLimit}問`;
    updateScore();
    typeHint.textContent = q.type === 'multiple' ? 'あてはまるものをすべて選ぼう' : '1つ選ぼう';
    questionText.textContent = q.question;

    // 3D：前の問題の演出・強調・選択を消して、基準要素だけをオレンジで表示
    if (viewer) {
      viewer.animations.cancel();
      viewer.clearHighlights();
      viewer.clearSelection();
      viewer.highlightElements(q.scene.referenceElements, { layer: 'reference' });
      viewer.setCameraPreset(q.scene.cameraPreset, { animate: !firstQuestion });
    }
    firstQuestion = false;

    // 回答の選択状態
    selection?.lock();
    selection = new AnswerSelection({ type: q.type, choiceIds: q.choices.map((c) => c.id) });
    selection.onChange(({ selected }) => {
      session.setSelectedAnswers(selected);
      renderChoices();
    });

    const long = q.choices.some((c) => c.label.length > LONG_LABEL);
    choicesEl.className = `choices ${long ? 'choices--single' : ''}`;
    choicesEl.setAttribute('role', q.type === 'single' ? 'radiogroup' : 'group');
    choicesEl.replaceChildren(
      ...q.choices.map((c) =>
        h(
          'button',
          {
            class: 'choice',
            type: 'button',
            role: q.type === 'single' ? 'radio' : 'checkbox',
            'aria-checked': 'false',
            dataset: { choice: c.id },
            onClick: () => selection.toggle(c.id),
          },
          h('span', { class: 'choice__mark', 'aria-hidden': 'true' }),
          h('span', { class: 'choice__label' }, c.label),
        ),
      ),
    );

    feedback.hidden = true;
    submitButton.hidden = false;
    renderChoices();
    questionText.focus({ preventScroll: true });
  }

  /** 選択状態・正誤をボタンに反映する */
  function renderChoices() {
    const result = session.state.lastResult;
    for (const el of choicesEl.children) {
      const id = el.dataset.choice;
      const selected = selection.isSelected(id) || (result?.selected.includes(id) ?? false);
      el.setAttribute('aria-checked', String(selected));
      el.disabled = selection.isLocked();
      el.classList.toggle('choice--selected', selected);
      if (result) {
        const isCorrect = question.correctAnswers.includes(id);
        el.classList.toggle('choice--correct', isCorrect && selected);
        el.classList.toggle('choice--missed', isCorrect && !selected);
        el.classList.toggle('choice--wrong', !isCorrect && selected);
        el.querySelector('.choice__mark').textContent = isCorrect ? '○' : selected ? '×' : '';
      }
    }
    submitButton.disabled = !selection.canSubmit();
  }

  // ---------- 回答 ----------
  function submit() {
    if (!selection.canSubmit()) return;
    const selected = selection.getSelected();
    selection.lock(); // 回答の変更を禁止
    const result = session.submit(selected);
    showResult(result);
    playReveal();
  }

  function showResult(result) {
    resultTitle.textContent = RESULT_TITLES[result.status];
    resultTitle.className = `feedback__title feedback__title--${result.status}`;
    resultDetail.textContent = resultDetailText(result);
    explanationText.textContent = question.explanation.text;
    nextButton.textContent = session.hasNextQuestion() ? '次の問題へ' : '結果を見る';
    submitButton.hidden = true;
    feedback.hidden = false;
    updateScore();
    renderChoices();
  }

  function resultDetailText(result) {
    const labelOf = (id) => question.choices.find((c) => c.id === id)?.label ?? id;
    if (result.status === ANSWER_STATUS.CORRECT) return question.type === 'multiple' ? 'すべて正しく選べました。' : '';
    if (result.status === ANSWER_STATUS.PARTIAL) {
      return result.missing.length > 0 ? 'あと1つ、選びわすれた正解があります。' : 'まちがいが1つ混ざっています。';
    }
    return `正解は「${question.correctAnswers.map(labelOf).join('」「')}」です。`;
  }

  /** 正解演出（誤選択を赤 → 正解を緑で1つずつ） */
  function playReveal() {
    const result = session.state.lastResult;
    if (!viewer || !result) return;
    const wrong = result.wrong.map((id) => question.choices.find((c) => c.id === id)?.elementId).filter(Boolean);
    const correct = question.explanation.highlightElements;
    viewer.playAnswerReveal({ wrong, correct });
  }

  function updateScore() {
    const s = session.state;
    score.textContent = `正解 ${s.correctCount}`;
  }

  // ---------- 次の問題・終了 ----------
  function goNext() {
    viewer?.animations.cancel(); // 前問の演出を終わらせる
    if (!session.hasNextQuestion()) {
      finishTraining();
      navigate('result');
      return;
    }
    showQuestion(session.nextQuestion());
  }

  async function confirmQuit() {
    const dialog = confirmDialog({
      title: session.isEndless ? 'トレーニングを終了しますか？' : 'トレーニングをやめますか？',
      message: 'ここまでに回答した問題の結果を表示します。',
      okLabel: session.isEndless ? '終了する' : 'やめる',
      cancelLabel: 'つづける',
    });
    cleanups.push(() => dialog.el.isConnected && dialog.close(false));
    if (!(await dialog.result) || disposed) return;
    viewer?.animations.cancel();
    finishTraining();
    navigate('result');
  }

  // ---------- 開始（画面を開き直した場合は、続きから表示） ----------
  const current = session.state.currentQuestion;
  if (current) {
    showQuestion(current);
    const result = session.state.lastResult;
    if (session.state.answerLocked && result) {
      selection.lock();
      showResult(result);
      playReveal();
      viewer?.animations.skip();
    }
  } else {
    showQuestion(session.nextQuestion());
  }

  return {
    unmount() {
      disposed = true;
      for (const off of cleanups) off();
      viewer?.dispose();
      if (window.cubeMaster?.viewer === viewer) delete window.cubeMaster;
    },
  };
}
