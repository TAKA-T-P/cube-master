/**
 * 立方体の表面の道（最短経路）の 3D モデル
 *
 * - 出発点・到着点（オレンジの点と文字）
 * - 色をつけた候補の道（ア・イ…）。回答前はどれも同じ太さ・同じ明るさで表示し、正解がわからないようにする
 * - 正解の道（緑）と、道にそって動く小さな点
 * - 道が通る面だけを、共通の辺を軸に 90° ずつ回して平面に広げる（展開すると道が一直線になる）
 * 道の座標は、問題データ（core/cubeSurfacePath で計算したもの）をそのまま使う。
 * 広げ方は core/cubeSurfaceUnfolding と同じ軸・同じ向きの回転なので、広げきった形は数学の展開と一致する。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { unfoldFaces, facesOfPointApprox } from '../core/cubeSurfaceUnfolding.js';
import { vToNumbers, qvec } from '../core/rational.js';
import { FACES, VERTICES, CUBE_COLORS } from '../core/cubeConstants.js';

const TUBE_RADIUS = 0.032;
const LIFT = 0.025; // 面に重ならないように、道を少し外側に浮かせる
const CORRECT = CUBE_COLORS.correct;
/** 広げたときに、画面に収める半径 */
const FIT_RADIUS = 2.3;

const FACE_MAP = new Map(FACES.map((f) => [f.id, f]));

/** 表面の点を、のっている面の外向きに少し浮かせる */
function lifted(p) {
  const faces = facesOfPointApprox(p);
  const n = new THREE.Vector3();
  for (const f of faces) n.add(new THREE.Vector3(...FACE_MAP.get(f).normal));
  if (n.lengthSq() > 0) n.normalize();
  return new THREE.Vector3(...p).addScaledVector(n, LIFT);
}

export function createSurfacePathModel({ cubeRoot = null, labels = typeof document !== 'undefined' } = {}) {
  const root = new THREE.Group();
  root.name = 'surfacePathRoot';
  root.visible = false;

  const cylinder = new THREE.CylinderGeometry(TUBE_RADIUS, TUBE_RADIUS, 1, 10, 1);
  const joint = new THREE.SphereGeometry(TUBE_RADIUS, 12, 8);
  const pointSphere = new THREE.SphereGeometry(0.08, 20, 14);
  const dotSphere = new THREE.SphereGeometry(0.075, 20, 14);
  const plate = new THREE.PlaneGeometry(2, 2);
  const materials = {
    point: new THREE.MeshStandardMaterial({ color: CUBE_COLORS.reference, roughness: 0.4 }),
    correct: new THREE.MeshStandardMaterial({ color: CORRECT, roughness: 0.4 }),
    dot: new THREE.MeshStandardMaterial({ color: 0xffd400, emissive: 0x6b5200, roughness: 0.3 }),
    // 広げた面は、どの向きから見ても同じ明るさ（光の当たり方で暗くならないように）
    face: new THREE.MeshBasicMaterial({ color: 0xbfe2f8, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    faceEdge: new THREE.LineBasicMaterial({ color: CUBE_COLORS.edge }),
  };

  let spec = null;
  let built = null;
  const progress = { highlight: false, travel: 0, unfold: 0 };

  const makeLabel = (text, className) => {
    if (!labels) return null;
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return new CSS2DObject(el);
  };

  /** 折れ線を管（円柱と継ぎ目の球）で描く */
  function tube(points, material, parent, toLocal = (v) => v) {
    const group = new THREE.Group();
    const pts = points.map((p) => toLocal(p.clone ? p.clone() : p));
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = a.distanceTo(b);
      if (len < 1e-6) continue;
      const m = new THREE.Mesh(cylinder, material);
      m.scale.set(1, len, 1);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      group.add(m);
    }
    for (const p of pts) {
      const j = new THREE.Mesh(joint, material);
      j.position.copy(p);
      group.add(j);
    }
    parent.add(group);
    return group;
  }

  function clear() {
    if (!built) return;
    for (const d of built.disposables) d.dispose();
    for (const l of built.labels) l.element.remove();
    root.clear();
    built = null;
  }

  function build() {
    const disposables = [];
    const labelObjs = [];
    const addLabel = (text, className, parent, position) => {
      const l = makeLabel(text, className);
      if (!l) return null;
      l.position.copy(position);
      parent.add(l);
      labelObjs.push(l);
      return l;
    };

    // 立方体の上の表示（広げる前）
    const onCube = new THREE.Group();
    root.add(onCube);
    for (const p of spec.points) {
      const m = new THREE.Mesh(pointSphere, materials.point);
      m.position.set(...p.position);
      onCube.add(m);
      if (p.label) addLabel(p.label, 'cut-point-label', onCube, m.position.clone().multiplyScalar(1.18));
    }
    const candidates = spec.candidates.map((c) => {
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.color), roughness: 0.45, transparent: true, opacity: 1 });
      disposables.push(material);
      const pts = c.polyline.map(lifted);
      const group = tube(pts, material, onCube);
      // 道の名前（ア・イ…）を、道のまん中あたりに
      const mid = pts[Math.floor((pts.length - 1) / 2)].clone().lerp(pts[Math.ceil((pts.length - 1) / 2)], 0.5);
      const label = addLabel(c.label, 'path-label', onCube, mid.clone().multiplyScalar(1.12));
      if (label) label.element.style.setProperty('--path-color', c.color);
      return { id: c.id, group, material, color: c.color };
    });
    const solution = spec.solution ?? { polylines: [], highlight: [] };
    const solutionTubes = (solution.polylines ?? []).map((line) => {
      const g = tube(line.map(lifted), materials.correct, onCube);
      g.visible = false;
      return g;
    });
    const dot = new THREE.Mesh(dotSphere, materials.dot);
    dot.visible = false;
    onCube.add(dot);
    const travelLine = (solution.unfold?.polyline ?? []).map(lifted);
    const travelLengths = [0];
    for (let i = 1; i < travelLine.length; i++) travelLengths.push(travelLengths[i - 1] + travelLine[i].distanceTo(travelLine[i - 1]));

    // 広げる面（共通の辺を軸に回す、親子の入れ子にする）
    const unfoldRoot = new THREE.Group();
    unfoldRoot.visible = false;
    root.add(unfoldRoot);
    let unfold = null;
    if (solution.unfold) {
      const faces = solution.unfold.faces;
      const unfolding = unfoldFaces(faces);
      const groups = [];
      const pivots = [];
      faces.forEach((faceId, k) => {
        const face = FACE_MAP.get(faceId);
        const normal = new THREE.Vector3(...face.normal);
        const center = normal.clone();
        const pivot = k === 0 ? center.clone() : new THREE.Vector3(...vToNumbers(unfolding.hinges[k].origin));
        const group = new THREE.Group();
        group.position.copy(k === 0 ? pivot : pivot.clone().sub(pivots[k - 1]));
        (k === 0 ? unfoldRoot : groups[k - 1]).add(group);
        groups.push(group);
        pivots.push(pivot);
        const local = (v) => v.clone().sub(pivot);
        const mesh = new THREE.Mesh(plate, materials.face);
        mesh.position.copy(local(center));
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        group.add(mesh);
        const corners = face.vertices.map((id) => new THREE.Vector3(...VERTICES.find((v) => v.id === id).position));
        const edgeGeometry = new THREE.BufferGeometry().setFromPoints([...corners, corners[0]].map(local));
        disposables.push(edgeGeometry);
        group.add(new THREE.Line(edgeGeometry, materials.faceEdge));
        // 頂点の文字（親の面と共通の辺の頂点は、親の面で表示する）
        const shared = k === 0 ? [] : FACES.find((f) => f.id === faces[k - 1]).vertices.filter((v) => face.vertices.includes(v));
        face.vertices.forEach((id, i) => {
          if (shared.includes(id)) return;
          addLabel(id, 'vertex-label vertex-label--small', group, local(corners[i]).add(normal.clone().multiplyScalar(0.12)).add(local(corners[i]).sub(local(center)).multiplyScalar(0.12)));
        });
        // この面の上の道（k 番目の区間）
        const line = solution.unfold.polyline;
        const seg = [line[k], line[k + 1]].map((p) => new THREE.Vector3(...p).addScaledVector(normal, LIFT));
        tube(seg, materials.correct, group, local);
      });
      // P・Q の点
      const first = spec.points[0];
      const last = spec.points[spec.points.length - 1];
      for (const [p, k] of [
        [first, 0],
        [last, faces.length - 1],
      ]) {
        const m = new THREE.Mesh(pointSphere, materials.point);
        m.position.set(...p.position).sub(pivots[k]);
        groups[k].add(m);
        if (p.label) addLabel(p.label, 'cut-point-label', groups[k], m.position.clone().add(new THREE.Vector3(...FACE_MAP.get(faces[k]).normal).multiplyScalar(0.25)));
      }
      // 広げきったときの形（数学の展開と同じ）から、画面に収める位置と大きさを決める
      const finalCorners = faces.flatMap((f, k) => FACE_MAP.get(f).vertices.map((id) => new THREE.Vector3(...vToNumbers(unfolding.to3D(qvec(VERTICES.find((v) => v.id === id).position), k)))));
      const box = new THREE.Box3().setFromPoints(finalCorners);
      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() / 2;
      const scale = Math.min(1, FIT_RADIUS / radius);
      // 広げた直線の上の長さの表示
      const pFinal = new THREE.Vector3(...vToNumbers(unfolding.to3D(qvec(first.position), 0)));
      const qFinal = new THREE.Vector3(...vToNumbers(unfolding.to3D(qvec(last.position), faces.length - 1)));
      const n0 = new THREE.Vector3(...FACE_MAP.get(faces[0]).normal);
      const lengthLabel = solution.label ? addLabel(solution.label, 'cut-value-label', unfoldRoot, pFinal.clone().lerp(qFinal, 0.5).addScaledVector(n0, 0.35)) : null;
      if (lengthLabel) lengthLabel.visible = false;
      const axes = faces.map((_, k) => (k === 0 ? null : new THREE.Vector3(...vToNumbers(unfolding.hinges[k].axis)).normalize()));
      unfold = { groups, axes, center, scale, lengthLabel, normal: n0 };
    }

    built = { onCube, candidates, solutionTubes, dot, travelLine, travelLengths, unfoldRoot, unfold, highlight: solution.highlight ?? [], disposables, labels: labelObjs };
    apply();
  }

  function apply() {
    if (!built) return;
    const b = built;
    // 正解の道を緑に、ほかの候補を薄く
    for (const c of b.candidates) {
      const hit = b.highlight.includes(c.id);
      c.group.visible = !(progress.highlight && hit);
      c.material.opacity = progress.highlight && !hit ? 0.25 : 1;
      c.material.depthWrite = !(progress.highlight && !hit);
    }
    for (const g of b.solutionTubes) g.visible = progress.highlight;
    // 道にそって動く点
    const total = b.travelLengths.at(-1) ?? 0;
    b.dot.visible = progress.travel > 0 && progress.travel < 1 && total > 0;
    if (b.dot.visible) {
      const d = total * progress.travel;
      let i = 1;
      while (i < b.travelLengths.length - 1 && b.travelLengths[i] < d) i++;
      const seg = b.travelLengths[i] - b.travelLengths[i - 1] || 1;
      b.dot.position.copy(b.travelLine[i - 1]).lerp(b.travelLine[i], (d - b.travelLengths[i - 1]) / seg);
    }
    // 広げる
    const t = progress.unfold;
    const unfolding = t > 0 && b.unfold;
    if (cubeRoot) cubeRoot.visible = !unfolding;
    b.onCube.visible = !unfolding;
    b.unfoldRoot.visible = Boolean(unfolding);
    if (b.unfold) {
      b.unfold.groups.forEach((g, k) => {
        if (k === 0) return;
        g.quaternion.setFromAxisAngle(b.unfold.axes[k], (Math.PI / 2) * t);
      });
      const s = 1 + (b.unfold.scale - 1) * t;
      b.unfoldRoot.scale.setScalar(s);
      b.unfoldRoot.position.copy(b.unfold.center).multiplyScalar(-s * t);
      if (b.unfold.lengthLabel) b.unfold.lengthLabel.visible = t >= 0.999;
    }
  }

  return {
    root,
    /**
     * 道の問題のデータを設定する（null で消す）
     * @param {{ points, candidates?, solution? }|null} next scene.surfacePath
     */
    set(next) {
      clear();
      progress.highlight = false;
      progress.travel = 0;
      progress.unfold = 0;
      spec = next ? { points: next.points, candidates: next.candidates ?? [], solution: next.solution ?? null } : null;
      if (cubeRoot) cubeRoot.visible = true;
      root.visible = Boolean(spec);
      if (spec) build();
    },
    setHighlight(on) {
      progress.highlight = Boolean(on);
      apply();
    },
    setTravel(t) {
      progress.travel = clamp(t);
      apply();
    },
    setUnfold(t) {
      progress.unfold = clamp(t);
      apply();
    },
    getUnfold: () => progress.unfold,
    /** 広げる面の法線（カメラを向ける向き） */
    getUnfoldNormal: () => (built?.unfold ? built.unfold.normal.toArray() : null),
    reset() {
      progress.highlight = false;
      progress.travel = 0;
      progress.unfold = 0;
      if (spec && cubeRoot) cubeRoot.visible = true;
      apply();
    },
    getState() {
      if (!built) return { visible: root.visible, active: false };
      return {
        visible: root.visible,
        active: true,
        ...progress,
        candidateCount: built.candidates.length,
        visibleCandidates: built.candidates.filter((c) => c.group.visible).map((c) => c.id),
        dimmedCandidates: built.candidates.filter((c) => c.material.opacity < 1).map((c) => c.id),
        solutionVisible: built.solutionTubes.some((g) => g.visible),
        dotVisible: built.dot.visible,
        unfoldVisible: built.unfoldRoot.visible,
        cubeVisible: cubeRoot ? cubeRoot.visible : null,
        lengthLabel: built.unfold?.lengthLabel?.visible ? built.unfold.lengthLabel.element.textContent : '',
      };
    },
    /** 広げた面の上の道の点（世界座標。テスト用：広げきると一直線になる） */
    getUnfoldedPathPoints() {
      if (!built?.unfold) return [];
      built.unfoldRoot.updateMatrixWorld(true);
      const pts = [];
      for (const g of built.unfold.groups) {
        const tubeGroup = g.children.find((c) => c.isGroup && c.children.some((m) => m.isMesh && m.material === materials.correct));
        if (!tubeGroup) continue;
        for (const m of tubeGroup.children) if (m.geometry === joint) pts.push(m.getWorldPosition(new THREE.Vector3()).toArray());
      }
      return pts;
    },
    dispose() {
      clear();
      for (const g of [cylinder, joint, pointSphere, dotSphere, plate]) g.dispose();
      for (const m of Object.values(materials)) m.dispose();
      root.removeFromParent();
    },
  };
}

const clamp = (t) => Math.min(1, Math.max(0, t));
