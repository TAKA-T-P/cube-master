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
import { INITIAL_ORIENTATION } from '../core/cubeOrientation.js';
import { renderVisual, renderChoiceContent } from './visualChoices.js';
import { getSession, finishTraining } from './trainingStore.js';
import { showAnswerSplash } from './answerSplash.js';
import { playAnswerSound } from './answerSound.js';

const RESULT_TITLES = {
  [ANSWER_STATUS.CORRECT]: '正解！',
  [ANSWER_STATUS.PARTIAL]: 'おしい！',
  [ANSWER_STATUS.INCORRECT]: '不正解',
};

/** 文字と並べて小さく表示する図（色見本・サイコロの目）。それ以外の図の選択肢は大きなボタンにする */
const INLINE_VISUALS = ['swatch', 'pip'];

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
  // 回答してから「○△×」が消えるまでは false（その間は正誤・解説を出さない）
  let revealed = false;
  let splash = null;

  // ---------- 画面の骨組み ----------
  const progress = h('span', { class: 'quiz-progress' });
  const difficulty = h('span', { class: 'badge badge--info' }, difficultyLabel(session.state.difficulty));
  const score = h('span', { class: 'quiz-score' });
  const quitButton = button(session.isEndless ? '終了する' : 'やめる', () => confirmQuit(), 'btn--ghost');

  const typeHint = h('p', { class: 'quiz-type' });
  const questionText = h('h2', { class: 'quiz-text', tabindex: '-1' });
  const figures = h('div', { class: 'quiz-figures' });
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
  // 回答前は「回答する」、回答後は同じ場所のまま「次の問題へ」（最後は「結果を見る」）に変わる
  const submitButton = button('回答する', () => (session.state.answerLocked ? goNext() : submit()), 'btn--primary btn--large');

  const resultTitle = h('p', { class: 'feedback__title', role: 'status' });
  const resultDetail = h('p', { class: 'feedback__detail' });
  const explanationText = h('p', { class: 'feedback__explanation' });
  // 回答後の 3D の操作（「視点リセット」などと同じ、立方体の下のボタン列に出す）
  const replayButton = button('もう一度見る', () => playReveal(), 'btn--small');
  const skipButton = button('スキップ', () => viewer?.animations.skip(), 'btn--small btn--ghost');
  // 展開図の問題：組み立てた立方体と展開図を行き来する
  const netToggleButton = button('展開図に戻す', () => toggleNetFold(), 'btn--small');
  const revealTools = [replayButton, skipButton, netToggleButton];
  for (const b of revealTools) b.hidden = true;
  const feedback = h(
    'section',
    { class: 'feedback', hidden: true, 'aria-live': 'polite' },
    resultTitle,
    resultDetail,
    h('div', { class: 'feedback__box' }, h('h3', {}, '解説'), explanationText),
  );

  // 立方体の表示領域（画面に固定。答えが見えてしまう問題では回答するまで表示しない）
  // 回答前に 3D の代わりに表示する静的な図（積み木の見取図など）。回答すると同じ場所が 3D に切り替わる
  const previewEl = h('div', { class: 'quiz-preview', hidden: true });
  const viewTools = h('div', { class: 'quiz-view__tools' }, replayButton, skipButton, netToggleButton, resetViewButton, faceModeButton);
  const quizView = h('section', { class: 'quiz-view' }, viewport, previewEl, legend, viewTools);
  const quizRoot = h(
    'div',
    { class: 'quiz' },
    h('header', { class: 'quiz-header' }, quitButton, progress, difficulty, score),
    h(
      'div',
      { class: 'quiz-body' },
      quizView,
      // 立方体の下（PC では右）の、スクロールする領域
      h(
        'div',
        { class: 'quiz-scroll' },
        h('section', { class: 'quiz-question' }, typeHint, questionText, figures),
        h('section', { class: 'quiz-answer' }, choicesEl, submitButton, feedback),
      ),
    ),
  );
  container.append(quizRoot);

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
    revealed = false;
    splash?.cancel();
    splash = null;
    const state = session.state;

    progress.textContent = session.isEndless ? `第${session.questionNumber}問` : `第${session.questionNumber}問 / ${state.questionLimit}問`;
    updateScore();
    typeHint.textContent = q.type === 'multiple' ? 'あてはまるものをすべて選ぼう' : '1つ選ぼう';
    questionText.textContent = q.question;

    // 問題の図（見取図・回転の手順など）
    figures.replaceChildren(...(q.visuals ?? []).map(renderVisual));
    figures.hidden = !q.visuals?.length;

    // 3D：前の問題の演出・強調・選択を消し、この問題の立方体（装飾・向き）や積み木にする
    const decorated = q.scene.model !== 'cube';
    const isBlocks = q.scene.model === 'blocks';
    previewEl.replaceChildren(...(q.scene.preview ? [renderVisual(q.scene.preview)] : []));
    legend.hidden = decorated; // 基準・正解・まちがいの色分けは位置関係の問題だけ
    if (viewer) {
      viewer.animations.cancel();
      viewer.clearHighlights();
      viewer.clearSelection();
      viewer.setFaceDecorations(decorated && !isBlocks ? q.scene.faces : null);
      viewer.setBlocks(isBlocks ? q.scene.blocks : null, { arrows: q.scene.arrows ?? [] });
      viewer.setNet?.(q.scene.model === 'net' ? q.scene.net : null);
      viewer.setCubeOrientation(q.scene.orientation ?? INITIAL_ORIENTATION);
      viewer.setLabelsVisible(q.scene.showLabels ?? true);
      // 色や数字の立方体は、隠れた面が透けて見えないように不透明にする
      viewer.setFaceDisplayMode(decorated ? FACE_DISPLAY_MODES.OPAQUE : faceMode);
      viewer.highlightElements(q.scene.referenceElements, { layer: 'reference' });
      viewer.setCameraPreset(q.scene.cameraPreset, { animate: !firstQuestion && !decorated });
    }
    faceModeButton.hidden = decorated;
    applyInteraction(q, 'before');
    firstQuestion = false;

    // 回答の選択状態
    selection?.lock();
    selection = new AnswerSelection({ type: q.type, choiceIds: q.choices.map((c) => c.id) });
    selection.onChange(({ selected }) => {
      session.setSelectedAnswers(selected);
      renderChoices();
    });

    const long = q.choices.some((c) => c.label.length > LONG_LABEL);
    const withFigures = q.choices.some((c) => c.visual && !INLINE_VISUALS.includes(c.visual.type));
    choicesEl.className = `choices ${long && !withFigures ? 'choices--single' : ''} ${withFigures ? 'choices--figures' : ''}`;
    choicesEl.setAttribute('role', q.type === 'single' ? 'radiogroup' : 'group');
    choicesEl.replaceChildren(
      ...q.choices.map((c) =>
        h(
          'button',
          {
            class: `choice ${c.visual && !INLINE_VISUALS.includes(c.visual.type) ? 'choice--figure' : ''}`,
            type: 'button',
            role: q.type === 'single' ? 'radio' : 'checkbox',
            'aria-checked': 'false',
            dataset: { choice: c.id },
            onClick: () => selection.toggle(c.id),
          },
          h('span', { class: 'choice__mark', 'aria-hidden': 'true' }),
          ...renderChoiceContent(c),
        ),
      ),
    );

    feedback.hidden = true;
    submitButton.textContent = '回答する';
    // もう一度見る・スキップ・展開図に戻すは、回答したあとだけ
    for (const b of revealTools) b.hidden = true;
    renderChoices();
    questionText.focus({ preventScroll: true });
  }

  /** 選択状態・正誤をボタンに反映する */
  function renderChoices() {
    const result = revealed ? session.state.lastResult : null;
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
    // 回答後は「次の問題へ」として押せる。回答前は選んでいるときだけ押せる（「○△×」の表示中は押せない）
    submitButton.disabled = result ? false : session.state.answerLocked || !selection.canSubmit();
  }

  // ---------- 回答 ----------
  function submit() {
    if (!selection.canSubmit()) return;
    const selected = selection.getSelected();
    selection.lock(); // 回答の変更を禁止
    const result = session.submit(selected);
    renderChoices();
    // 「○△×」を大きく出して効果音を鳴らし、消えてから正誤・解説・3D の演出を出す
    playAnswerSound(result.status);
    splash = showAnswerSplash(quizRoot, result.status, () => {
      splash = null;
      if (disposed) return;
      revealResult(result);
    });
  }

  function revealResult(result) {
    revealed = true;
    showResult(result);
    applyInteraction(question, 'after');
    playReveal();
  }

  function showResult(result) {
    resultTitle.textContent = RESULT_TITLES[result.status];
    resultTitle.className = `feedback__title feedback__title--${result.status}`;
    resultDetail.textContent = resultDetailText(result);
    explanationText.textContent = resolveChoiceRefs(question.explanation.text);
    replayButton.hidden = !viewer;
    skipButton.hidden = !viewer;
    netToggleButton.hidden = question.scene.model !== 'net' || !viewer;
    netToggleButton.textContent = '展開図に戻す';
    // 回答後にだけ見せる印（立方体にならない展開図の重なるマスなど）を表示する
    choicesEl.classList.add('choices--answered');
    submitButton.textContent = session.hasNextQuestion() ? '次の問題へ' : '結果を見る';
    submitButton.disabled = false;
    feedback.hidden = false;
    // スマホでは選択肢の下に結果が出るので、見える位置までスクロールする
    resultTitle.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
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
    const reveal = question.explanation.reveal;
    if (reveal) {
      // 回転・視点移動つきの演出（はじめの向きに戻してから再生）
      viewer.playQuestionReveal({
        orientation: question.scene.orientation ?? INITIAL_ORIENTATION,
        cameraPreset: question.scene.cameraPreset,
        steps: reveal.steps,
        wrong,
        correct,
      });
    } else {
      viewer.playAnswerReveal({ wrong, correct });
    }
  }

  /**
   * 問題ごとの 3D 操作の制限
   * 回答前に回転できない問題（サイコロ・見え方）は、回答するまで立方体そのものを表示せず、
   * 問題文の図だけで考える。回答すると、操作できる立方体が現れて正解演出が始まる。
   */
  function applyInteraction(q, phase) {
    const i = q.scene.interaction ?? {};
    const rotation = phase === 'before' ? (i.allowCameraRotationBeforeAnswer ?? true) : (i.allowCameraRotationAfterAnswer ?? true);
    const zoom = phase === 'before' ? (i.allowZoomBeforeAnswer ?? true) : true;
    const preview = Boolean(q.scene.preview);
    // 静的な図があれば回答前（と 3D が使えない端末）はそれを表示し、なければ立方体の領域ごと隠す
    const showPreview = preview && (phase === 'before' ? !rotation : !viewer);
    const hideView = phase === 'before' && !rotation && !preview;
    quizView.hidden = hideView;
    previewEl.hidden = !showPreview;
    viewport.hidden = showPreview;
    viewTools.hidden = showPreview;
    quizRoot.classList.toggle('quiz--no-view', hideView);
    if (!viewer) return;
    if (rotation) viewer.enableRotation();
    else viewer.disableRotation();
    if (zoom) viewer.enableZoom();
    else viewer.disableZoom();
  }

  /** 解説の〔choice:ID〕を、選択肢の記号（ア・イ…）に置きかえる */
  function resolveChoiceRefs(text) {
    return text.replace(/〔choice:([^〕]+)〕/g, (_, id) => question.choices.find((c) => c.id === id)?.label ?? id);
  }

  /** 組み立てた立方体 ⇄ 展開図 */
  function toggleNetFold() {
    if (!viewer?.playNetFold) return;
    const folded = viewer.getNetFold() > 0.5;
    viewer.playNetFold({ to: folded ? 0 : 1, duration: 1800 });
    netToggleButton.textContent = folded ? '組み立てる' : '展開図に戻す';
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
      revealResult(result);
      viewer?.animations.skip();
    }
  } else {
    showQuestion(session.nextQuestion());
  }

  return {
    unmount() {
      disposed = true;
      splash?.cancel();
      for (const off of cleanups) off();
      viewer?.dispose();
      if (window.cubeMaster?.viewer === viewer) delete window.cubeMaster;
    },
  };
}
