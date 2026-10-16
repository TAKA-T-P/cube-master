/**
 * 展開図の 3D モデル（折りたたみアニメーション用）
 *
 * 各マスを1枚のパネルにして、折る順番の木（core/cubeNetFolding の buildFoldTree）どおりに入れ子にする。
 * 子のパネルは、親と共有する辺に置いた「ちょうつがい（hinge）」を軸に回る。
 * 最終位置へ移動させるのではなく、紙を折るように共有辺を支点にして 0°→90° 回す。
 * 折る向きは数学エンジンと同じ規則（親の内側へ 90°）なので、折り終わった形は計算結果と一致する。
 *
 * progress = 0 で平らな展開図、1 で立方体（中心が原点・一辺 2 の、README の座標系の立方体）。
 */
import * as THREE from 'three';
import { buildFoldTree, foldNet } from '../core/cubeNetFolding.js';
import { getNetBounds, cellCorners, pointKey } from '../core/cubeNet.js';
import { drawDecoration } from './faceDecoration.js';
import { easeInOutCubic } from '../utils/easing.js';

const PANEL_COLOR = '#e6f0fb';
const BACK_COLOR = 0xc5d3e3;
const EDGE_COLOR = 0x1f4e9c;
/** 平らな展開図を画面に収める半径 */
const FLAT_RADIUS = 2.4;

export function createNetModel() {
  const root = new THREE.Group();
  root.name = 'netRoot';
  root.visible = false;
  const inner = new THREE.Group();
  root.add(inner);

  const panelGeometry = new THREE.PlaneGeometry(2, 2);
  panelGeometry.rotateX(-Math.PI / 2); // XZ 平面に寝かせる（表は +Y）
  const edgeGeometry = new THREE.EdgesGeometry(panelGeometry);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR });
  const backMaterial = new THREE.MeshStandardMaterial({ color: BACK_COLOR, side: THREE.BackSide, roughness: 0.8 });
  const markerGeometry = new THREE.SphereGeometry(0.13, 16, 12);
  const disposables = [];

  let hinges = []; // { id, object, axis, sign, depth }
  let panels = new Map(); // cellId → パネルのグループ
  let maxDepth = 0;
  let progress = 0;
  let flat = { scale: 1, position: new THREE.Vector3() };
  let current = null;

  function clear() {
    inner.clear();
    for (const d of disposables.splice(0)) d.dispose();
    hinges = [];
    panels = new Map();
    current = null;
  }

  function makePanelMaterial(spec, cellId) {
    const color = spec.cellColors?.[cellId] ?? PANEL_COLOR;
    const face = spec.cellFaces?.[cellId];
    const label = spec.cellLabels?.[cellId];
    let map = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      let ctx = null;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
      if (ctx) {
        if (face) drawDecoration(ctx, { ...face, color }, 256);
        else {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 256, 256);
        }
        if (label) {
          ctx.fillStyle = '#1b2a41';
          ctx.font = 'bold 110px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, 128, 134);
        }
        map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        disposables.push(map);
      }
    }
    const material = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color, map, side: THREE.FrontSide, roughness: 0.75 });
    disposables.push(material);
    return material;
  }

  function apply() {
    // 奥（木の深いところ）のマスから順に折る
    const levels = Math.max(1, maxDepth);
    const span = levels === 1 ? 1 : 0.55;
    for (const h of hinges) {
      const i = maxDepth - h.depth;
      const start = levels === 1 ? 0 : (i * (1 - span)) / (levels - 1);
      const f = Math.min(1, Math.max(0, (progress - start) / span));
      h.object.quaternion.setFromAxisAngle(h.axis, (h.sign * Math.PI * easeInOutCubic(f)) / 2);
    }
    // 平らなときは展開図全体が見える大きさ、立方体になるにつれて元の大きさへ
    const e = easeInOutCubic(progress);
    root.scale.setScalar(flat.scale + (1 - flat.scale) * e);
    root.position.copy(flat.position).multiplyScalar(1 - e);
  }

  return {
    root,
    /**
     * 展開図を置く（null で消す）
     * @param {{ cells, rootId?, cellLabels?, cellFaces?, cellColors?, points?: {x,y,color}[], segments?: {a,b,color}[] }|null} spec
     */
    set(spec) {
      clear();
      root.visible = Boolean(spec);
      if (!spec) return;
      current = spec;
      const fold = foldNet(spec.cells, { rootId: spec.rootId });
      const tree = fold.tree ?? buildFoldTree(spec.cells, spec.rootId);
      const byId = new Map(spec.cells.map((c) => [c.id, c]));
      const rootCell = byId.get(tree.root);
      // 基準のマスが立方体の上面（y = +1）にくるように置く
      inner.position.set(-(2 * rootCell.x + 1), 1, -(2 * rootCell.y + 1));

      const anchors = new Map([[tree.root, new THREE.Vector3(0, 0, 0)]]);
      const nodes = new Map([[tree.root, inner]]);
      maxDepth = Math.max(...Object.values(tree.depth));
      for (const id of tree.order) {
        const cell = byId.get(id);
        let node;
        let anchor;
        if (id === tree.root) {
          node = new THREE.Group();
          inner.add(node);
          anchor = new THREE.Vector3(0, 0, 0);
        } else {
          const [e0, e1] = tree.edge[id];
          anchor = new THREE.Vector3(2 * e0[0], 0, 2 * e0[1]);
          const axis = new THREE.Vector3(2 * (e1[0] - e0[0]), 0, 2 * (e1[1] - e0[1])).normalize();
          const centerFlat = new THREE.Vector3(2 * cell.x + 1, 0, 2 * cell.y + 1);
          const w = centerFlat.clone().sub(anchor);
          w.sub(axis.clone().multiplyScalar(w.dot(axis))).normalize();
          // +90° 回すと w は axis × w の向きへ。そこが内側（-Y）になるように向きを決める
          const sign = axis.clone().cross(w).y < 0 ? 1 : -1;
          node = new THREE.Group();
          node.position.copy(anchor).sub(anchors.get(tree.parent[id]));
          nodes.get(tree.parent[id]).add(node);
          hinges.push({ id, object: node, axis, sign, depth: tree.depth[id] });
        }
        anchors.set(id, anchor);
        nodes.set(id, node);

        // パネル（表・裏・ふち）。node の原点はちょうつがいの位置
        const panel = new THREE.Group();
        panel.name = `panel-${id}`;
        panel.userData.cellId = id;
        panel.position.set(2 * cell.x + 1 - anchor.x, 0, 2 * cell.y + 1 - anchor.z);
        const front = new THREE.Mesh(panelGeometry, makePanelMaterial(spec, id));
        const back = new THREE.Mesh(panelGeometry, backMaterial);
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        for (const o of [front, back, edges]) o.raycast = () => {};
        panel.add(front, back, edges);
        node.add(panel);
        panels.set(id, panel);
      }

      // 点・辺の印（その点・辺をもつマスにつけるので、折ると一緒に動く）
      for (const p of spec.points ?? []) {
        const cell = spec.cells.find((c) => cellCorners(c).some(([x, y]) => x === p.x && y === p.y));
        if (!cell) continue;
        const mat = new THREE.MeshStandardMaterial({ color: p.color ?? '#f06a00', roughness: 0.4 });
        disposables.push(mat);
        const marker = new THREE.Mesh(markerGeometry, mat);
        marker.position.set(2 * (p.x - cell.x) - 1, 0.06, 2 * (p.y - cell.y) - 1);
        marker.userData.point = pointKey(p.x, p.y);
        marker.raycast = () => {};
        panels.get(cell.id).add(marker);
      }
      for (const s of spec.segments ?? []) {
        const cell = spec.cells.find((c) => {
          const corners = cellCorners(c).map(([x, y]) => pointKey(x, y));
          return corners.includes(pointKey(...s.a)) && corners.includes(pointKey(...s.b));
        });
        if (!cell) continue;
        const a = new THREE.Vector3(2 * (s.a[0] - cell.x) - 1, 0.05, 2 * (s.a[1] - cell.y) - 1);
        const b = new THREE.Vector3(2 * (s.b[0] - cell.x) - 1, 0.05, 2 * (s.b[1] - cell.y) - 1);
        const geo = new THREE.CylinderGeometry(0.08, 0.08, 2, 10);
        const mat = new THREE.MeshStandardMaterial({ color: s.color ?? '#f06a00', roughness: 0.4 });
        disposables.push(geo, mat);
        const bar = new THREE.Mesh(geo, mat);
        bar.position.copy(a).add(b).multiplyScalar(0.5);
        bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        bar.userData.segment = `${pointKey(...s.a)}|${pointKey(...s.b)}`;
        bar.raycast = () => {};
        panels.get(cell.id).add(bar);
      }

      // 平らなときの大きさと位置（展開図の中心を画面の中心に）
      const { minX, minY, maxX, maxY, width, height } = getNetBounds(spec.cells);
      const center = new THREE.Vector3(minX + maxX, 0, minY + maxY).add(inner.position);
      const radius = Math.hypot(2 * width, 2 * height) / 2;
      flat = { scale: Math.min(1, FLAT_RADIUS / radius), position: new THREE.Vector3() };
      flat.position.copy(center).multiplyScalar(-flat.scale);
      progress = 0;
      apply();
    },

    /** 折りたたみの進み具合（0 = 展開図、1 = 立方体） */
    setProgress(t) {
      progress = Math.min(1, Math.max(0, t));
      if (current) apply();
    },
    getProgress: () => progress,

    /** パネルの中心と表の向き（ワールド座標。テスト用） */
    getPanelPose(cellId) {
      const panel = panels.get(cellId);
      if (!panel) return null;
      root.updateMatrixWorld(true);
      const center = panel.getWorldPosition(new THREE.Vector3());
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(panel.getWorldQuaternion(new THREE.Quaternion()));
      return { center, normal };
    },
    getMarkerPositions() {
      root.updateMatrixWorld(true);
      const result = {};
      root.traverse((o) => {
        if (o.userData.point) result[o.userData.point] = o.getWorldPosition(new THREE.Vector3());
      });
      return result;
    },
    getSpec: () => current,

    dispose() {
      clear();
      for (const d of [panelGeometry, edgeGeometry, edgeMaterial, backMaterial, markerGeometry]) d.dispose();
      root.removeFromParent();
    },
  };
}
