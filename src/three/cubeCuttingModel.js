/**
 * 立方体の切断の 3D モデル
 *
 * 切る3点から core/cubeCutting で平面・切り口・切り分けた2つの立体を正確に計算し、その座標そのままで描く
 * （見た目だけで切ったように見せず、数学の計算と同じ形を表示する）。
 *
 * 表示の段階（どれも 0〜1。演出は three/cubeCuttingAnimations）
 *   plane   ：切る平面（半透明の板）が、刃物のように上から下へ振り下ろされる。板が通ったところから、切り口（緑）が上から順に現れる
 *   section ：平面の板が消えて、切り口だけが残る
 *   split   ：ふつうの立方体を隠し、2つの立体に分けて、小さいほう（同じなら一方）を少しはなす
 * 回答前は、切る3点（オレンジの点と P・Q・R の文字）だけを表示する。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { planeFromThreePoints, splitCubeByPlane } from '../core/cubeCutting.js';
import { vToNumbers, vAverage, qvec } from '../core/rational.js';
import { VERTICES, CUBE_COLORS } from '../core/cubeConstants.js';

/** 分けたときに、はなす距離 */
export const SPLIT_GAP = 0.7;
/** 平面の板（正方形）の半分の大きさ */
const PLANE_HALF = 2.3;
/** 水平に近い平面を、真上から落とすときの高さ */
const PLANE_DROP = 3.6;

/**
 * 凸多角形（小数の座標）のうち、向き d にそった位置（中心 c から）が edge 以下の部分
 * （刃が d の向きに進むとき、刃がすでに通ったところ）
 */
function clipPassed(points, c, d, edge) {
  const f = (p) => p.clone().sub(c).dot(d) - edge;
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const fa = f(a);
    const fb = f(b);
    if (fa <= 0) out.push(a);
    if (fa <= 0 !== fb <= 0) out.push(a.clone().lerp(b, fa / (fa - fb)));
  }
  return out;
}

const COLORS = {
  point: CUBE_COLORS.reference,
  plane: 0xff9d3c,
  section: CUBE_COLORS.correct,
  piece: 0x9fd3f5,
  pieceHighlight: 0xffc24d, // 小さいほうの立体（切り口の緑と区別する）
  edge: CUBE_COLORS.edge,
};

const toV = (p) => new THREE.Vector3(...vToNumbers(p));

/** 凸多角形（3D の点の並び）を三角形に分けた BufferGeometry */
function polygonGeometry(polygons) {
  const pos = [];
  for (const poly of polygons) {
    const pts = poly.map(toV);
    for (let i = 1; i + 1 < pts.length; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 多角形の輪郭の線 */
function outlineGeometry(polygons) {
  const pos = [];
  for (const poly of polygons) {
    const pts = poly.map(toV);
    pts.forEach((p, i) => pos.push(...p.toArray(), ...pts[(i + 1) % pts.length].toArray()));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function polygonGeometryFloat(polygons) {
  const pos = [];
  for (const pts of polygons) for (let i = 1; i + 1 < pts.length; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function outlineGeometryFloat(polygons) {
  const pos = [];
  for (const pts of polygons) pts.forEach((p, i) => pos.push(...p.toArray(), ...pts[(i + 1) % pts.length].toArray()));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export function createCuttingModel({ cubeRoot = null, labels = typeof document !== 'undefined', onInfo = () => {} } = {}) {
  const root = new THREE.Group();
  root.name = 'cuttingRoot';
  root.visible = false;

  // 切る3点は目立つように大きめ（立方体の頂点の球の約1.7倍）・少し光らせる
  const sphere = new THREE.SphereGeometry(0.12, 24, 16);
  const materials = {
    point: new THREE.MeshStandardMaterial({ color: COLORS.point, emissive: 0x7a2e00, roughness: 0.35 }),
    plane: new THREE.MeshBasicMaterial({ color: COLORS.plane, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    planeEdge: new THREE.LineBasicMaterial({ color: COLORS.plane, transparent: true, opacity: 0 }),
    section: new THREE.MeshStandardMaterial({ color: COLORS.section, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6 }),
    sectionEdge: new THREE.LineBasicMaterial({ color: 0x17803a, transparent: true, opacity: 0 }),
    pieceSection: new THREE.MeshStandardMaterial({ color: COLORS.section, transparent: true, opacity: 0.88, side: THREE.DoubleSide, roughness: 0.6 }),
    pieceEdge: new THREE.LineBasicMaterial({ color: COLORS.edge }),
  };

  let spec = null;
  let built = null; // 問題ごとに作るオブジェクト
  const progress = { plane: 0, section: 0, split: 0 };
  let highlightSmall = false;
  let valueText = '';
  let valueAt = 'section';

  const makeLabel = (text, className) => {
    if (!labels) return null;
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return new CSS2DObject(el);
  };

  function clear() {
    if (!built) return;
    onInfo([]);
    if (built.partial) {
      built.partial.mesh.dispose();
      built.partial.edge.dispose();
    }
    for (const obj of built.disposables) obj.dispose();
    for (const l of built.labels) l.element.remove();
    root.clear();
    built = null;
  }

  function build() {
    const points = spec.points.map((p) => p.position);
    const plane = planeFromThreePoints(...points);
    const { section, pieces } = splitCubeByPlane(plane);
    const disposables = [];
    const labelObjs = [];
    const track = (x) => (disposables.push(x), x);

    const normal = new THREE.Vector3(...vToNumbers(plane.normal)).normalize();
    const centroid = toV(vAverage(section.polygon.map((v) => v.position)));

    // 切る3点
    const markers = new THREE.Group();
    for (const p of spec.points) {
      const m = new THREE.Mesh(sphere, materials.point);
      m.position.set(...p.position);
      markers.add(m);
      if (p.label) {
        const l = makeLabel(p.label, 'cut-point-label');
        if (l) {
          l.position.copy(m.position).multiplyScalar(1.22);
          markers.add(l);
          labelObjs.push(l);
        }
      }
    }
    root.add(markers);

    // 切る平面の板（立方体より少し大きい正方形）
    const planeGroup = new THREE.Group();
    const planeMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(4.6, 4.6)), materials.plane);
    const planeEdge = new THREE.LineSegments(track(new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.6, 4.6))), materials.planeEdge);
    planeGroup.add(planeMesh, planeEdge);
    // 刃は平面にそって「下向き」に進む（下向きのベクトルを平面に写したもの）。水平に近い平面は、真上から落とす
    const down = new THREE.Vector3(0, -1, 0);
    const slide = down.clone().addScaledVector(normal, -down.dot(normal));
    const sliding = slide.length() > 0.2;
    if (sliding) {
      slide.normalize();
      // 板の向き：z = 法線、y = 刃の進む向きの反対（上）
      const yAxis = slide.clone().negate();
      const xAxis = new THREE.Vector3().crossVectors(yAxis, normal).normalize();
      planeGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, normal));
    } else {
      planeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    }
    root.add(planeGroup);

    // 立方体の上の切り口（分ける前）。板が通ったところまでを表示するので、形は apply で作りなおす
    const sectionPoly = [section.polygon.map((v) => v.position)];
    const sectionFloat = section.polygon.map((v) => toV(v.position));
    // 切り口のうち、刃の進む向きでいちばん手前（上）の位置。刃の先がここより上から始まるようにする
    const along = sliding ? sectionFloat.map((p) => p.clone().sub(centroid).dot(slide)) : [0];
    const travel = sliding ? PLANE_HALF - Math.min(...along) + 0.3 : PLANE_DROP;
    const sectionMesh = new THREE.Mesh(new THREE.BufferGeometry(), materials.section);
    const sectionEdge = new THREE.LineSegments(new THREE.BufferGeometry(), materials.sectionEdge);
    const fullGeometry = { mesh: polygonGeometry(sectionPoly), edge: outlineGeometry(sectionPoly) };
    track(fullGeometry.mesh);
    track(fullGeometry.edge);
    sectionMesh.renderOrder = 2;
    root.add(sectionMesh, sectionEdge);

    // 切り分けた2つの立体：小さいほうをはなす（同じ体積なら、法線の向きの側）
    const cmp = pieces[0].volume.cmp(pieces[1].volume);
    const movingIndex = cmp < 0 ? 0 : cmp > 0 ? 1 : 0;
    const smallIndex = cmp > 0 ? 1 : 0;
    const pieceObjs = pieces.map((piece, i) => {
      const group = new THREE.Group();
      group.name = `piece${i}`;
      const material = track(new THREE.MeshStandardMaterial({ color: COLORS.piece, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, roughness: 0.65 }));
      const sides = piece.faces.filter((f) => f.id !== 'section').map((f) => f.polygon);
      const cut = piece.faces.filter((f) => f.id === 'section').map((f) => f.polygon);
      group.add(new THREE.Mesh(track(polygonGeometry(sides)), material));
      const cutMesh = new THREE.Mesh(track(polygonGeometry(cut)), materials.pieceSection);
      cutMesh.renderOrder = 2;
      group.add(cutMesh);
      group.add(new THREE.LineSegments(track(outlineGeometry(piece.faces.map((f) => f.polygon))), materials.pieceEdge));
      // 立方体の頂点の文字（この立体にふくまれる頂点）
      for (const id of piece.cubeVertices) {
        const l = makeLabel(id, 'vertex-label');
        if (!l) continue;
        l.position.set(...VERTICES.find((v) => v.id === id).position).multiplyScalar(1.2);
        group.add(l);
        labelObjs.push(l);
      }
      group.visible = false;
      root.add(group);
      return { group, material, piece, center: toV(vAverage(piece.vertices)) };
    });
    const direction = normal.clone().multiplyScalar(pieces[movingIndex].side);


    built = {
      plane,
      section,
      pieces,
      normal,
      centroid,
      markers,
      planeGroup,
      sectionMesh,
      sectionEdge,
      sectionFloat,
      sliding,
      slide,
      travel,
      fullGeometry,
      partial: null,
      pieceObjs,
      movingIndex,
      smallIndex,
      direction,
      disposables,
      labels: labelObjs,
    };
    apply();
  }

  /** 切り口の形を、表示する部分（null なら全体）にする */
  function setSectionShape(b, part) {
    if (b.partial) {
      b.partial.mesh.dispose();
      b.partial.edge.dispose();
      b.partial = null;
    }
    if (!part) {
      b.sectionMesh.geometry = b.fullGeometry.mesh;
      b.sectionEdge.geometry = b.fullGeometry.edge;
      return;
    }
    const poly = [part];
    b.partial = { mesh: polygonGeometryFloat(poly), edge: outlineGeometryFloat(poly) };
    b.sectionMesh.geometry = b.partial.mesh;
    b.sectionEdge.geometry = b.partial.edge;
  }

  function setCubeVisible(visible) {
    if (cubeRoot) cubeRoot.visible = visible;
  }

  function apply() {
    if (!built) return;
    const { plane, section, split } = progress;
    const b = built;
    // 平面の板：刃のように上から振り下ろされ、切り口ができると消える
    b.planeGroup.position.copy(b.centroid);
    if (b.sliding) b.planeGroup.position.addScaledVector(b.slide, -(1 - plane) * b.travel);
    else b.planeGroup.position.y += (1 - plane) * b.travel;
    b.planeGroup.visible = plane > 0 && section < 1 && split === 0;
    const appear = Math.min(1, plane * 5); // 振り下ろしはじめに、すばやく現れる
    materials.plane.opacity = 0.34 * appear * (1 - section);
    materials.planeEdge.opacity = 0.85 * appear * (1 - section);
    // 切り口（分ける前）：刃の先が通ったところまで表示する（水平に近い平面は、落ちきったときに全体）
    let visiblePart = null;
    if (plane < 1) visiblePart = b.sliding ? clipPassed(b.sectionFloat, b.centroid, b.slide, PLANE_HALF - (1 - plane) * b.travel) : [];
    const showSection = plane > 0 && split === 0 && (plane >= 1 || visiblePart.length >= 3);
    b.sectionMesh.visible = showSection;
    b.sectionEdge.visible = showSection;
    if (showSection) setSectionShape(b, visiblePart);
    materials.section.opacity = 0.85;
    materials.sectionEdge.opacity = 1;
    // 2つの立体
    const splitting = split > 0;
    setCubeVisible(!splitting);
    b.pieceObjs.forEach((p, i) => {
      p.group.visible = splitting;
      p.group.position.set(0, 0, 0);
      if (i === b.movingIndex) p.group.position.copy(b.direction).multiplyScalar(SPLIT_GAP * split);
      p.material.color.setHex(highlightSmall && i === b.smallIndex ? COLORS.pieceHighlight : COLORS.piece);
      p.material.opacity = highlightSmall && i !== b.smallIndex ? 0.28 : 0.5;
    });
    // 面積・体積の表示
    const show = Boolean(valueText) && (valueAt === 'section' ? section >= 1 : split >= 1);
    b.valueShown = show;
    // 面積・体積は、図に重ならないように右側の表示へ（three/cubeViewer）
    onInfo(show ? [{ text: valueText, kind: 'total' }] : []);
  }

  return {
    root,

    /**
     * 切る3点を設定する（null で消す）。はじめは点だけを表示する
     * @param {{ points: { label?: string|null, position: number[] }[] }|null} next
     */
    set(next) {
      clear();
      progress.plane = 0;
      progress.section = 0;
      progress.split = 0;
      highlightSmall = false;
      valueText = '';
      spec = next ? { points: next.points.map((p) => ({ ...p, position: [...p.position] })) } : null;
      setCubeVisible(true);
      root.visible = Boolean(spec);
      if (spec) build();
    },
    setPlane(t) {
      progress.plane = clamp(t);
      apply();
    },
    setSection(t) {
      progress.section = clamp(t);
      apply();
    },
    setSplit(t) {
      progress.split = clamp(t);
      apply();
    },
    getSplit: () => progress.split,
    /** 小さいほうの立体を緑にする・面積や体積を表示する（at：'section' は切り口に、'piece' は小さいほうの立体に） */
    setValue(text, { at = 'section' } = {}) {
      valueText = text ?? '';
      valueAt = at;
      apply();
    },
    setHighlightSmall(on) {
      highlightSmall = Boolean(on);
      apply();
    },
    /** はじめの状態（点だけ）に戻す */
    reset() {
      progress.plane = 0;
      progress.section = 0;
      progress.split = 0;
      highlightSmall = false;
      valueText = '';
      if (spec) setCubeVisible(true);
      apply();
    },
    /** テスト・確認用の状態 */
    getState() {
      if (!built) return { visible: root.visible, active: false };
      return {
        visible: root.visible,
        active: true,
        ...progress,
        planeVisible: built.planeGroup.visible,
        sectionVisible: built.sectionMesh.visible,
        sectionVertexCount: built.section.polygon.length,
        piecesVisible: built.pieceObjs.map((p) => p.group.visible),
        volumes: built.pieces.map((p) => p.volume.toString()),
        movingIndex: built.movingIndex,
        movingOffset: built.pieceObjs[built.movingIndex].group.position.toArray(),
        highlightSmall,
        value: built.valueShown ? valueText : '',
        cubeVisible: cubeRoot ? cubeRoot.visible : null,
        markerCount: built.markers.children.filter((c) => c.isMesh).length,
      };
    },
    /** 計算した切り口の頂点（3D の座標。テスト用） */
    getSectionPoints: () => (built ? built.section.polygon.map((v) => vToNumbers(v.position)) : []),
    /** 切り口のメッシュの頂点（テスト用。full：切り終えたときの形、そうでなければ今表示している形） */
    getSectionMeshPositions: ({ full = true } = {}) => {
      if (!built) return [];
      const g = full ? built.fullGeometry.mesh : built.sectionMesh.geometry;
      return [...(g.getAttribute('position')?.array ?? [])];
    },
    /** 刃（平面の板）の中心の位置（テスト用） */
    getPlanePosition: () => (built ? built.planeGroup.position.toArray() : null),

    dispose() {
      clear();
      sphere.dispose();
      for (const m of Object.values(materials)) m.dispose();
      root.removeFromParent();
    },
  };
}

const clamp = (t) => Math.min(1, Math.max(0, t));
export { qvec };
