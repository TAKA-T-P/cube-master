/**
 * 3D プレビュー画面
 *
 * UI はビューアの API と viewer.events だけを使い、Three.js には直接触れない。
 * 開発・検証用に、表示中は window.cubeMaster.viewer からビューア API を呼び出せる。
 */
import { h } from '../utils/dom.js';
import { group, button, segmented, toggle } from './components.js';
import { createCubeViewer, FACE_DISPLAY_MODES } from '../three/cubeViewer.js';
import { WebGLUnavailableError } from '../three/sceneManager.js';
import { ELEMENT_TYPE_LABELS } from '../core/cubeConstants.js';

const MODE_OPTIONS = [
  { value: 'vertex', label: '頂点' },
  { value: 'edge', label: '辺' },
  { value: 'face', label: '面' },
];
const MULTIPLE_OPTIONS = [
  { value: 'single', label: '1つだけ' },
  { value: 'multiple', label: '複数' },
];
const DISPLAY_OPTIONS = [
  { value: FACE_DISPLAY_MODES.OPAQUE, label: '不透明' },
  { value: FACE_DISPLAY_MODES.TRANSLUCENT, label: '半透明' },
  { value: FACE_DISPLAY_MODES.WIREFRAME, label: 'ワイヤー' },
];

/** 解説用の強調表示デモで使う要素 */
const HIGHLIGHT_DEMO_IDS = ['AB', 'BCGF', 'G'];

export function mountPreviewScreen(container, { navigate }) {
  const cleanups = [];
  const viewport = h('div', { class: 'viewport', 'aria-label': '3D立方体の表示領域' });
  const status = h('div', { class: 'selection-status', 'aria-live': 'polite' }, '選択中：なし');
  const panel = h('aside', { class: 'control-panel', 'aria-label': '操作パネル' });

  container.append(
    h(
      'div',
      { class: 'preview' },
      h(
        'header',
        { class: 'page-header page-header--compact' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => navigate('home') }, '← ホーム'),
        h('h1', {}, '3D立方体をためす'),
      ),
      h('div', { class: 'preview-body' }, h('section', { class: 'viewport-wrap' }, viewport, status), panel),
    ),
  );

  // ---------- ビューアの生成 ----------
  let viewer;
  try {
    viewer = createCubeViewer(viewport);
  } catch (err) {
    console.error(err);
    const message =
      err instanceof WebGLUnavailableError
        ? err.message + ' 別のブラウザ（Chrome・Edge・Safari の最新版など）でお試しください。'
        : '3D 表示の準備中にエラーが発生しました。ページを再読み込みしてください。';
    viewport.append(h('div', { class: 'error-panel error-panel--overlay' }, h('p', {}, message)));
    status.remove();
    panel.append(h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('home') }, 'ホームに戻る'));
    return { unmount() {} };
  }
  window.cubeMaster = { viewer };

  // ---------- 操作パネル ----------
  const modeControl = segmented('選択するもの', MODE_OPTIONS, viewer.getSelectionMode(), (v) => viewer.setSelectionMode(v));
  const multipleControl = segmented('選び方', MULTIPLE_OPTIONS, 'single', (v) => viewer.setMultipleSelection(v === 'multiple'));
  const displayControl = segmented('面の表示', DISPLAY_OPTIONS, viewer.getFaceDisplayMode(), (v) => viewer.setFaceDisplayMode(v));

  const clearButton = button('選択をクリア', () => viewer.clearSelection());
  const resetButton = button('視点リセット', () => viewer.resetCamera(), 'btn--primary');
  const rotationSwitch = toggle('自由回転', viewer.isRotationEnabled(), (on) => (on ? viewer.enableRotation() : viewer.disableRotation()));
  const labelSwitch = toggle('頂点ラベル', viewer.getLabelsVisible(), (on) => viewer.setLabelsVisible(on));

  const rotateDemoButton = button('90°回転デモ', () => viewer.playRotationDemo());
  const flashDemoButton = button('面の色変化デモ', () => viewer.playFaceFlashDemo('ABFE'));
  const skipButton = button('演出をスキップ', () => viewer.animations.skip(), 'btn--ghost');
  skipButton.disabled = true;
  const highlightButton = button('強調表示デモ', () => {
    viewer.clearHighlights();
    viewer.highlightElements(HIGHLIGHT_DEMO_IDS, { color: 'correct', duration: 4000 });
  });
  const clearHighlightButton = button('強調を解除', () => viewer.clearHighlights(), 'btn--ghost');

  const debugText = h('pre', { class: 'debug-text' });
  const debug = h('details', { class: 'debug' }, h('summary', {}, '開発者向け情報'), debugText);

  panel.append(
    group('選択', modeControl.el, multipleControl.el, clearButton),
    group('表示', displayControl.el, h('div', { class: 'toggle-row' }, labelSwitch.el, rotationSwitch.el), resetButton),
    group('デモ', h('div', { class: 'button-grid' }, rotateDemoButton, flashDemoButton, highlightButton, clearHighlightButton, skipButton)),
    debug,
  );

  // ---------- 表示の更新 ----------
  const debugState = { camera: viewer.getCameraState(), animation: { playing: false, paused: false }, locked: false };

  function updateStatus() {
    const byType = viewer.getSelectedByType();
    const parts = Object.entries(byType)
      .filter(([, ids]) => ids.length > 0)
      .map(([type, ids]) => `${ELEMENT_TYPE_LABELS[type]} ${ids.join(', ')}`);
    status.textContent = `選択中：${parts.length ? parts.join('／') : 'なし'}`;
    status.classList.toggle('selection-status--active', parts.length > 0);
  }

  function updateDebug() {
    if (!debug.open) return;
    const fmt = (arr) => arr.map((n) => n.toFixed(2)).join(', ');
    const { camera, animation, locked } = debugState;
    debugText.textContent = [
      `選択モード: ${viewer.getSelectionMode()} / 複数: ${viewer.isMultipleSelection()}`,
      `選択ID: ${JSON.stringify(viewer.getSelected())}`,
      `強調ID: ${JSON.stringify(viewer.getHighlighted())}`,
      `カメラ位置: (${fmt(camera.position)})  距離: ${camera.distance.toFixed(2)}`,
      `注視点: (${fmt(camera.target)})`,
      `アニメーション: ${animation.playing ? '再生中' : animation.paused ? '一時停止' : '停止'} / 操作ロック: ${locked}`,
      `面の表示: ${viewer.getFaceDisplayMode()} / ラベル: ${viewer.getLabelsVisible()}`,
    ].join('\n');
  }
  debug.addEventListener('toggle', updateDebug);

  const { events } = viewer;
  cleanups.push(
    events.on('selection:change', () => {
      updateStatus();
      updateDebug();
    }),
    events.on('highlight:change', updateDebug),
    events.on('camera:change', (state) => {
      debugState.camera = state;
      updateDebug();
    }),
    events.on('animation:state', (state) => {
      debugState.animation = state;
      skipButton.disabled = !state.playing;
      updateDebug();
    }),
    events.on('input-lock:change', ({ locked }) => {
      debugState.locked = locked;
      // 演出中は立方体を動かす操作を止める
      for (const b of [rotateDemoButton, flashDemoButton, resetButton]) b.disabled = locked;
      viewport.classList.toggle('viewport--locked', locked);
      updateDebug();
    }),
  );

  updateStatus();

  return {
    unmount() {
      for (const off of cleanups) off();
      viewer.dispose();
      if (window.cubeMaster?.viewer === viewer) delete window.cubeMaster;
    },
  };
}
