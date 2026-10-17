/**
 * 立方体の中の線分・三角形・角の 3D モデル（長さ・角度・面積の問題）
 *
 * 点・線分・三角形は問題データの座標をそのまま描く（core/cubeMetricGeometry の計算と同じ図形）。
 *
 * 表示の段階（演出は three/cubeMetricAnimations）
 *   segments（0〜1）：答えの線分（緑）が順に現れる
 *   triangles（三角形ごとに 0〜1）：三角形の辺と面（うすい緑）・直角の印が現れる
 *   angle（0〜1）：角の弧がのびる
 *   extract（0〜1）：立方体をうすい線だけにして、三角形を立方体から取り出し、カメラの正面に向ける（形・大きさは変えない）
 * 回答前は、問題で示す点・線分（オレンジ）だけを表示する。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CUBE_COLORS, DEFAULT_VIEW_DIRECTION } from '../core/cubeConstants.js';
import { tubeSegments, createTubeGeometries, polygonsGeometry, cubeEdgeSegments } from './tubes.js';

const toV = (p) => new THREE.Vector3(...p);
const MARK = 0.16; // 直角の印の大きさ
const ARC = 0.38; // 角の弧の半径
/** 取り出した三角形を置く、立方体の中心からカメラの向きへの距離 */
const EXTRACT_DISTANCE = 1.5;

/**
 * @param {{ cubeRoot?, cubeGroups?, labels?, onInfo? }} [options] cubeGroups：立方体を隠すときも、頂点の文字は残す
 */
export function createCubeMetricModel({ cubeRoot = null, cubeGroups = null, labels = typeof document !== 'undefined', onInfo = () => {} } = {}) {
  const root = new THREE.Group();
  root.name = 'cubeMetricRoot';
  root.visible = false;
  const tubes = createTubeGeometries();
  const sphere = new THREE.SphereGeometry(0.09, 20, 14);
  const materials = {
    point: new THREE.MeshStandardMaterial({ color: CUBE_COLORS.reference, emissive: 0x7a2e00, roughness: 0.35 }),
    given: new THREE.MeshStandardMaterial({ color: CUBE_COLORS.reference, roughness: 0.4 }),
    answer: new THREE.MeshStandardMaterial({ color: CUBE_COLORS.correct, roughness: 0.4 }),
    triEdge: new THREE.MeshStandardMaterial({ color: 0x177a3a, roughness: 0.4 }),
    // 立方体の面と同じ平面の三角形も見えるように、面の奥行きでかくれないようにする
    triFace: new THREE.MeshBasicMaterial({ color: 0x7fd59a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, depthTest: false }),
    mark: new THREE.LineBasicMaterial({ color: 0x0f5c2b }),
    arc: new THREE.LineBasicMaterial({ color: 0xd9480f }),
    wire: new THREE.LineBasicMaterial({ color: 0x6b84a8, transparent: true, opacity: 0.5 }),
  };

  let spec = null;
  let view = new THREE.Vector3(...DEFAULT_VIEW_DIRECTION).normalize();
  let built = null;
  const progress = { segments: 0, angle: 0, extract: 0, triangles: [] };
  let infoText = '';

  const setCubeVisible = (v) => {
    if (cubeGroups) {
      for (const g of [cubeGroups.facesGroup, cubeGroups.edgesGroup, cubeGroups.verticesGroup, cubeGroups.highlightsGroup]) g.visible = v;
    } else if (cubeRoot) cubeRoot.visible = v;
  };
  const isCubeVisible = () => (cubeGroups ? cubeGroups.facesGroup.visible : cubeRoot ? cubeRoot.visible : null);

  function clear() {
    if (!built) return;
    for (const d of built.disposables) d.dispose();
    for (const l of built.labels) l.element.remove();
    root.clear();
    built = null;
    onInfo([]);
  }

  /** 三角形の辺・面・直角の印（中心を原点にした座標で作り、group を中心に置く） */
  function triangleObject(t, disposables) {
    const pts = t.points.map(toV);
    const center = pts[0].clone().add(pts[1]).add(pts[2]).multiplyScalar(1 / 3);
    const local = pts.map((p) => p.clone().sub(center));
    const group = new THREE.Group();
    group.position.copy(center);
    const face = polygonsGeometry([local]);
    disposables.push(face);
    const faceMesh = new THREE.Mesh(face, materials.triFace);
    faceMesh.renderOrder = 3;
    group.add(faceMesh);
    group.add(tubeSegments(tubes, [0, 1, 2].map((i) => [local[i], local[(i + 1) % 3]]), materials.triEdge, 0.042));
    if (t.rightAt !== null && t.rightAt !== undefined) {
      const v = local[t.rightAt];
      const a = local[(t.rightAt + 1) % 3].clone().sub(v).normalize().multiplyScalar(MARK);
      const b = local[(t.rightAt + 2) % 3].clone().sub(v).normalize().multiplyScalar(MARK);
      const g = new THREE.BufferGeometry().setFromPoints([v.clone().add(a), v.clone().add(a).add(b), v.clone().add(b)]);
      disposables.push(g);
      group.add(new THREE.Line(g, materials.mark));
    }
    group.visible = false;
    root.add(group);
    return { group, center, local };
  }

  /** 取り出した三角形の向き：三角形の面をカメラに向け、いちばん長い辺を画面の横にする */
  function extractTarget(tri) {
    const [p0, p1, p2] = tri.local;
    const sides = [
      [p0, p1],
      [p1, p2],
      [p2, p0],
    ].sort((x, y) => y[0].distanceTo(y[1]) - x[0].distanceTo(x[1]));
    const e1 = sides[0][1].clone().sub(sides[0][0]).normalize();
    let n = p1.clone().sub(p0).cross(p2.clone().sub(p0)).normalize();
    if (n.dot(view) < 0) n.negate();
    const z = view.clone();
    const xs = new THREE.Vector3(0, 1, 0).cross(z).normalize();
    const from = new THREE.Matrix4().makeBasis(e1, n.clone().cross(e1), n);
    const to = new THREE.Matrix4().makeBasis(xs, z.clone().cross(xs), z);
    const rot = to.multiply(from.transpose());
    return { quaternion: new THREE.Quaternion().setFromRotationMatrix(rot), position: z.clone().multiplyScalar(EXTRACT_DISTANCE) };
  }

  function build() {
    const disposables = [];
    const labelObjs = [];
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
        l.position.copy(m.position).multiplyScalar(1.22);
        markers.add(l);
        labelObjs.push(l);
      }
    }
    root.add(markers);
    const given = tubeSegments(tubes, (spec.segments ?? []).map((s) => [toV(s.from), toV(s.to)]), materials.given, 0.045);
    root.add(given);
    const answers = (spec.answerSegments ?? []).map((s) => {
      const g = tubeSegments(tubes, [[toV(s.from), toV(s.to)]], materials.answer, 0.048);
      g.visible = false;
      root.add(g);
      return g;
    });
    const triangles = (spec.triangles ?? []).map((t) => triangleObject(t, disposables));
    progress.triangles = triangles.map(() => 0);
    let arc = null;
    if (spec.angle) {
      const v = toV(spec.angle.at);
      const a = toV(spec.angle.a).sub(v).normalize();
      const b = toV(spec.angle.b).sub(v).normalize();
      const c = b.clone().addScaledVector(a, -b.dot(a)).normalize();
      const total = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
      const g = new THREE.BufferGeometry();
      disposables.push(g);
      arc = { line: new THREE.Line(g, materials.arc), v, a, c, total, geometry: g };
      arc.line.visible = false;
      root.add(arc.line);
    }
    const wireGeometry = new THREE.BufferGeometry().setFromPoints(cubeEdgeSegments().flat());
    disposables.push(wireGeometry);
    const wire = new THREE.LineSegments(wireGeometry, materials.wire);
    wire.visible = false;
    root.add(wire);
    built = { markers, given, answers, triangles, arc, wire, disposables, labels: labelObjs, target: triangles.length ? extractTarget(triangles.at(-1)) : null };
    apply();
  }

  function apply() {
    if (!built) return;
    const b = built;
    // 答えの線分（順に現れる）
    const shown = Math.ceil(progress.segments * b.answers.length);
    b.answers.forEach((g, i) => (g.visible = i < shown));
    // 三角形
    b.triangles.forEach((t, i) => {
      const p = progress.triangles[i] ?? 0;
      t.group.visible = p > 0;
      t.group.scale.setScalar(1);
      t.group.position.copy(t.center);
      t.group.quaternion.identity();
    });
    // 角の弧（のびる）
    if (b.arc) {
      const t = progress.angle;
      b.arc.line.visible = t > 0;
      if (t > 0) {
        const pts = [];
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
          const th = (b.arc.total * t * i) / steps;
          pts.push(b.arc.v.clone().addScaledVector(b.arc.a, ARC * Math.cos(th)).addScaledVector(b.arc.c, ARC * Math.sin(th)));
        }
        b.arc.geometry.setFromPoints(pts);
      }
    }
    // 取り出す（いちばん後ろの三角形）
    const e = progress.extract;
    setCubeVisible(e === 0);
    b.wire.visible = e > 0;
    if (e > 0 && b.target) {
      const t = b.triangles.at(-1);
      t.group.visible = true;
      t.group.position.copy(t.center).lerp(b.target.position, e);
      t.group.quaternion.identity().slerp(b.target.quaternion, e);
      // 立方体の中の線分・点は、取り出したあとは目立たないように
      b.given.visible = e < 1;
    } else b.given.visible = true;
    onInfo(infoText ? [{ text: infoText, kind: 'total' }] : []);
  }

  return {
    root,
    /**
     * @param {object|null} next scene.metric
     * @param {{ view?: 'default'|number[] }} [options] 取り出した三角形を向けるカメラの向き（scene.cameraPreset）
     */
    set(next, { view: dir = 'default' } = {}) {
      clear();
      progress.segments = 0;
      progress.angle = 0;
      progress.extract = 0;
      infoText = '';
      view = new THREE.Vector3(...(dir === 'default' ? DEFAULT_VIEW_DIRECTION : dir)).normalize();
      spec = next ?? null;
      setCubeVisible(true);
      root.visible = Boolean(spec);
      if (spec) build();
    },
    setSegments(t) {
      progress.segments = clamp(t);
      apply();
    },
    setTriangle(index, t) {
      progress.triangles[index] = clamp(t);
      apply();
    },
    setAngle(t) {
      progress.angle = clamp(t);
      apply();
    },
    setExtract(t) {
      progress.extract = clamp(t);
      apply();
    },
    setInfo(text) {
      infoText = text ?? '';
      apply();
    },
    reset() {
      progress.segments = 0;
      progress.angle = 0;
      progress.extract = 0;
      progress.triangles = progress.triangles.map(() => 0);
      infoText = '';
      if (spec) setCubeVisible(true);
      apply();
    },
    getState() {
      if (!built) return { visible: root.visible, active: false };
      return {
        visible: root.visible,
        active: true,
        segments: progress.segments,
        angle: progress.angle,
        extract: progress.extract,
        triangles: [...progress.triangles],
        info: infoText,
        answersVisible: built.answers.filter((g) => g.visible).length,
        cubeVisible: isCubeVisible(),
      };
    },
    /** 三角形の頂点の、いまの位置（世界座標。テスト用：取り出しても形・大きさは変わらない） */
    getTrianglePoints(index) {
      const t = built?.triangles[index];
      if (!t) return [];
      t.group.updateMatrixWorld(true);
      return t.local.map((p) => p.clone().applyMatrix4(t.group.matrixWorld).toArray());
    },
    /** 取り出したときの三角形の面の向き（カメラの向きとの内積。テスト用） */
    getExtractFacing() {
      const t = built?.triangles.at(-1);
      if (!t) return null;
      const [a, b, c] = this.getTrianglePoints(built.triangles.length - 1).map(toV);
      return Math.abs(b.clone().sub(a).cross(c.clone().sub(a)).normalize().dot(view));
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

const clamp = (t) => Math.min(1, Math.max(0, t));
