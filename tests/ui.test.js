// @vitest-environment jsdom
// 画面 UI の結線テスト。3D ビューアはモックに置き換え、UI とビューア API のつながりだけを確かめる
// （WebGL 描画そのものは README の手動確認項目）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelectionState } from '../src/core/selectionState.js';
import { createEventBus } from '../src/core/eventBus.js';
import { InputLock } from '../src/core/inputLock.js';

const viewerFactory = vi.hoisted(() => ({ create: null }));

vi.mock('../src/three/cubeViewer.js', () => ({
  FACE_DISPLAY_MODES: { OPAQUE: 'opaque', TRANSLUCENT: 'translucent', WIREFRAME: 'wireframe' },
  createCubeViewer: (...args) => viewerFactory.create(...args),
}));

const { mountPreviewScreen } = await import('../src/ui/previewScreen.js');
const { mountHomeScreen } = await import('../src/ui/homeScreen.js');
const { mountHelpScreen } = await import('../src/ui/helpScreen.js');
const { WebGLUnavailableError } = await import('../src/three/sceneManager.js');

function createFakeViewer() {
  const events = createEventBus();
  const selection = new SelectionState();
  const inputLock = new InputLock();
  selection.onChange((e) => events.emit('selection:change', e));
  inputLock.onChange((locked) => events.emit('input-lock:change', { locked }));
  let mode = 'vertex';
  let display = 'opaque';
  let labels = true;
  return {
    events,
    inputLock,
    animations: { skip: vi.fn() },
    getSelectionMode: () => mode,
    setSelectionMode: vi.fn((m) => (mode = m)),
    setMultipleSelection: vi.fn((m) => selection.setMultiple(m)),
    isMultipleSelection: () => selection.multiple,
    select: (id) => selection.select(id),
    clearSelection: vi.fn(() => selection.clear()),
    getSelected: () => selection.getSelected(),
    getSelectedByType: () => selection.getSelectedByType(),
    getFaceDisplayMode: () => display,
    setFaceDisplayMode: vi.fn((d) => (display = d)),
    getLabelsVisible: () => labels,
    setLabelsVisible: vi.fn((v) => (labels = v)),
    isRotationEnabled: () => true,
    enableRotation: vi.fn(),
    disableRotation: vi.fn(),
    resetCamera: vi.fn(),
    getCameraState: () => ({ position: [4, 3, 5], target: [0, 0, 0], distance: 7, zoom: 1 }),
    playRotationDemo: vi.fn(),
    playFaceFlashDemo: vi.fn(),
    highlightElements: vi.fn(),
    clearHighlights: vi.fn(),
    getHighlighted: () => [],
    dispose: vi.fn(),
  };
}

const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const switchInput = (root, text) => [...root.querySelectorAll('.switch')].find((s) => s.textContent.includes(text)).querySelector('input');

describe('トップ画面', () => {
  it('タイトル・バージョン・準備中ボタンを表示し、有効なボタンで移動する', () => {
    const container = document.createElement('main');
    const navigate = vi.fn();
    mountHomeScreen(container, { navigate, version: '0.2.0' });
    expect(container.querySelector('h1').textContent).toBe('CUBE MASTER');
    expect(container.textContent).toContain('立方体を極める！空間認識トレーニング');
    expect(container.textContent).toContain('Ver.0.2.0');

    // Phase 1：トレーニングは選べる・段位認定は準備中のまま
    const training = container.querySelector('[data-menu="training"]');
    const cert = container.querySelector('[data-menu="certification"]');
    expect(training.disabled).toBe(false);
    expect(cert.disabled).toBe(true);
    expect(cert.textContent).toContain('準備中');

    container.querySelector('[data-menu="preview"]').click();
    container.querySelector('[data-menu="help"]').click();
    training.click();
    cert.click();
    expect(navigate.mock.calls).toEqual([['preview'], ['help'], ['categories']]);
  });
});

describe('ヘルプ画面', () => {
  it('PC とタッチの操作説明を表示する', () => {
    const container = document.createElement('main');
    mountHelpScreen(container, { navigate: vi.fn() });
    expect(container.textContent).toContain('ドラッグ');
    expect(container.textContent).toContain('ピンチ');
    expect(container.textContent).toContain('視点リセット');
  });
});

describe('3D プレビュー画面', () => {
  let container;
  let viewer;

  beforeEach(() => {
    container = document.createElement('main');
    document.body.append(container);
    viewer = createFakeViewer();
    viewerFactory.create = () => viewer;
  });

  afterEach(() => {
    container.remove();
  });

  it('操作パネルのボタンがビューア API を呼ぶ', () => {
    const screen = mountPreviewScreen(container, { navigate: vi.fn() });
    expect(window.cubeMaster.viewer).toBe(viewer);

    button(container, '辺').click();
    expect(viewer.setSelectionMode).toHaveBeenCalledWith('edge');
    button(container, '複数').click();
    expect(viewer.setMultipleSelection).toHaveBeenCalledWith(true);
    button(container, 'ワイヤー').click();
    expect(viewer.setFaceDisplayMode).toHaveBeenCalledWith('wireframe');
    button(container, '視点リセット').click();
    expect(viewer.resetCamera).toHaveBeenCalled();
    button(container, '90°回転デモ').click();
    expect(viewer.playRotationDemo).toHaveBeenCalled();
    button(container, '面の色変化デモ').click();
    expect(viewer.playFaceFlashDemo).toHaveBeenCalled();
    button(container, '強調表示デモ').click();
    expect(viewer.highlightElements).toHaveBeenCalled();

    const labels = switchInput(container, '頂点ラベル');
    labels.click();
    expect(viewer.setLabelsVisible).toHaveBeenCalledWith(false);
    const rotation = switchInput(container, '自由回転');
    rotation.click();
    expect(viewer.disableRotation).toHaveBeenCalled();
    rotation.click();
    expect(viewer.enableRotation).toHaveBeenCalled();

    screen.unmount();
    expect(viewer.dispose).toHaveBeenCalled();
    expect(window.cubeMaster).toBeUndefined();
  });

  it('選択中の ID を表示し、クリアできる', () => {
    mountPreviewScreen(container, { navigate: vi.fn() });
    const status = container.querySelector('.selection-status');
    expect(status.textContent).toBe('選択中：なし');
    viewer.select('BA');
    expect(status.textContent).toBe('選択中：辺 AB');
    viewer.setMultipleSelection(true);
    viewer.select('G');
    viewer.select('EFGH');
    expect(status.textContent).toBe('選択中：頂点 G／辺 AB／面 EFGH');
    button(container, '選択をクリア').click();
    expect(status.textContent).toBe('選択中：なし');
  });

  it('演出中は回転デモ・視点リセットを押せない', () => {
    mountPreviewScreen(container, { navigate: vi.fn() });
    viewer.inputLock.lock('animation');
    expect(button(container, '90°回転デモ').disabled).toBe(true);
    expect(button(container, '視点リセット').disabled).toBe(true);
    viewer.inputLock.unlock('animation');
    expect(button(container, '90°回転デモ').disabled).toBe(false);
  });

  it('WebGL が使えないときはエラーメッセージを表示して画面を崩さない', () => {
    viewerFactory.create = () => {
      throw new WebGLUnavailableError();
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const navigate = vi.fn();
    const screen = mountPreviewScreen(container, { navigate });
    expect(container.textContent).toContain('WebGL2');
    button(container, 'ホームに戻る').click();
    expect(navigate).toHaveBeenCalledWith('home');
    expect(() => screen.unmount()).not.toThrow();
    spy.mockRestore();
  });
});
