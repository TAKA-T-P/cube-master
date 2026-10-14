/**
 * 解説用の強調表示
 *
 * 選択状態（オレンジ）とは独立して管理する。強調は元のメッシュの色を変えず、
 * highlightsGroup に重ねるオーバーレイで表現するため、解除すれば必ず元の見た目に戻る。
 * オーバーレイは面のワイヤーフレーム表示中でも表示される。
 */
import * as THREE from 'three';
import { CUBE_COLORS, CUBE_SIZE, ELEMENT_TYPES } from '../core/cubeConstants.js';
import { resolveElement, resolveElementOfType } from '../core/cubeGeometry.js';
import { MODEL_DIMENSIONS } from './cubeModel.js';

/** 既定の強調色（名前でも指定できる） */
export const HIGHLIGHT_COLORS = Object.freeze({
  correct: CUBE_COLORS.correct,
  selected: CUBE_COLORS.selected,
});

const DEFAULT_OPACITY = { vertex: 1, edge: 1, face: 0.55 };
const FACE_OFFSET = 0.006; // 面のオーバーレイを少し外側に浮かせる

/**
 * @param {ReturnType<import('./cubeModel.js').createCubeModel>} model
 * @param {{ onChange?: (highlighted: string[]) => void }} [options] 表示が変わったとき（再描画要求用）
 */
export function createHighlightManager(model, { onChange = () => {} } = {}) {
  const group = model.groups.highlightsGroup;
  const geometries = {
    vertex: new THREE.SphereGeometry(MODEL_DIMENSIONS.vertexRadius * 1.9, 20, 14),
    edge: new THREE.CylinderGeometry(MODEL_DIMENSIONS.edgeRadius * 1.9, MODEL_DIMENSIONS.edgeRadius * 1.9, CUBE_SIZE * 1.01, 12, 1),
    face: new THREE.PlaneGeometry(CUBE_SIZE, CUBE_SIZE),
  };

  /** @type {Map<string, {id:string, type:string, object:THREE.Mesh, material:THREE.Material, timer:any}>} */
  const active = new Map();

  function highlight(id, type, options = {}) {
    const { color = 'correct', opacity = DEFAULT_OPACITY[type], duration = 0 } = options;
    remove(id, { silent: true });

    const material = new THREE.MeshBasicMaterial({
      color: resolveColor(color),
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
      side: type === ELEMENT_TYPES.FACE ? THREE.DoubleSide : THREE.FrontSide,
    });
    const source = model.getElement(id).mesh;
    const object = new THREE.Mesh(geometries[type], material);
    object.position.copy(source.position);
    object.quaternion.copy(source.quaternion);
    if (type === ELEMENT_TYPES.FACE) {
      object.position.add(new THREE.Vector3(0, 0, FACE_OFFSET).applyQuaternion(source.quaternion));
    }
    object.renderOrder = 2;
    object.userData.elementType = type;
    object.userData.elementId = id;
    object.raycast = () => {}; // 強調表示は選択判定の対象外
    group.add(object);

    const entry = { id, type, object, material, timer: null };
    if (duration > 0) entry.timer = setTimeout(() => remove(id), duration);
    active.set(id, entry);
    onChange([...active.keys()]);
    return entry;
  }

  function remove(input, { silent = false } = {}) {
    const { id } = resolveElement(input);
    const entry = active.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    entry.object.removeFromParent();
    entry.material.dispose();
    active.delete(id);
    if (!silent) onChange([...active.keys()]);
    return true;
  }

  return {
    /**
     * @param {string} vertexId
     * @param {{ color?: string|number, opacity?: number, duration?: number }} [options]
     *   color: 'correct'(緑・既定) / 'selected'(オレンジ) / 0xRRGGBB / '#rrggbb'
     *   duration: ミリ秒。0 なら clearHighlights まで表示し続ける
     */
    highlightVertex: (vertexId, options) => highlight(resolveElementOfType(vertexId, ELEMENT_TYPES.VERTEX), ELEMENT_TYPES.VERTEX, options),
    highlightEdge: (edgeId, options) => highlight(resolveElementOfType(edgeId, ELEMENT_TYPES.EDGE), ELEMENT_TYPES.EDGE, options),
    highlightFace: (faceId, options) => highlight(resolveElementOfType(faceId, ELEMENT_TYPES.FACE), ELEMENT_TYPES.FACE, options),

    /** 種類の混在した ID をまとめて強調する。1つでも無効なら何も強調せずにエラー */
    highlightElements(ids, options) {
      const resolved = ids.map((input) => resolveElement(input));
      return resolved.map(({ id, type }) => highlight(id, type, options));
    },

    /** 指定 ID の強調を解除（ID 省略時はすべて解除） */
    clearHighlights(ids) {
      if (ids === undefined) {
        if (active.size === 0) return;
        for (const id of [...active.keys()]) remove(id, { silent: true });
        onChange([...active.keys()]);
        return;
      }
      for (const id of ids) remove(id);
    },

    isHighlighted: (input) => active.has(resolveElement(input).id),
    getHighlighted: () => [...active.keys()],
    getHighlight: (input) => active.get(resolveElement(input).id) ?? null,

    dispose() {
      for (const id of [...active.keys()]) remove(id, { silent: true });
      for (const g of Object.values(geometries)) g.dispose();
    },
  };
}

function resolveColor(color) {
  if (typeof color === 'string' && color in HIGHLIGHT_COLORS) return HIGHLIGHT_COLORS[color];
  return new THREE.Color(color);
}
