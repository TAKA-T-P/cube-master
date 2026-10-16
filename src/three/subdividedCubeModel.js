/**
 * 小立方体に分けた立方体の 3D モデル
 *
 * 小立方体は最大 125〜216 個になるので、1個ずつメッシュを作らずに InstancedMesh で描く。
 *   - 本体：ふつう・強調（緑がかった色）・半透明（条件に合わない）の 3 つの InstancedMesh
 *   - 色を塗った面：外側の面に貼る板（InstancedMesh）。切り口（内側の面）には貼らない
 *   - 輪郭：すべての小立方体の辺を1つの LineSegments にまとめる（ふつう・強調（緑）・半透明の 3 つ）
 *   - 取り除いた小立方体：赤い半透明の箱と赤い輪郭
 *
 * division（0〜1）：境界線の濃さ。0 は切り分ける前の1つの立方体に見える
 * separation（0〜1）：小立方体どうしのすきま。1 でも位置関係がわかる程度（GAP）にとどめる
 * 座標は core/subdividedCube の整数座標（x 右・y 上・z 手前）を、中心が原点になるように置く。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createSubdividedCube, removeSubcubes, subcubeKey, SIDE_NORMALS } from '../core/subdividedCube.js';
import { getPaintedFaces } from '../core/cubePainting.js';

/** 分離したときのすきま（小立方体の一辺に対する割合） */
export const SEPARATION_GAP = 0.32;
/** 全体を、単一の立方体と同じくらいの大きさに縮める半径 */
const FIT_RADIUS = 1.9;

const COLORS = {
  body: 0xeef2f7,
  bodyHighlight: 0xc4efcf,
  paint: 0xec6f6f,
  edge: 0x3f4f62,
  edgeHighlight: 0x17a34a,
  removed: 0xe0262b,
};
const DIM_OPACITY = 0.1;

/** 小立方体の 12 本の辺（中心 0、一辺 1） */
const BOX_EDGES = (() => {
  const c = [-0.5, 0.5];
  const list = [];
  for (const a of c) for (const b of c) {
    list.push([[-0.5, a, b], [0.5, a, b]], [[a, -0.5, b], [a, 0.5, b]], [[a, b, -0.5], [a, b, 0.5]]);
  }
  return list;
})();

export function createSubdividedCubeModel({ labels = typeof document !== 'undefined' } = {}) {
  const root = new THREE.Group();
  root.name = 'subcubesRoot';
  root.visible = false;
  const inner = new THREE.Group();
  root.add(inner);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const plateGeometry = new THREE.PlaneGeometry(0.96, 0.96);
  const materials = {
    body: new THREE.MeshStandardMaterial({ color: COLORS.body, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    bodyHighlight: new THREE.MeshStandardMaterial({ color: COLORS.bodyHighlight, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    bodyDim: new THREE.MeshStandardMaterial({ color: COLORS.body, roughness: 0.8, transparent: true, opacity: DIM_OPACITY, depthWrite: false }),
    paint: new THREE.MeshStandardMaterial({ color: COLORS.paint, roughness: 0.7, side: THREE.DoubleSide }),
    paintDim: new THREE.MeshStandardMaterial({ color: COLORS.paint, roughness: 0.7, transparent: true, opacity: DIM_OPACITY * 1.5, depthWrite: false, side: THREE.DoubleSide }),
    removed: new THREE.MeshBasicMaterial({ color: COLORS.removed, transparent: true, opacity: 0.16, depthWrite: false }),
    edge: new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 1 }),
    edgeHighlight: new THREE.LineBasicMaterial({ color: COLORS.edgeHighlight }),
    edgeDim: new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.12, depthWrite: false }),
    edgeRemoved: new THREE.LineBasicMaterial({ color: COLORS.removed, transparent: true, opacity: 0.85 }),
    outline: new THREE.LineBasicMaterial({ color: COLORS.edge }),
  };

  let spec = null; // { divisions, paintedFaces, removed }
  let cubes = [];
  let removed = [];
  let division = 0;
  let separation = 0;
  let highlightKeys = null; // Set（null なら強調なし）
  let labelText = '';
  let parts = null; // 問題ごとに作る InstancedMesh・LineSegments
  let lastPlates = [];

  // 個数の表示（CSS2D。DOM のないテスト環境では作らない）
  let label = null;
  if (labels) {
    const el = document.createElement('div');
    el.className = 'subcube-count-label';
    label = new CSS2DObject(el);
    label.visible = false;
    inner.add(label);
  }

  function disposeParts() {
    if (!parts) return;
    for (const obj of parts.objects) {
      obj.removeFromParent();
      if (obj.isLineSegments || obj.name === 'outline') obj.geometry.dispose();
      if (obj.isInstancedMesh) obj.dispose?.();
    }
    parts = null;
  }

  const instanced = (geometry, material, capacity, name) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
    mesh.name = name;
    mesh.count = 0;
    mesh.raycast = () => {};
    mesh.frustumCulled = false;
    inner.add(mesh);
    return mesh;
  };
  const lines = (material, name) => {
    const geometry = new THREE.BufferGeometry();
    const obj = new THREE.LineSegments(geometry, material);
    obj.name = name;
    obj.raycast = () => {};
    obj.frustumCulled = false;
    inner.add(obj);
    return obj;
  };

  function build() {
    disposeParts();
    const n = spec.divisions;
    const plateCapacity = cubes.length * 3;
    const objects = [];
    const add = (o) => (objects.push(o), o);
    parts = {
      objects,
      body: {
        normal: add(instanced(boxGeometry, materials.body, cubes.length, 'body')),
        highlight: add(instanced(boxGeometry, materials.bodyHighlight, cubes.length, 'bodyHighlight')),
        dim: add(instanced(boxGeometry, materials.bodyDim, cubes.length, 'bodyDim')),
      },
      paint: {
        normal: add(instanced(plateGeometry, materials.paint, plateCapacity, 'paint')),
        dim: add(instanced(plateGeometry, materials.paintDim, plateCapacity, 'paintDim')),
      },
      removed: add(instanced(boxGeometry, materials.removed, removed.length, 'removed')),
      edges: {
        normal: add(lines(materials.edge, 'edges')),
        highlight: add(lines(materials.edgeHighlight, 'edgesHighlight')),
        dim: add(lines(materials.edgeDim, 'edgesDim')),
        removed: add(lines(materials.edgeRemoved, 'edgesRemoved')),
      },
    };
    // 切り分ける前の大きな立方体の輪郭（分離していないときに見える）
    const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(n, n, n));
    const outline = new THREE.LineSegments(outlineGeometry, materials.outline);
    outline.name = 'outline';
    outline.raycast = () => {};
    inner.add(outline);
    parts.outline = add(outline);
    // 分離しても画面からはみ出さない大きさ
    const radius = (Math.sqrt(3) / 2) * (n + SEPARATION_GAP * (n - 1));
    root.scale.setScalar(FIT_RADIUS / radius);
    if (label) label.position.set(0, (n + SEPARATION_GAP * (n - 1)) / 2 + 0.9, 0);
    update();
  }

  /** 小立方体の中心（inner の座標。中心が原点、小立方体の一辺 = 1） */
  function positionOf(c) {
    const n = spec.divisions;
    const k = 1 + SEPARATION_GAP * separation;
    const off = (n - 1) / 2;
    return new THREE.Vector3((c.x - off) * k, (c.y - off) * k, (c.z - off) * k);
  }

  const dummy = new THREE.Object3D();
  const Z = new THREE.Vector3(0, 0, 1);

  function groupOf(c) {
    if (!highlightKeys) return 'normal';
    return highlightKeys.has(subcubeKey(c)) ? 'highlight' : 'dim';
  }

  function update() {
    if (!spec || !parts) return;
    const n = spec.divisions;
    const counts = { normal: 0, highlight: 0, dim: 0 };
    const plateCounts = { normal: 0, dim: 0 };
    const edgePoints = { normal: [], highlight: [], dim: [], removed: [] };
    lastPlates = [];
    for (const c of cubes) {
      const g = groupOf(c);
      const p = positionOf(c);
      dummy.position.copy(p);
      dummy.quaternion.identity();
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      parts.body[g].setMatrixAt(counts[g]++, dummy.matrix);
      for (const [a, b] of BOX_EDGES) edgePoints[g].push(p.x + a[0], p.y + a[1], p.z + a[2], p.x + b[0], p.y + b[1], p.z + b[2]);
      // 色を塗った外側の面に板を貼る
      for (const side of getPaintedFaces(c, n, spec.paintedFaces)) {
        const normal = new THREE.Vector3(...SIDE_NORMALS[side]);
        dummy.position.copy(p).addScaledVector(normal, 0.502);
        dummy.quaternion.setFromUnitVectors(Z, normal);
        dummy.updateMatrix();
        const pg = g === 'dim' ? 'dim' : 'normal';
        parts.paint[pg].setMatrixAt(plateCounts[pg]++, dummy.matrix);
        lastPlates.push({ key: subcubeKey(c), side });
      }
    }
    for (const [i, c] of removed.entries()) {
      const p = positionOf(c);
      dummy.position.copy(p);
      dummy.quaternion.identity();
      dummy.scale.setScalar(0.98);
      dummy.updateMatrix();
      parts.removed.setMatrixAt(i, dummy.matrix);
      for (const [a, b] of BOX_EDGES) edgePoints.removed.push(p.x + a[0], p.y + a[1], p.z + a[2], p.x + b[0], p.y + b[1], p.z + b[2]);
    }
    parts.removed.count = removed.length;
    parts.removed.instanceMatrix.needsUpdate = true;
    for (const g of ['normal', 'highlight', 'dim']) {
      parts.body[g].count = counts[g];
      parts.body[g].instanceMatrix.needsUpdate = true;
    }
    for (const g of ['normal', 'dim']) {
      parts.paint[g].count = plateCounts[g];
      parts.paint[g].instanceMatrix.needsUpdate = true;
    }
    for (const g of Object.keys(edgePoints)) {
      const geometry = parts.edges[g].geometry;
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePoints[g], 3));
      geometry.computeBoundingSphere();
    }
    // 境界線：division が 0 なら見えない（切り分ける前の立方体）
    materials.edge.opacity = division;
    parts.edges.normal.visible = division > 0.001;
    parts.outline.visible = separation < 0.001;
    if (label) {
      label.visible = Boolean(labelText);
      label.element.textContent = labelText;
    }
  }

  return {
    root,

    /**
     * 小立方体に分けた立方体を置く（null で消す）。はじめは切り分ける前の状態（division = 0, separation = 0）
     * @param {{ divisions: number, paintedFaces?: string[], removed?: {x,y,z}[] }|null} next
     */
    set(next) {
      highlightKeys = null;
      labelText = '';
      division = 0;
      separation = 0;
      if (!next) {
        spec = null;
        cubes = [];
        removed = [];
        disposeParts();
        root.visible = false;
        if (label) label.visible = false;
        return;
      }
      spec = { divisions: next.divisions, paintedFaces: [...(next.paintedFaces ?? [])], removed: (next.removed ?? []).map((c) => ({ ...c })) };
      removed = spec.removed;
      cubes = removeSubcubes(createSubdividedCube(spec.divisions).cubes, removed);
      root.visible = true;
      build();
    },

    setDivision(t) {
      division = Math.min(1, Math.max(0, t));
      update();
    },
    getDivision: () => division,
    setSeparation(t) {
      separation = Math.min(1, Math.max(0, t));
      update();
    },
    getSeparation: () => separation,

    /**
     * 条件に合う小立方体を緑の輪郭で強調し、ほかを半透明にする。label は個数の表示（「8個」）
     * @param {{x,y,z}[]} list
     */
    highlight(list, { label: text = '' } = {}) {
      highlightKeys = new Set(list.map(subcubeKey));
      labelText = text;
      // 強調するものがなければ、ほかを半透明にしない（個数だけ表示する）
      if (highlightKeys.size === 0) highlightKeys = null;
      update();
    },
    clearHighlights() {
      highlightKeys = null;
      labelText = '';
      update();
    },

    /** テスト・確認用の状態 */
    getState() {
      return {
        visible: root.visible,
        divisions: spec?.divisions ?? 0,
        cubeCount: cubes.length,
        removedCount: removed.length,
        highlighted: parts ? parts.body.highlight.count : 0,
        dimmed: parts ? parts.body.dim.count : 0,
        normal: parts ? parts.body.normal.count : 0,
        plates: lastPlates.map((p) => ({ ...p })),
        label: labelText,
        division,
        separation,
        edgesVisible: Boolean(parts?.edges.normal.visible),
        outlineVisible: Boolean(parts?.outline.visible),
      };
    },
    getCubePosition: (c) => (spec ? positionOf(c) : null),

    dispose() {
      disposeParts();
      for (const d of [boxGeometry, plateGeometry, ...Object.values(materials)]) d.dispose();
      label?.element.remove();
      root.removeFromParent();
    },
  };
}
