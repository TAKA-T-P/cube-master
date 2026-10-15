/**
 * 強調表示（問題の基準要素・解説・正誤表示）
 *
 * 選択状態（オレンジ）とは独立して管理する。強調は元のメッシュの色を変えず、
 * highlightsGroup に重ねるオーバーレイで表現するため、解除すれば必ず元の見た目に戻る。
 * オーバーレイは面のワイヤーフレーム表示中でも表示される。
 *
 * レイヤー：用途ごとに別々に登録・解除できる。同じ要素が複数のレイヤーにあるときは
 * 優先順位の高いレイヤーだけを表示し、それが解除されると次のレイヤーの表示に戻る。
 *   correct（正解・緑） > wrong（誤選択・赤） > default（解説・既定） > reference（基準・オレンジ）
 */
import * as THREE from 'three';
import { CUBE_COLORS, CUBE_SIZE, ELEMENT_TYPES } from '../core/cubeConstants.js';
import { resolveElement, resolveElementOfType } from '../core/cubeGeometry.js';
import { MODEL_DIMENSIONS } from './cubeModel.js';

/** 既定の強調色（名前でも指定できる） */
export const HIGHLIGHT_COLORS = Object.freeze({
  correct: CUBE_COLORS.correct,
  selected: CUBE_COLORS.selected,
  reference: CUBE_COLORS.reference,
  wrong: CUBE_COLORS.wrong,
});

/** レイヤーの表示優先順位（大きいほど手前に表示） */
export const HIGHLIGHT_LAYERS = Object.freeze({
  reference: 10,
  default: 20,
  wrong: 30,
  correct: 40,
});

/** レイヤーごとの既定の色 */
const LAYER_COLORS = { reference: 'reference', default: 'correct', wrong: 'wrong', correct: 'correct' };

const DEFAULT_OPACITY = { vertex: 1, edge: 1, face: 0.55 };
const FACE_OFFSET = 0.006; // 面のオーバーレイを少し外側に浮かせる

const entryKey = (layer, id) => `${layer}|${id}`;
const priority = (layer) => HIGHLIGHT_LAYERS[layer] ?? HIGHLIGHT_LAYERS.default;

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

  /** @type {Map<string, {id:string, type:string, layer:string, object:THREE.Mesh, material:THREE.Material, timer:any}>} */
  const active = new Map();

  const highlightedIds = (layer) => [...new Set([...active.values()].filter((e) => !layer || e.layer === layer).map((e) => e.id))];
  const notify = () => onChange(highlightedIds());

  /** 要素ごとに、最も優先順位の高いレイヤーだけを表示する */
  function updateVisibility(id) {
    const entries = [...active.values()].filter((e) => e.id === id);
    const top = entries.reduce((best, e) => (!best || priority(e.layer) >= priority(best.layer) ? e : best), null);
    for (const e of entries) e.object.visible = e === top;
  }

  function topEntry(id) {
    return [...active.values()].filter((e) => e.id === id).find((e) => e.object.visible) ?? null;
  }

  function highlight(id, type, options = {}) {
    const { layer = 'default' } = options;
    const { color = LAYER_COLORS[layer] ?? 'correct', opacity = DEFAULT_OPACITY[type], duration = 0 } = options;
    remove(id, layer, { silent: true });

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
    object.userData.highlightLayer = layer;
    object.raycast = () => {}; // 強調表示は選択判定の対象外
    group.add(object);

    const entry = { id, type, layer, object, material, timer: null };
    if (duration > 0) entry.timer = setTimeout(() => remove(id, layer), duration);
    active.set(entryKey(layer, id), entry);
    updateVisibility(id);
    notify();
    return entry;
  }

  function remove(id, layer, { silent = false } = {}) {
    const entry = active.get(entryKey(layer, id));
    if (!entry) return false;
    clearTimeout(entry.timer);
    entry.object.removeFromParent();
    entry.material.dispose();
    active.delete(entryKey(layer, id));
    updateVisibility(id);
    if (!silent) notify();
    return true;
  }

  /** 条件に合う強調をまとめて解除する */
  function removeWhere(predicate) {
    const targets = [...active.values()].filter(predicate);
    if (targets.length === 0) return;
    for (const e of targets) remove(e.id, e.layer, { silent: true });
    notify();
  }

  return {
    /**
     * @param {string} vertexId
     * @param {{ color?: string|number, opacity?: number, duration?: number, layer?: string }} [options]
     *   color: 'correct'(緑) / 'wrong'(赤) / 'reference'(基準のオレンジ) / 'selected' / 0xRRGGBB / '#rrggbb'
     *          省略時はレイヤーの色（default レイヤーは緑）
     *   duration: ミリ秒。0 なら解除するまで表示し続ける
     *   layer: 'reference' / 'default'（既定） / 'wrong' / 'correct'
     */
    highlightVertex: (vertexId, options) => highlight(resolveElementOfType(vertexId, ELEMENT_TYPES.VERTEX), ELEMENT_TYPES.VERTEX, options),
    highlightEdge: (edgeId, options) => highlight(resolveElementOfType(edgeId, ELEMENT_TYPES.EDGE), ELEMENT_TYPES.EDGE, options),
    highlightFace: (faceId, options) => highlight(resolveElementOfType(faceId, ELEMENT_TYPES.FACE), ELEMENT_TYPES.FACE, options),

    /** 種類の混在した ID をまとめて強調する。1つでも無効なら何も強調せずにエラー */
    highlightElements(ids, options) {
      const resolved = ids.map((input) => resolveElement(input));
      return resolved.map(({ id, type }) => highlight(id, type, options));
    },

    /**
     * 強調を解除する
     *   clearHighlights()                      すべて
     *   clearHighlights(['AB'])                AB のすべてのレイヤー
     *   clearHighlights(undefined, { layer })  指定レイヤーのすべて
     *   clearHighlights(['AB'], { layer })     AB の指定レイヤーだけ
     */
    clearHighlights(ids, { layer } = {}) {
      const idSet = ids === undefined ? null : new Set(ids.map((i) => resolveElement(i).id));
      removeWhere((e) => (!idSet || idSet.has(e.id)) && (!layer || e.layer === layer));
    },

    /** 指定レイヤーの強調をすべて解除 */
    clearLayer(layer) {
      removeWhere((e) => e.layer === layer);
    },

    /** 強調されているか（layer 省略時はどのレイヤーでも） */
    isHighlighted: (input, layer) => highlightedIds(layer).includes(resolveElement(input).id),
    /** 強調中の要素 ID（layer 省略時はすべてのレイヤー） */
    getHighlighted: (layer) => highlightedIds(layer),
    /** 強調の情報（layer 省略時は表示中のもの） */
    getHighlight(input, layer) {
      const { id } = resolveElement(input);
      return layer ? (active.get(entryKey(layer, id)) ?? null) : topEntry(id);
    },
    /** 表示中のレイヤー名（強調がなければ null） */
    getVisibleLayer: (input) => topEntry(resolveElement(input).id)?.layer ?? null,

    dispose() {
      for (const e of [...active.values()]) remove(e.id, e.layer, { silent: true });
      for (const g of Object.values(geometries)) g.dispose();
    },
  };
}

function resolveColor(color) {
  if (typeof color === 'string' && color in HIGHLIGHT_COLORS) return HIGHLIGHT_COLORS[color];
  return new THREE.Color(color);
}
