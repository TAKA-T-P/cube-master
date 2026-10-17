/**
 * 立方体に内接する立体の 3D モデル
 *
 * 立体は問題データの点から core/inscribedSolids の凸包で作り、その頂点・面をそのまま描く（数学の計算と同じ形）。
 * 役割（role）ごとに色を変える：main・part・remaining は緑、removed（取り除く立体）は黄色。
 *
 * 表示の段階（どれも 0〜1。演出は three/inscribedSolidAnimations）
 *   build  ：点を結ぶ辺が順に現れ、そのあと面が現れる（main）
 *   fade   ：ふつうの立方体を隠して、うすい線だけの立方体にする
 *   lift   ：main の立体を少し持ち上げる
 *   split  ：main を part（たとえば正八面体の上下2つの四角すい）に分けて、はなす
 *   remove ：removed（黄色）を立方体の外へ動かし、remaining（緑）を残す
 * 回答前は、問題で示す点（オレンジ）と、示した立体の辺（オレンジの線）だけを表示する。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { convexHull } from '../core/inscribedSolids.js';
import { vToNumbers } from '../core/rational.js';
import { CUBE_COLORS } from '../core/cubeConstants.js';
import { tubeSegments, createTubeGeometries, polygonsGeometry, cubeEdgeSegments } from './tubes.js';

const LIFT = 0.35;
const SPLIT_GAP = 0.45;
const REMOVE_GAP = 0.6;
const COLORS = { green: 0x37b864, greenEdge: 0x177a3a, yellow: 0xffc24d, yellowEdge: 0xc77700, outline: CUBE_COLORS.reference, wire: 0x6b84a8 };

const toV = (p) => new THREE.Vector3(...p);

/**
 * @param {{ cubeRoot?, cubeGroups?, labels?, onInfo? }} [options]
 *   cubeGroups：ふつうの立方体のグループ（cubeModel.groups）。立方体を隠すときも、頂点の文字（labelsGroup）は残す
 */
export function createInscribedSolidModel({ cubeRoot = null, cubeGroups = null, labels = typeof document !== 'undefined', onInfo = () => {} } = {}) {
  const root = new THREE.Group();
  root.name = 'inscribedSolidRoot';
  root.visible = false;
  const tubes = createTubeGeometries();
  const sphere = new THREE.SphereGeometry(0.1, 20, 14);
  const materials = {
    point: new THREE.MeshStandardMaterial({ color: CUBE_COLORS.reference, emissive: 0x7a2e00, roughness: 0.35 }),
    outline: new THREE.MeshStandardMaterial({ color: COLORS.outline, roughness: 0.4 }),
    wire: new THREE.LineBasicMaterial({ color: COLORS.wire, transparent: true, opacity: 0 }),
  };

  let spec = null;
  let built = null;
  const progress = { build: 0, fade: 0, lift: 0, split: 0, remove: 0 };
  let infoText = '';

  function clear() {
    if (!built) return;
    for (const d of built.disposables) d.dispose();
    for (const l of built.labels) l.element.remove();
    root.clear();
    built = null;
    onInfo([]);
  }

  function solidObject(points, role, disposables) {
    const poly = convexHull(points);
    const polygons = poly.faces.map((f) => f.polygon.map((p) => toV(vToNumbers(p))));
    const edges = poly.edges.map(([a, b]) => [toV(vToNumbers(a)), toV(vToNumbers(b))]);
    const yellow = role === 'removed';
    const faceMaterial = new THREE.MeshStandardMaterial({ color: yellow ? COLORS.yellow : COLORS.green, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6 });
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: yellow ? COLORS.yellowEdge : COLORS.greenEdge, roughness: 0.4, transparent: true, opacity: 1 });
    const geometry = polygonsGeometry(polygons);
    disposables.push(faceMaterial, edgeMaterial, geometry);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, faceMaterial));
    const edgeGroup = tubeSegments(tubes, edges, edgeMaterial, 0.042);
    group.add(edgeGroup);
    const center = edges.flat().reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / (edges.length * 2));
    group.visible = false;
    root.add(group);
    return { role, group, faceMaterial, edgeMaterial, edgeGroup, center, poly };
  }

  function build() {
    const disposables = [];
    const labelObjs = [];
    // 示す点
    const markers = new THREE.Group();
    for (const p of spec.points) {
      const m = new THREE.Mesh(sphere, materials.point);
      m.position.set(...p.position);
      markers.add(m);
      if (p.label && labels) {
        const el = document.createElement('div');
        el.className = 'cut-point-label';
        el.textContent = p.label;
        const l = new CSS2DObject(el);
        // 立方体の中心の点は少し上に、ほかは外側に文字を置く
        const pos = m.position.clone();
        l.position.copy(pos.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0.25, 0) : pos.multiplyScalar(1.22));
        markers.add(l);
        labelObjs.push(l);
      }
    }
    root.add(markers);
    // 示した立体の辺（オレンジの線）
    const outlines = new THREE.Group();
    for (const pts of spec.outlines ?? []) {
      const poly = convexHull(pts);
      outlines.add(tubeSegments(tubes, poly.edges.map(([a, b]) => [toV(vToNumbers(a)), toV(vToNumbers(b))]), materials.outline, 0.042));
    }
    root.add(outlines);
    // うすい線だけの立方体（立方体を隠したとき）
    const wireGeometry = new THREE.BufferGeometry().setFromPoints(cubeEdgeSegments().flat());
    disposables.push(wireGeometry);
    const wire = new THREE.LineSegments(wireGeometry, materials.wire);
    wire.visible = false;
    root.add(wire);
    const solids = spec.solids.map((x) => solidObject(x.points, x.role, disposables));
    built = { markers, outlines, wire, solids, disposables, labels: labelObjs };
    apply();
  }

  const setCubeVisible = (v) => {
    if (cubeGroups) {
      for (const g of [cubeGroups.facesGroup, cubeGroups.edgesGroup, cubeGroups.verticesGroup, cubeGroups.highlightsGroup]) g.visible = v;
    } else if (cubeRoot) cubeRoot.visible = v;
  };
  const isCubeVisible = () => (cubeGroups ? cubeGroups.facesGroup.visible : cubeRoot ? cubeRoot.visible : null);

  function apply() {
    if (!built) return;
    const { build: tb, fade, lift, split, remove } = progress;
    // 立方体を隠すかどうか
    const hideCube = fade > 0 || remove > 0;
    setCubeVisible(!hideCube);
    built.wire.visible = hideCube;
    materials.wire.opacity = 0.55 * Math.max(fade, remove > 0 ? 1 : 0);
    built.outlines.visible = tb === 0 && remove === 0; // 立体が現れたら、オレンジの線は消す
    for (const s of built.solids) {
      s.group.position.set(0, 0, 0);
      if (s.role === 'main') {
        s.group.visible = tb > 0 && split === 0;
        // 前半：辺が順に現れる、後半：面が現れる
        const n = s.edgeGroup.children.length;
        const shown = Math.ceil(Math.min(1, tb * 2) * n);
        s.edgeGroup.children.forEach((c, i) => (c.visible = i < shown));
        s.faceMaterial.opacity = 0.5 * Math.max(0, tb * 2 - 1);
        s.group.position.y = LIFT * lift;
      } else if (s.role === 'part') {
        s.group.visible = split > 0;
        s.faceMaterial.opacity = 0.5;
        s.group.position.copy(s.center).normalize().multiplyScalar(SPLIT_GAP * split);
      } else if (s.role === 'removed') {
        s.group.visible = remove > 0;
        s.faceMaterial.opacity = 0.62 - 0.25 * remove;
        s.edgeMaterial.opacity = 1 - 0.4 * remove;
        const dir = s.center.lengthSq() > 1e-9 ? s.center.clone().normalize() : new THREE.Vector3(0, 1, 0);
        s.group.position.copy(dir).multiplyScalar(REMOVE_GAP * remove);
      } else if (s.role === 'remaining') {
        s.group.visible = remove > 0;
        s.faceMaterial.opacity = 0.5 * Math.min(1, remove * 1.5);
      }
    }
    onInfo(infoText ? [{ text: infoText, kind: 'total' }] : []);
  }

  const set = (key) => (t) => {
    progress[key] = Math.min(1, Math.max(0, t));
    apply();
  };

  return {
    root,
    /** @param {{ points, outlines?, solids }|null} next scene.solid */
    set(next) {
      clear();
      for (const k of Object.keys(progress)) progress[k] = 0;
      infoText = '';
      spec = next ?? null;
      setCubeVisible(true);
      root.visible = Boolean(spec);
      if (spec) build();
    },
    setBuild: set('build'),
    setFade: set('fade'),
    setLift: set('lift'),
    setSplit: set('split'),
    setRemove: set('remove'),
    getProgress: (key) => progress[key],
    /** 図の右側に出す文字（体積・体積比） */
    setInfo(text) {
      infoText = text ?? '';
      apply();
    },
    reset() {
      for (const k of Object.keys(progress)) progress[k] = 0;
      infoText = '';
      if (spec) setCubeVisible(true);
      apply();
    },
    getState() {
      if (!built) return { visible: root.visible, active: false };
      return {
        visible: root.visible,
        active: true,
        ...progress,
        info: infoText,
        cubeVisible: isCubeVisible(),
        outlinesVisible: built.outlines.visible,
        solids: built.solids.map((s) => ({ role: s.role, visible: s.group.visible, offset: s.group.position.toArray(), vertices: s.poly.vertices.length, faces: s.poly.faces.length })),
      };
    },
    dispose() {
      clear();
      sphere.dispose();
      tubes.cylinder.dispose();
      tubes.joint.dispose();
      for (const m of Object.values(materials)) m.dispose();
      root.removeFromParent();
    },
  };
}
