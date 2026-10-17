/**
 * 問題画面（出題 → 回答 → 正誤・解説 → 次の問題）
 *
 * 役割の分担
 * - 進行と正誤判定 : TrainingSession（core/questionEngine）
 * - 回答の選択状態 : AnswerSelection（core/answerSelection）… 選択肢ボタンはこの状態を表示するだけ
 * - 3D 表示       : cubeViewer（基準要素は reference レイヤー、正誤は wrong / correct レイヤー）
 *
 * 段位認定（mode.kind === 'certification'）でも同じ画面を使う。そのときは
 *   - 進行は mode.session（core/certificationSession）。ヒント・もう一度見る・自由に観察する操作は出さない
 *   - 「○△×」は短く、3D の演出は速く再生し、終わったら自動で次の問題へ進む（その間タイマーは止まっている）
 *   - 問題を表示して回答できるようになったら mode.onQuestionShown()、時間切れ・最後の問題のあとは mode.onFinish() を呼ぶ
 *
 * 3D ビューアは画面を開いている間 1つだけ作り、問題ごとに作り直さない。
 * WebGL が使えない端末でも、3D なしで問題に答えられる。
 */
import { h } from '../utils/dom.js';
import { button, confirmDialog, contentDialog } from './components.js';
import { helpTopicsForQuestion } from '../core/learningHelp.js';
import { renderHelpTopic } from './learningHelpVisuals.js';
import { createCubeViewer, FACE_DISPLAY_MODES } from '../three/cubeViewer.js';
import { AnswerSelection } from '../core/answerSelection.js';
import { ANSWER_STATUS } from '../core/answerValidator.js';
import { difficultyLabel } from '../questions/questionRegistry.js';
import { INITIAL_ORIENTATION } from '../core/cubeOrientation.js';
import { renderVisual, renderChoiceContent } from './visualChoices.js';
import { getSession, finishTraining, getReview, endReview, finishReview } from './trainingStore.js';
import { recordReviewAnswer } from './learningStore.js';
import { showAnswerSplash } from './answerSplash.js';
import { playAnswerSound, playFinishSound } from './answerSound.js';

const RESULT_TITLES = {
  [ANSWER_STATUS.CORRECT]: '正解！',
  [ANSWER_STATUS.PARTIAL]: 'おしい！',
  [ANSWER_STATUS.INCORRECT]: '不正解',
};

/**
 * 回答後の 3D に文字が出る問題か（「図のみ表示」ボタンを出す）
 * 個数・面積・体積・道のりなどの文字か、頂点の記号（A〜H）・点の記号（P・Q・R など）が出る問題
 */
function hasInfoText(q) {
  const steps = q.explanation?.reveal?.steps ?? [];
  const scene = q.scene ?? {};
  const pointLabels = [scene.cutting, scene.surfacePath, scene.solid, scene.metric].some((x) => x?.points?.some((p) => p.label));
  if ((scene.showLabels ?? true) || pointLabels) return true;
  return (
    steps.some((s) => ['countLayers', 'countLayer', 'addBlocks'].includes(s.type) || (s.type === 'highlightSubcubes' && s.label) || (/^(cut|solid|metric)/.test(s.type) && s.label)) ||
    Boolean(q.scene?.surfacePath?.solution?.label)
  );
}

/** 文字と並べて小さく表示する図（色見本・サイコロの目）。それ以外の図の選択肢は大きなボタンにする */
const INLINE_VISUALS = ['swatch', 'pip'];

/** ふつうの立方体として表示するモデル（色や数字の面がない。半透明・頂点の文字つき） */
const PLAIN_CUBE_MODELS = ['cube', 'cutting', 'surfacePath', 'solid', 'metric'];

/** 選択肢の文字数がこれより長ければ1列で表示する */
const LONG_LABEL = 9;

export function mountQuestionScreen(container, { navigate, params, mode = null }) {
  // 段位認定のモード（ui/certificationQuestionScreen が渡す）
  const cert = mode?.kind === 'certification' ? mode : null;
  // 復習（結果画面の「第◯問」・間違えた問題・保存した問題を解き直す）。もとのトレーニングの結果は変えない
  const isReview = !cert && params?.review !== undefined;
  const review = isReview ? getReview() : null;
  if (isReview && !review) {
    navigate(params?.review === 'cert' ? 'certification-result' : params?.review === 'challenge' ? 'challenge-result' : 'result');
    return { unmount() {} };
  }
  const session = cert?.session ?? review?.session ?? getSession();
  if (!session) {
    navigate('categories');
    return { unmount() {} };
  }
  if (!cert && session.isComplete() && !session.state.currentQuestion) {
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
  // 段位認定：自動で次の問題へ進むタイマー
  let advanceTimer = null;

  // ---------- 画面の骨組み ----------
  const progress = h('span', { class: 'quiz-progress' });
  // 今のプレイ形式（トレーニング・復習）がわかるように、上の帯に出す
  const modeBadge = h('span', { class: 'badge badge--mode', 'data-testid': 'play-mode' }, review ? '復習' : 'トレーニング');
  const difficulty = h('span', { class: 'badge badge--info' }, review ? '復習' : difficultyLabel(session.state.difficulty));
  const score = h('span', { class: 'quiz-score' });
  const quitButton = cert
    ? button('やめる', () => cert.onQuit(), 'btn--ghost')
    : review
    ? review.kind === 'card'
      ? button('結果に戻る', () => backToResult(), 'btn--ghost')
      : button('復習をやめる', () => showReviewResult(), 'btn--ghost')
    : button(session.isEndless ? '終了する' : 'やめる', () => confirmQuit(), 'btn--ghost');

  const typeHint = h('p', { class: 'quiz-type' });
  const questionText = h('h2', { class: 'quiz-text', tabindex: '-1' });
  // ヒント（回答前だけ。答えそのものは出さない）
  const hintText = h('p', { class: 'quiz-hint', hidden: true, role: 'note' });
  const hintButton = button('ヒントを見る', () => toggleHint(), 'btn--small btn--hint');
  // 学習ヘルプ（問題に必要な知識の説明）。通常トレーニング・復習だけで開ける（時間制のモードでは出さない）
  const learningHelpRow = h('div', { class: 'quiz-learning-help' });
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
  // 「回答する」のときは、すぐあとに正解・不正解の音が鳴るので、ボタンの「ポッ」は鳴らさない（「次の問題へ」などでは鳴らす）
  submitButton.dataset.clickSound = 'off';
  // 段位認定：「回答する」の左に「パス」（問題を入れかえる。残り時間が減る）
  const passButton = cert?.allowPass ? button('パス', () => confirmPass(), 'btn--large btn--pass') : null;
  const actionRow = h('div', { class: `quiz-actions ${passButton ? 'quiz-actions--with-pass' : ''}` }, passButton, submitButton);

  const resultTitle = h('p', { class: 'feedback__title', role: 'status' });
  const resultDetail = h('p', { class: 'feedback__detail' });
  const explanationText = h('p', { class: 'feedback__explanation' });
  // 回答後の 3D の操作（「視点リセット」などと同じ、立方体の下のボタン列に出す）
  const replayButton = button('もう一度見る', () => playReveal(), 'btn--small');
  // 「図のみ表示」：個数・面積などの文字を隠して、図だけを見る（もう一度押すと文字も表示）
  const figureOnlyButton = button('図のみ表示', () => toggleFigureOnly(), 'btn--small');
  // 展開図の問題：組み立てた立方体と展開図を行き来する
  const netToggleButton = button('展開図に戻す', () => toggleNetFold(), 'btn--small');
  // 小立方体の問題：小立方体をはなす ⇄ もとに戻す
  const separateButton = button('元に戻す', () => toggleSeparation(), 'btn--small');
  const revealTools = [replayButton, figureOnlyButton, netToggleButton, separateButton];
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
  const viewTools = h('div', { class: 'quiz-view__tools' }, replayButton, figureOnlyButton, netToggleButton, separateButton, resetViewButton, faceModeButton);
  const quizView = h('section', { class: 'quiz-view' }, viewport, previewEl, legend, viewTools);
  const quizRoot = h(
    'div',
    { class: 'quiz' },
    h('header', { class: `quiz-header ${cert ? 'quiz-header--certification' : ''}` }, quitButton, ...(cert ? cert.headerItems : [review ? null : modeBadge, progress, difficulty, score])),
    h(
      'div',
      { class: 'quiz-body' },
      quizView,
      // 立方体の下（PC では右）の、スクロールする領域
      h(
        'div',
        { class: 'quiz-scroll' },
        h('section', { class: 'quiz-question' }, typeHint, questionText, figures, h('div', { class: 'quiz-hint-row' }, hintButton), hintText, learningHelpRow),
        h('section', { class: 'quiz-answer' }, choicesEl, actionRow, feedback),
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
        replayButton.disabled = playing;
      }),
    );
    // 段位認定：演出は途中の動きを省かずに速く再生する
    if (cert) viewer.animations.setSpeed?.(cert.revealSpeed ?? 1);
    window.cubeMaster = { viewer, session };
  } catch (err) {
    console.error(err);
    viewport.append(h('div', { class: 'error-panel error-panel--overlay' }, h('p', {}, '3D 表示を利用できない端末です。問題文と選択肢で回答できます。')));
    resetViewButton.disabled = true;
    faceModeButton.disabled = true;
  }

  function toggleFaceMode() {
    faceMode = faceMode === FACE_DISPLAY_MODES.TRANSLUCENT ? FACE_DISPLAY_MODES.OPAQUE : FACE_DISPLAY_MODES.TRANSLUCENT;
    viewer?.setFaceDisplayMode(faceMode);
    faceModeButton.textContent = faceMode === FACE_DISPLAY_MODES.TRANSLUCENT ? '面を不透明に' : '面を半透明に';
  }

  // ---------- 出題 ----------
  function showQuestion(q) {
    question = q;
    revealed = false;
    clearTimeout(advanceTimer);
    advanceTimer = null;
    splash?.cancel();
    splash = null;
    const state = session.state;

    progress.textContent = review
      ? review.kind === 'card'
        ? `復習：第${review.number}問`
        : `復習 ${session.questionNumber} / ${review.total}`
      : session.isEndless
        ? `第${session.questionNumber}問`
        : `第${session.questionNumber}問 / ${state.questionLimit}問`;
    updateScore();
    typeHint.textContent = q.type === 'multiple' ? '当てはまるものをすべて選ぼう' : '1つ選ぼう';
    questionText.textContent = q.question;

    // 問題の図（見取図・回転の手順など）
    figures.replaceChildren(...(q.visuals ?? []).map(renderVisual));
    figures.hidden = !q.visuals?.length;

    // 3D：前の問題の演出・強調・選択を消し、この問題の立方体（装飾・向き）や積み木にする
    // 切断・最短経路は、ふつうの立方体（半透明・頂点の文字つき）に点や道を重ねる
    const decorated = !PLAIN_CUBE_MODELS.includes(q.scene.model);
    const isBlocks = q.scene.model === 'blocks';
    previewEl.replaceChildren(...(q.scene.preview ? [renderVisual(q.scene.preview)] : []));
    legend.hidden = decorated; // 基準・正解・まちがいの色分けは位置関係の問題だけ
    if (viewer) {
      viewer.animations.cancel();
      viewer.clearHighlights();
      viewer.clearSelection();
      viewer.setFaceDecorations(decorated && !isBlocks ? q.scene.faces : null);
      viewer.setBlocks(isBlocks ? q.scene.blocks : null, { arrows: q.scene.arrows ?? [], ...(q.scene.counting ? { countingRoom: true } : {}) });
      viewer.setNet?.(q.scene.model === 'net' ? q.scene.net : null);
      viewer.setSubcubes?.(q.scene.model === 'subcubes' ? q.scene.subcubes : null);
      viewer.setCutting?.(q.scene.model === 'cutting' ? q.scene.cutting : null);
      viewer.setSurfacePath?.(q.scene.model === 'surfacePath' ? q.scene.surfacePath : null);
      viewer.setSolid?.(q.scene.model === 'solid' ? q.scene.solid : null);
      viewer.setMetric?.(q.scene.model === 'metric' ? q.scene.metric : null, { view: q.scene.cameraPreset });
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
    submitButton.dataset.clickSound = 'off';
    if (passButton) {
      passButton.hidden = false;
      passButton.disabled = false;
    }
    // もう一度見る・図のみ表示・展開図に戻す・元に戻すは、回答したあとだけ
    for (const b of revealTools) b.hidden = true;
    setFigureOnly(false);
    // ヒント：同じ問題では何度見ても同じ内容。ヒントのない問題ではボタンを出さない
    hintText.hidden = true;
    hintText.textContent = '';
    hintButton.hidden = Boolean(cert) || !q.hint?.text; // 段位認定ではヒントを使えない
    // 学習ヘルプ：問題で使う知識（角すいの体積・ねじれの位置など）の説明。時間制のモードでは、プレイ中に開けない
    const topics = cert ? [] : helpTopicsForQuestion(q);
    learningHelpRow.replaceChildren(
      ...topics.map((t) => button(`？ ${t.title}`, () => contentDialog({ title: t.title, content: renderHelpTopic(t.id) }), 'btn--small btn--learning-help')),
    );
    learningHelpRow.hidden = topics.length === 0;
    hintButton.textContent = 'ヒントを見る';
    hintButton.setAttribute('aria-expanded', 'false');
    renderChoices();
    questionText.focus({ preventScroll: true });
    cert?.onQuestionShown();
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
    if (passButton) passButton.disabled = true; // 回答したあとはパスできない（行の形はそのまま）
    const result = session.submit(selected);
    if (!result) {
      // 段位認定：時間切れ（確定した時刻に時間が残っていなかった）。この回答は数えない
      cert?.onFinish();
      return;
    }
    cert?.onAnswered(result);
    // 回答したらヒントは閉じる（回答後は使わない）
    hintButton.hidden = true;
    hintText.hidden = true;
    if (review) recordReviewAnswer(question, result.isCorrect);
    renderChoices();
    // 「○△×」を大きく出して効果音を鳴らし、消えてから正誤・解説・3D の演出を出す
    playAnswerSound(result.status);
    splash = showAnswerSplash(
      quizRoot,
      result.status,
      () => {
        splash = null;
        if (disposed) return;
        revealResult(result);
      },
      cert ? { duration: cert.splashMs } : undefined,
    );
  }

  function revealResult(result) {
    revealed = true;
    showResult(result);
    applyInteraction(question, 'after');
    const done = playReveal();
    if (cert) scheduleAdvance(done);
  }

  /**
   * 段位認定：3D の演出が終わったら（長すぎるときは revealMaxMs で最終状態にして）、少し待って次の問題へ
   * 演出が失敗しても、タイマーは止めたまま次の問題へ進む
   */
  function scheduleAdvance(done) {
    const q = question;
    const maxMs = cert.revealMaxMs ?? 3000;
    const limit = new Promise((resolve) => {
      const t = setTimeout(resolve, maxMs);
      cleanups.push(() => clearTimeout(t));
    });
    Promise.race([Promise.resolve(done).catch(() => {}), limit]).then(() => {
      if (disposed || question !== q) return;
      viewer?.animations.skip();
      advanceTimer = setTimeout(() => {
        advanceTimer = null;
        if (!disposed && question === q) goNext();
      }, cert.advanceDelayMs ?? 500);
    });
  }

  function showResult(result) {
    resultTitle.textContent = RESULT_TITLES[result.status];
    resultTitle.className = `feedback__title feedback__title--${result.status}`;
    resultDetail.textContent = resultDetailText(result);
    explanationText.textContent = resolveChoiceRefs(question.explanation.text);
    // 段位認定：くわしい解説は出さず（結果画面から復習できる）、得点・ペナルティを短く出す
    feedback.classList.toggle('feedback--certification', Boolean(cert));
    if (cert) resultDetail.textContent = [resultDetailText(result), cert.scoreText?.()].filter(Boolean).join(' ');
    replayButton.hidden = !viewer || Boolean(cert);
    figureOnlyButton.hidden = !viewer || Boolean(cert) || !hasInfoText(question);
    setFigureOnly(false);
    netToggleButton.hidden = question.scene.model !== 'net' || !viewer || Boolean(cert);
    netToggleButton.textContent = '展開図に戻す';
    separateButton.hidden = question.scene.model !== 'subcubes' || !viewer || Boolean(cert);
    separateButton.textContent = '元に戻す';
    hintButton.hidden = true;
    hintText.hidden = true;
    // 回答後にだけ見せる印（立方体にならない展開図の重なるマスなど）を表示する
    choicesEl.classList.add('choices--answered');
    delete submitButton.dataset.clickSound;
    submitButton.textContent = cert
      ? session.hasNextQuestion()
        ? '次の問題へ'
        : '結果へ'
      : review
      ? review.kind === 'card'
        ? '結果に戻る'
        : session.hasNextQuestion()
          ? '次の問題へ'
          : '復習の結果を見る'
      : session.hasNextQuestion()
        ? '次の問題へ'
        : '結果を見る';
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

  /** 正解演出（誤選択を赤 → 正解を緑で1つずつ）。終了で解決する Promise（3D がなければ undefined） */
  function playReveal() {
    const result = session.state.lastResult;
    if (!viewer || !result) return undefined;
    const wrong = result.wrong.map((id) => question.choices.find((c) => c.id === id)?.elementId).filter(Boolean);
    const correct = question.explanation.highlightElements;
    const reveal = question.explanation.reveal;
    if (reveal) {
      // 回転・視点移動つきの演出（はじめの向きに戻してから再生）
      return viewer.playQuestionReveal({
        orientation: question.scene.orientation ?? INITIAL_ORIENTATION,
        cameraPreset: question.scene.cameraPreset,
        steps: reveal.steps,
        wrong,
        correct,
      });
    }
    return viewer.playAnswerReveal({ wrong, correct });
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

  /**
   * 段位認定：パスの確認（確認している間も時間は減り続ける）。「はい」で問題を入れかえる
   */
  async function confirmPass() {
    if (!cert || session.state.answerLocked || disposed) return;
    const q = question;
    const penaltySec = Math.round(session.nextPassPenaltyMs() / 1000);
    const dialog = confirmDialog({
      title: '問題を入れかえますか？',
      message: `ペナルティ：残り時間 −${penaltySec}秒`,
      okLabel: 'はい',
      cancelLabel: 'いいえ',
    });
    cleanups.push(() => dialog.el.isConnected && dialog.close(false));
    // 時間切れ・回答・ほかの問題に変わったあとの「はい」は何もしない
    if (!(await dialog.result) || disposed || question !== q || session.state.answerLocked) return;
    const passed = session.pass();
    if (!passed) {
      cert.onFinish();
      return;
    }
    cert.onPassed?.(passed);
    selection?.lock();
    const next = session.hasNextQuestion() ? session.nextQuestion() : null;
    if (next) showQuestion(next);
    else cert.onFinish();
  }

  /** ヒントを見る ⇄ 隠す（回答前だけ） */
  function toggleHint() {
    if (!hintText.hidden) {
      hintText.hidden = true;
      hintButton.textContent = 'ヒントを見る';
      hintButton.setAttribute('aria-expanded', 'false');
      return;
    }
    const text = session.useHint();
    if (!text) return;
    hintText.textContent = `ヒント：${text}`;
    hintText.hidden = false;
    hintButton.textContent = 'ヒントを隠す';
    hintButton.setAttribute('aria-expanded', 'true');
  }

  /** 図のみ表示 ⇄ 文字も表示 */
  function setFigureOnly(on) {
    viewer?.setFigureOnly?.(on);
    figureOnlyButton.textContent = on ? '文字も表示' : '図のみ表示';
    figureOnlyButton.setAttribute('aria-pressed', String(on));
  }
  function toggleFigureOnly() {
    setFigureOnly(!viewer?.isFigureOnly?.());
  }

  /** 小立方体をはなす ⇄ もとに戻す */
  function toggleSeparation() {
    if (!viewer?.playSubcubeSeparation) return;
    const separated = viewer.getSubcubeSeparation() > 0.5;
    viewer.playSubcubeSeparation({ to: separated ? 0 : 1 });
    separateButton.textContent = separated ? '分離して見る' : '元に戻す';
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
    if (cert) return cert.onScore?.();
    score.textContent = review ? '' : `正解 ${s.correctCount}`;
  }

  // ---------- 次の問題・終了 ----------
  function goNext() {
    if (cert) {
      // 段位認定：回答した問題のあとだけ進める（連打で2回進まない）
      if (!session.state.answerLocked || disposed) return;
      clearTimeout(advanceTimer);
      advanceTimer = null;
      viewer?.animations.cancel();
      const next = session.hasNextQuestion() ? session.nextQuestion() : null;
      if (next) showQuestion(next);
      else cert.onFinish();
      return;
    }
    viewer?.animations.cancel(); // 前問の演出を終わらせる
    if (review) {
      if (review.kind === 'card') backToResult();
      else if (session.hasNextQuestion()) showQuestion(session.nextQuestion());
      else showReviewResult();
      return;
    }
    if (!session.hasNextQuestion()) {
      playFinishSound(); // 決めた問題数を解き終えた（「やめる」で途中終了したときは鳴らさない）
      finishTraining();
      navigate('result');
      return;
    }
    showQuestion(session.nextQuestion());
  }

  /** 復習を終えて、もとの結果画面に戻る */
  function backToResult() {
    viewer?.animations.cancel();
    endReview();
    navigate('result');
  }

  /** 復習（間違えた問題・保存した問題）を終えて、復習の結果を見る */
  function showReviewResult() {
    viewer?.animations.cancel();
    finishReview();
    navigate('review-result');
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
  if (cert) {
    const first = session.nextQuestion();
    if (first) showQuestion(first);
    else cert.onFinish();
  } else if (current) {
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
    /** 時間切れ：回答・選択の変更・パスをすぐに止める（TIME UP! の表示の前でも押せないように） */
    lock() {
      selection?.lock();
      for (const el of choicesEl.children) el.disabled = true;
      submitButton.disabled = true;
      if (passButton) passButton.disabled = true;
      clearTimeout(advanceTimer);
      advanceTimer = null;
    },
    unmount() {
      disposed = true;
      splash?.cancel();
      clearTimeout(advanceTimer);
      for (const off of cleanups) off();
      viewer?.dispose();
      if (window.cubeMaster?.viewer === viewer) delete window.cubeMaster;
    },
  };
}
