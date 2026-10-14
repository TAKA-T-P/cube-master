/**
 * 立方体の 3D モデル
 *
 * cubeConstants の数学データから頂点・辺・面・ラベルの 3D オブジェクトを生成する。
 * 各オブジェクトは userData に { elementType, elementId } を持ち、
 * 生成順・表示順に依存せず ID から引けるようにする。
 *
 * グループ構成（すべて root の子。root を回転させると全体が一緒に回る）：
 *   facesGroup / edgesGroup / verticesGroup / labelsGroup / highlightsGroup
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { VERTICES, EDGES, FACES, CUBE_COLORS, CUBE_SIZE, HALF_SIZE, ELEMENT_TYPES } from '../core/cubeConstants.js';
import { resolveElement, getEdgeMidpoint, getEdgeEndpoints, getFaceCenter } from '../core/cubeGeometry.js';

/** 見た目と選択判定のサイズ（ワールド単位） */
export const MODEL_DIMENSIONS = Object.freeze({
  vertexRadius: 0.07,
  vertexHitRadius: 0.24,
  edgeRadius: 0.035,
  edgeHitRadius: 0.16,
  labelOffset: 1.2, // 頂点座標をこの倍率で外側にずらしてラベルを置く
});

/** 面の表示モード */
export const FACE_DISPLAY_MODES = Object.freeze({
  OPAQUE: 'opaque',
  TRANSLUCENT: 'translucent',
  WIREFRAME: 'wireframe',
});

const TRANSLUCENT_OPACITY = 0.35;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const toVec3 = (arr) => new THREE.Vector3(arr[0], arr[1], arr[2]);

/**
 * @param {{ labels?: boolean }} [options] labels=false でラベルを作らない（DOM のないテスト環境用）
 */
export function createCubeModel({ labels = true } = {}) {
  const root = new THREE.Group();
  root.name = 'cubeRoot';

  const facesGroup = namedGroup('facesGroup');
  const edgesGroup = namedGroup('edgesGroup');
  const verticesGroup = namedGroup('verticesGroup');
  const labelsGroup = namedGroup('labelsGroup');
  const highlightsGroup = namedGroup('highlightsGroup');
  root.add(facesGroup, edgesGroup, verticesGroup, labelsGroup, highlightsGroup);

  // 共有ジオメトリ（同種の要素はすべて同じジオメトリを使う）
  const geometries = {
    vertex: new THREE.SphereGeometry(MODEL_DIMENSIONS.vertexRadius, 20, 14),
    vertexHit: new THREE.SphereGeometry(MODEL_DIMENSIONS.vertexHitRadius, 10, 8),
    edge: new THREE.CylinderGeometry(MODEL_DIMENSIONS.edgeRadius, MODEL_DIMENSIONS.edgeRadius, CUBE_SIZE, 12, 1),
    edgeHit: new THREE.CylinderGeometry(MODEL_DIMENSIONS.edgeHitRadius, MODEL_DIMENSIONS.edgeHitRadius, CUBE_SIZE, 8, 1),
    face: new THREE.PlaneGeometry(CUBE_SIZE, CUBE_SIZE),
  };
  // 判定用の透明メッシュ（色も深度も書き込まない）
  const hitMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

  /** @type {Map<string, {type:string, id:string, mesh:THREE.Mesh, hitMesh:THREE.Mesh, baseColor:number, selected:boolean, label?:CSS2DObject}>} */
  const elements = new Map();
  let faceDisplayMode = FACE_DISPLAY_MODES.OPAQUE;

  // ---------- 面 ----------
  for (const face of FACES) {
    const material = new THREE.MeshStandardMaterial({
      color: CUBE_COLORS.face,
      roughness: 0.65,
      metalness: 0,
      polygonOffset: true, // 辺が面に埋もれてちらつかないように面を少し奥へ
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const mesh = new THREE.Mesh(geometries.face, material);
    const normal = toVec3(face.normal);
    mesh.quaternion.setFromUnitVectors(Z_AXIS, normal);
    mesh.position.copy(toVec3(getFaceCenter(face.id)));
    tagElement(mesh, ELEMENT_TYPES.FACE, face.id);
    facesGroup.add(mesh);
    // 面はメッシュ自体を選択判定に使う
    elements.set(face.id, { type: ELEMENT_TYPES.FACE, id: face.id, mesh, hitMesh: mesh, baseColor: CUBE_COLORS.face, selected: false });
  }

  // ---------- 辺 ----------
  for (const edge of EDGES) {
    const material = new THREE.MeshStandardMaterial({ color: CUBE_COLORS.edge, roughness: 0.45 });
    const mesh = new THREE.Mesh(geometries.edge, material);
    placeAlongEdge(mesh, edge.id);
    tagElement(mesh, ELEMENT_TYPES.EDGE, edge.id);

    const hitMesh = new THREE.Mesh(geometries.edgeHit, hitMaterial);
    placeAlongEdge(hitMesh, edge.id);
    tagElement(hitMesh, ELEMENT_TYPES.EDGE, edge.id);

    edgesGroup.add(mesh, hitMesh);
    elements.set(edge.id, { type: ELEMENT_TYPES.EDGE, id: edge.id, mesh, hitMesh, baseColor: CUBE_COLORS.edge, selected: false });
  }

  // ---------- 頂点・ラベル ----------
  for (const vertex of VERTICES) {
    const position = toVec3(vertex.position);
    const material = new THREE.MeshStandardMaterial({ color: CUBE_COLORS.vertex, roughness: 0.4 });
    const mesh = new THREE.Mesh(geometries.vertex, material);
    mesh.position.copy(position);
    tagElement(mesh, ELEMENT_TYPES.VERTEX, vertex.id);

    const hitMesh = new THREE.Mesh(geometries.vertexHit, hitMaterial);
    hitMesh.position.copy(position);
    tagElement(hitMesh, ELEMENT_TYPES.VERTEX, vertex.id);

    verticesGroup.add(mesh, hitMesh);
    const entry = { type: ELEMENT_TYPES.VERTEX, id: vertex.id, mesh, hitMesh, baseColor: CUBE_COLORS.vertex, selected: false };

    if (labels) {
      const el = document.createElement('div');
      el.className = 'vertex-label';
      el.textContent = vertex.id;
      const label = new CSS2DObject(el);
      label.position.copy(position).multiplyScalar(MODEL_DIMENSIONS.labelOffset);
      tagElement(label, ELEMENT_TYPES.VERTEX, vertex.id);
      labelsGroup.add(label);
      entry.label = label;
    }
    elements.set(vertex.id, entry);
  }

  // ---------- 内部関数 ----------

  function placeAlongEdge(mesh, edgeId) {
    const [p, q] = getEdgeEndpoints(edgeId).map(toVec3);
    mesh.position.copy(toVec3(getEdgeMidpoint(edgeId)));
    mesh.quaternion.setFromUnitVectors(Y_AXIS, q.sub(p).normalize());
  }

  function refreshElement(entry) {
    const material = entry.mesh.material;
    material.color.setHex(entry.selected ? CUBE_COLORS.selected : entry.baseColor);
    if (entry.type === ELEMENT_TYPES.FACE) applyFaceDisplay(entry);
  }

  function applyFaceDisplay(entry) {
    const material = entry.mesh.material;
    const translucent = faceDisplayMode !== FACE_DISPLAY_MODES.OPAQUE;
    material.transparent = translucent;
    material.opacity = translucent ? TRANSLUCENT_OPACITY : 1;
    material.depthWrite = !translucent;
    material.side = translucent ? THREE.DoubleSide : THREE.FrontSide;
    material.needsUpdate = true;
    // ワイヤーフレームでは面を隠す（ただし選択中の面は見えるように残す）
    entry.mesh.visible = faceDisplayMode !== FACE_DISPLAY_MODES.WIREFRAME || entry.selected;
  }

  function getEntry(input) {
    const { id } = resolveElement(input);
    return elements.get(id);
  }

  // ---------- 公開 API ----------

  return {
    root,
    groups: { facesGroup, edgesGroup, verticesGroup, labelsGroup, highlightsGroup },
    geometries,

    /** 要素情報を取得（任意表記の ID 可。無効なら CubeElementError） */
    getElement: getEntry,

    /** すべての要素情報 */
    getElements: () => [...elements.values()],

    /** 選択色の ON/OFF */
    setSelected(input, selected) {
      const entry = getEntry(input);
      entry.selected = Boolean(selected);
      refreshElement(entry);
    },

    setFaceDisplayMode(mode) {
      if (!Object.values(FACE_DISPLAY_MODES).includes(mode)) {
        throw new Error(`無効な面の表示モードです: ${mode}`);
      }
      faceDisplayMode = mode;
      for (const entry of elements.values()) {
        if (entry.type === ELEMENT_TYPES.FACE) applyFaceDisplay(entry);
      }
    },

    getFaceDisplayMode: () => faceDisplayMode,

    setLabelsVisible(visible) {
      labelsGroup.visible = Boolean(visible);
    },

    getLabelsVisible: () => labelsGroup.visible,

    /**
     * 指定種類の選択判定用メッシュ。非表示の面（ワイヤーフレーム時）は含めない。
     * @param {'vertex'|'edge'|'face'} type
     */
    getPickTargets(type) {
      const result = [];
      for (const entry of elements.values()) {
        if (entry.type !== type) continue;
        if (entry.type === ELEMENT_TYPES.FACE && !entry.mesh.visible) continue;
        result.push(entry.hitMesh);
      }
      return result;
    },

    /** 視線をさえぎる面（不透明表示のときのみ） */
    getOccluders() {
      if (faceDisplayMode !== FACE_DISPLAY_MODES.OPAQUE) return [];
      return [...elements.values()].filter((e) => e.type === ELEMENT_TYPES.FACE && e.mesh.visible).map((e) => e.mesh);
    },

    /** ラベルを含む立方体全体の大きさ（中心からの半径）。カメラ距離の計算用 */
    boundingRadius: Math.sqrt(3) * HALF_SIZE * MODEL_DIMENSIONS.labelOffset,

    dispose() {
      for (const g of Object.values(geometries)) g.dispose();
      hitMaterial.dispose();
      for (const entry of elements.values()) {
        entry.mesh.material.dispose();
        entry.label?.element.remove();
      }
      root.removeFromParent();
      root.clear();
    },
  };
}

function namedGroup(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

function tagElement(object, elementType, elementId) {
  object.userData.elementType = elementType;
  object.userData.elementId = elementId;
}
