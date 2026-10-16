/**
 * 積み木の個数の正解演出（three/blockModel の小立方体を、段ごとに分けて数える）
 *
 * - createLayerCounting：上の段を少しずつ持ち上げて段ごとに分け、各段の個数 → 合計を表示する。
 *   見えない積み木があるときは、はじめにほかを半透明にして、かくれた積み木を色付きで示す（B09・B10）
 * - createLayerFocus：指定した段だけを緑にして持ち上げ（ほかは半透明）、1個ずつ数える（B11）
 * - createBlockAdding：今の形に、加える積み木を1つずつ上から置いて完成形にする（B12）
 *
 * どれも animationManager の1つのアニメーションとして再生し、スキップで最終状態、
 * リプレイ（createQuestionReveal の restart → blocks.resetCounting）ではじめの状態に戻る。
 */
import { tween, wait, sequence } from './animationManager.js';
import { easeInOutCubic, easeOutCubic } from '../utils/easing.js';
import { LAYER_GAP } from './blockModel.js';
import { getBlockBounds, cubeKey } from '../core/blockGeometry.js';
import { countBlocksByLayer } from '../core/blockCounting.js';

/** 段の数 k（0〜段数-1。小数で途中）まで分けたときの、下から y 番目（0 始まり）の段の持ち上げる高さ */
export const layerLift = (y, k) => LAYER_GAP * Math.min(y, k);

const layerLabel = (layer, W, D, liftOf) => ({
  text: `${layer.level}段目 ${layer.count}個`,
  position: [W + 0.9, layer.level - 0.5 + liftOf(layer.level - 1), D / 2],
  kind: 'layer',
});

/**
 * 段ごとに分けて数える
 * @param {object} blocks three/blockModel
 * @param {{ hidden?: {x,y,z}[], perLayer?: number, onUpdate?: () => void }} options
 */
export function createLayerCounting(blocks, { hidden = [], perLayer = 800, onUpdate = () => {} } = {}) {
  const cubes = blocks.getCubes();
  const { layers, total } = countBlocksByLayer(cubes);
  const { width: W, height: H, depth: D } = getBlockBounds(cubes);
  const hiddenKeys = new Set(hidden.map(cubeKey));
  const labels = [];
  const apply = (k) => {
    for (const c of cubes) blocks.setCubeLift(c, layerLift(c.y, k));
  };
  const showLabels = (list) => {
    blocks.setLabels(list);
    onUpdate();
  };
  const parts = [];

  // 見えない積み木：ほかを半透明にして、かくれていた積み木を色付きで示す（このあとも色は残す）
  if (hidden.length > 0) {
    parts.push(
      tween({
        duration: 300,
        onStart: () => {
          for (const c of cubes) blocks.setCubeStyle(c, hiddenKeys.has(cubeKey(c)) ? 'hidden' : 'dim');
          showLabels([{ text: `見えない積み木 ${hidden.length}個`, position: [W / 2, H + 0.6, D / 2], kind: 'total' }]);
        },
        onUpdate: () => {},
      }),
      wait(1100),
      tween({
        duration: 250,
        onStart: () => {
          for (const c of cubes) blocks.setCubeStyle(c, hiddenKeys.has(cubeKey(c)) ? 'hidden' : 'base');
          showLabels([]);
        },
        onUpdate: () => {},
      }),
    );
  }

  // 1段目を残して上を持ち上げる → 1段目の個数、2段目を分ける → 2段目の個数 …
  for (let k = 1; k <= H; k++) {
    if (k < H) {
      parts.push(
        tween({
          duration: perLayer,
          easing: easeInOutCubic,
          onUpdate: (t) => {
            apply(k - 1 + t);
            onUpdate();
          },
        }),
      );
    }
    const layer = layers[k - 1];
    parts.push(
      tween({
        duration: 200,
        onStart: () => {
          labels.push(layerLabel(layer, W, D, (y) => layerLift(y, H - 1)));
          showLabels([...labels]);
        },
        onUpdate: () => {},
      }),
      wait(450),
    );
  }
  // 合計
  parts.push(
    tween({
      duration: 300,
      onStart: () => {
        const top = H + layerLift(H - 1, H - 1) + 0.7;
        showLabels([...labels, { text: `合計 ${total}個`, position: [W / 2, top, D / 2], kind: 'total' }]);
      },
      onUpdate: () => {},
    }),
  );
  return sequence(parts);
}

/**
 * 指定した段だけを取り出して数える
 * @param {{ level: number, perCube?: number, onUpdate?: () => void }} options level は下から何段目か（1 始まり）
 */
export function createLayerFocus(blocks, { level, perCube = 380, onUpdate = () => {} } = {}) {
  const cubes = blocks.getCubes();
  const { width: W, depth: D } = getBlockBounds(cubes);
  const y0 = level - 1;
  // 手前・左から順に数える
  const target = cubes.filter((c) => c.y === y0).sort((a, b) => b.z - a.z || a.x - b.x);
  const lift = (y) => (y < y0 ? 0 : y === y0 ? LAYER_GAP : 2 * LAYER_GAP);
  const parts = [
    tween({
      duration: 700,
      easing: easeInOutCubic,
      onStart: () => {
        for (const c of cubes) blocks.setCubeStyle(c, c.y === y0 ? 'highlight' : 'dim');
      },
      onUpdate: (t) => {
        for (const c of cubes) blocks.setCubeLift(c, lift(c.y) * t);
        onUpdate();
      },
    }),
  ];
  const counted = [];
  target.forEach((c, i) => {
    parts.push(
      tween({
        duration: 120,
        onStart: () => {
          counted.push({ text: String(i + 1), position: [c.x + 0.5, c.y + 1 + lift(c.y) + 0.15, c.z + 0.5], kind: 'cube' });
          blocks.setLabels([...counted]);
          onUpdate();
        },
        onUpdate: () => {},
      }),
      wait(perCube),
    );
  });
  parts.push(
    tween({
      duration: 300,
      onStart: () => {
        blocks.setLabels([...counted, { text: `${level}段目 ${target.length}個`, position: [W + 0.9, y0 + 0.5 + LAYER_GAP, D / 2], kind: 'total' }]);
        onUpdate();
      },
      onUpdate: () => {},
    }),
  );
  return sequence(parts);
}

/**
 * 加える積み木を1つずつ上から置いて、完成形にする
 * @param {{ cubes: {x,y,z}[], perCube?: number, onUpdate?: () => void }} options cubes は加える積み木（下の段から順）
 */
export function createBlockAdding(blocks, { cubes: added, perCube = 650, onUpdate = () => {} } = {}) {
  const all = blocks.getCubes();
  const { width: W, height: H, depth: D } = getBlockBounds(all);
  const DROP = 2.5;
  const parts = [
    tween({
      duration: 300,
      onStart: () => {
        // はじめは今の形（加える積み木はまだない）
        for (const c of added) {
          blocks.setCubeVisible(c, false);
          blocks.setCubeStyle(c, 'highlight');
        }
        blocks.setLabels([{ text: '今の形', position: [W / 2, H + 0.6, D / 2], kind: 'layer' }]);
        onUpdate();
      },
      onUpdate: () => {},
    }),
    wait(500),
  ];
  added.forEach((c, i) => {
    parts.push(
      tween({
        duration: perCube,
        easing: easeOutCubic,
        onStart: () => {
          blocks.setCubeVisible(c, true);
          blocks.setLabels([{ text: `${i + 1}個目`, position: [c.x + 0.5, c.y + 1.6, c.z + 0.5], kind: 'cube' }]);
        },
        onUpdate: (t) => {
          blocks.setCubeVisible(c, true);
          blocks.setCubeLift(c, DROP * (1 - t));
          onUpdate();
        },
      }),
      wait(150),
    );
  });
  parts.push(
    tween({
      duration: 300,
      onStart: () => {
        blocks.setLabels([{ text: `完成！ あと${added.length}個`, position: [W / 2, H + 0.6, D / 2], kind: 'total' }]);
        onUpdate();
      },
      onUpdate: () => {},
    }),
  );
  return sequence(parts);
}
