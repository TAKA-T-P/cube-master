/**
 * 積み木（小立方体を積んだ立体）の 3D モデル
 *
 * 単一の立方体のモデル（cubeModel）とは別に作り、積み木の問題のときだけ表示する。
 * 配置データ（core/blockGeometry）から作るので、見取図・投影図と同じ形になる。
 * 見る向きの赤い矢印も、見取図と同じ位置（core/blockGeometry の arrowPoints）に置く。
 *
 * 積み木の個数の問題（Phase 4）では、小立方体ごとに見た目（ふつう・強調・半透明・かくれた積み木）・
 * 持ち上げる高さ・表示の有無を変え、個数のラベルを付けられる（three/blockCountingAnimations が使う）。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { getBlockBounds, arrowPoints, cubeKey } from '../core/blockGeometry.js';
import { CUBE_COLORS } from '../core/cubeConstants.js';

const BLOCK_COLOR = 0xdbe5f1;
const EDGE_COLOR = 0x3f4f62;
const ARROW_COLOR = 0xe0262b;
/** 見えない積み木（ほかの積み木にかくれている）の色 */
const HIDDEN_COLOR = 0xf5a524;
/** 段ごとに持ち上げるときの、段と段のすきま（小立方体の一辺に対する割合） */
export const LAYER_GAP = 0.7;
/** 積み木全体（矢印を含む）を、単一の立方体と同じくらいの大きさに縮める半径 */
const FIT_RADIUS = 1.9;

export function createBlockModel({ labels = typeof document !== 'undefined' } = {}) {
  const root = new THREE.Group();
  root.name = 'blocksRoot';
  root.visible = false;
  const inner = new THREE.Group(); // 積み木の座標（小立方体 1 辺 = 1）のまま置き、root で縮める
  root.add(inner);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const edgeGeometry = new THREE.EdgesGeometry(boxGeometry);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: BLOCK_COLOR, roughness: 0.8 });
  const highlightMaterial = new THREE.MeshStandardMaterial({ color: CUBE_COLORS.correct, roughness: 0.6 });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR });
  const arrowMaterial = new THREE.MeshStandardMaterial({ color: ARROW_COLOR, roughness: 0.5 });
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0xc9d3df, transparent: true, opacity: 0.6, depthWrite: false });
  const dimMaterial = new THREE.MeshStandardMaterial({ color: BLOCK_COLOR, roughness: 0.8, transparent: true, opacity: 0.16, depthWrite: false });
  const hiddenMaterial = new THREE.MeshStandardMaterial({ color: HIDDEN_COLOR, roughness: 0.6 });
  const edgeDimMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.18, depthWrite: false });
  const STYLE_MATERIALS = { base: baseMaterial, highlight: highlightMaterial, dim: dimMaterial, hidden: hiddenMaterial };
  const disposables = [];
  /** 個数のラベル（CSS2D） */
  const labelGroup = new THREE.Group();
  labelGroup.name = 'blockCountLabels';
  /** 小立方体ごとの見た目・持ち上げる高さ（積み木の個数の演出） */
  const styles = new Map();
  const lifts = new Map();
  let labelList = [];

  /** @type {Map<string, THREE.Mesh>} */
  const meshes = new Map();
  let cubes = [];

  function clearLabels() {
    for (const obj of [...labelGroup.children]) {
      obj.element?.remove();
      obj.removeFromParent();
    }
    labelList = [];
  }

  function clear() {
    clearLabels();
    inner.clear();
    meshes.clear();
    styles.clear();
    lifts.clear();
    for (const d of disposables.splice(0)) d.dispose();
    cubes = [];
  }

  function addArrow(from, to) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const dir = end.clone().sub(start);
    const length = dir.length();
    const head = Math.min(0.5, length * 0.4);
    const shaftGeo = new THREE.CylinderGeometry(0.09, 0.09, length - head, 12);
    const headGeo = new THREE.ConeGeometry(0.26, head, 16);
    disposables.push(shaftGeo, headGeo);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const shaft = new THREE.Mesh(shaftGeo, arrowMaterial);
    shaft.position.copy(start).addScaledVector(dir, (length - head) / 2 / length);
    shaft.quaternion.copy(quat);
    const cone = new THREE.Mesh(headGeo, arrowMaterial);
    cone.position.copy(end).addScaledVector(dir, -head / 2 / length);
    cone.quaternion.copy(quat);
    const group = new THREE.Group();
    group.name = 'blockArrow';
    group.add(shaft, cone);
    inner.add(group);
  }

  return {
    root,
    /**
     * 積み木を置く（null で消す）
     * @param {{x,y,z}[]|null} list 小立方体の一覧
     * @param {{ arrows?: string[] }} [options] 見る向きの矢印
     */
    set(list, { arrows = [], countingRoom = false } = {}) {
      clear();
      root.visible = Boolean(list && list.length);
      if (!root.visible) return;
      cubes = list.map((c) => ({ ...c }));
      const { width: W, height: H, depth: D } = getBlockBounds(cubes);

      for (const c of cubes) {
        const mesh = new THREE.Mesh(boxGeometry, baseMaterial);
        mesh.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
        mesh.userData.cube = { ...c };
        mesh.raycast = () => {};
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        edges.raycast = () => {};
        mesh.add(edges);
        inner.add(mesh);
        meshes.set(cubeKey(c), mesh);
      }
      // 床の影
      const shadowGeo = new THREE.PlaneGeometry(W + 0.6, D + 0.6);
      disposables.push(shadowGeo);
      const shadow = new THREE.Mesh(shadowGeo, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(W / 2, -0.01, D / 2);
      inner.add(shadow);

      // 矢印（根元が見る人の側）
      const points = [[0, 0, 0], [W, H, D]];
      for (const a of arrows) {
        const { from, to } = arrowPoints(cubes, a);
        addArrow(from, to);
        points.push(from);
      }

      // 段ごとに持ち上げる演出があるときは、上に余白をとる（持ち上げても画面からはみ出さない）
      if (countingRoom) points.push([W, H + LAYER_GAP * Math.max(1, H) + 0.8, D]);
      inner.add(labelGroup);

      // 中心を原点に合わせ、全体が画面に収まる大きさに縮める
      const box = new THREE.Box3().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() / 2;
      inner.position.copy(center).multiplyScalar(-1);
      root.scale.setScalar(FIT_RADIUS / radius);
    },

    /** 小立方体を緑で強調する */
    highlight(list) {
      for (const c of list) {
        const mesh = meshes.get(cubeKey(c));
        if (mesh) mesh.material = highlightMaterial;
      }
    },

    clearHighlights() {
      for (const mesh of meshes.values()) mesh.material = baseMaterial;
    },

    // ----- 積み木の個数の演出（Phase 4） -----
    /** 見た目：'base'（ふつう）| 'highlight'（緑）| 'dim'（半透明）| 'hidden'（かくれた積み木の色） */
    setCubeStyle(c, style) {
      const mesh = meshes.get(cubeKey(c));
      if (!mesh) return;
      mesh.material = STYLE_MATERIALS[style] ?? baseMaterial;
      mesh.children[0].material = style === 'dim' ? edgeDimMaterial : edgeMaterial;
      styles.set(cubeKey(c), style);
    },
    /** 小立方体を dy だけ持ち上げる（0 でもとの位置） */
    setCubeLift(c, dy) {
      const mesh = meshes.get(cubeKey(c));
      if (!mesh) return;
      mesh.position.y = c.y + 0.5 + dy;
      lifts.set(cubeKey(c), dy);
    },
    setCubeVisible(c, visible) {
      const mesh = meshes.get(cubeKey(c));
      if (mesh) mesh.visible = visible;
    },
    /**
     * 個数のラベルを表示する（前のラベルは消す）
     * @param {{ text: string, position: number[], kind?: 'layer'|'total'|'cube' }[]} list position は積み木の座標
     */
    setLabels(list) {
      clearLabels();
      labelList = list.map((l) => ({ ...l, position: [...l.position] }));
      if (!labels) return;
      for (const l of labelList) {
        const el = document.createElement('div');
        el.className = `block-count-label block-count-label--${l.kind ?? 'layer'}`;
        el.textContent = l.text;
        const obj = new CSS2DObject(el);
        obj.position.set(...l.position);
        labelGroup.add(obj);
      }
    },
    /** 個数の演出の前の状態に戻す（見た目・高さ・表示・ラベル） */
    resetCounting() {
      for (const c of cubes) {
        const mesh = meshes.get(cubeKey(c));
        mesh.material = baseMaterial;
        mesh.children[0].material = edgeMaterial;
        mesh.position.y = c.y + 0.5;
        mesh.visible = true;
      }
      styles.clear();
      lifts.clear();
      clearLabels();
    },
    /** テスト・確認用：小立方体ごとの見た目・高さ・表示と、ラベルの文字 */
    getCountingState() {
      return {
        styles: Object.fromEntries(cubes.map((c) => [cubeKey(c), styles.get(cubeKey(c)) ?? (meshes.get(cubeKey(c)).material === highlightMaterial ? 'highlight' : 'base')])),
        lifts: Object.fromEntries(cubes.map((c) => [cubeKey(c), lifts.get(cubeKey(c)) ?? 0])),
        visible: Object.fromEntries(cubes.map((c) => [cubeKey(c), meshes.get(cubeKey(c)).visible])),
        labels: labelList.map((l) => ({ ...l })),
      };
    },

    getCubes: () => cubes.map((c) => ({ ...c })),
    getMesh: (c) => meshes.get(cubeKey(c)) ?? null,
    isHighlighted: (c) => meshes.get(cubeKey(c))?.material === highlightMaterial,
    getArrowCount: () => inner.children.filter((o) => o.name === 'blockArrow').length,

    dispose() {
      clear();
      for (const d of [boxGeometry, edgeGeometry, baseMaterial, highlightMaterial, edgeMaterial, arrowMaterial, shadowMaterial, dimMaterial, hiddenMaterial, edgeDimMaterial]) d.dispose();
      root.removeFromParent();
    },
  };
}
