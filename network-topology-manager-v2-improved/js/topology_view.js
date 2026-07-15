/**
 * topology_view.js — загрузка данных, алгоритм компоновки и SVG-рендеринг топологии.
 *
 * Отвечает за:
 *   - Параллельную загрузку нод, связей и моделей через API
 *   - Построение карты моделей для O(1)-доступа
 *   - Вычисление размеров нод из модели (по умолчанию 40×12)
 *   - Алгоритм компоновки: группировка по rank, сортировка по cabinet-сегменту,
 *     вычисление координат прямоугольников
 *   - SVG-рендеринг нод (rect) и меток (text) на холсте 1920×1080
 *   - SVG-рендеринг связей как двухсегментных ломаных
 *   - Группировка по кабинетам: пунктирный <rect> вокруг нод с одинаковым cabinet-сегментом
 *   - Экспорт PDF через window.print() с CSS для A4 landscape
 *
 * Requirements: 6.1, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 6.14
 */

import { parseName } from './name_parser.js';
import { DEFAULT_SCHEMA, getSchema, getDelimiter, getCabinetIndex } from './settings.js';

// ---------------------------------------------------------------------------
// Константы компоновки
// ---------------------------------------------------------------------------

/** Ширина ноды по умолчанию (px) */
export const DEFAULT_NODE_WIDTH = 180;

/** Высота ноды по умолчанию (px) */
export const DEFAULT_NODE_HEIGHT = 56;

/** Горизонтальный зазор между нодами в одном ряду (px) */
export const COLUMN_GAP = 80;

/** Вертикальный зазор между рядами (тирами) (px) */
export const ROW_GAP = 160;

/** Отступ от краёв холста (px) */
export const PADDING_X = 60;

/** Отступ от верхнего края (px) */
export const PADDING_Y = 50;

/** Rank по умолчанию */
const DEFAULT_RANK = 10;

/** Цвета нод по типу устройства */
const NODE_COLORS = {
  'ПК':             { fill: '#d5f5e3', stroke: '#27ae60', text: '#1a6e3a' },
  'принтер':        { fill: '#fdebd0', stroke: '#e67e22', text: '#935116' },
  'коммутатор':     { fill: '#d6eaf8', stroke: '#2980b9', text: '#1a5276' },
  'маршрутизатор':  { fill: '#fadbd8', stroke: '#c0392b', text: '#78281f' },
  '_default':       { fill: '#f2f3f4', stroke: '#7f8c8d', text: '#2c3e50' },
};

function getNodeColor(nodeType) {
  return NODE_COLORS[nodeType] || NODE_COLORS['_default'];
}

/**
 * SVG-иконки устройств (24×24 viewBox).
 * Каждая иконка — набор SVG-элементов, которые вставляются в <g> с нужным transform.
 */
function renderDeviceIcon(g, nodeType, cx, cy, color) {
  const icon = document.createElementNS(SVG_NS, 'g');
  icon.setAttribute('transform', `translate(${cx - 12}, ${cy - 12})`);

  const t = (nodeType ?? '').toLowerCase();

  if (t === 'пк') {
    // Monitor icon
    const screen = document.createElementNS(SVG_NS, 'rect');
    screen.setAttribute('x', '2'); screen.setAttribute('y', '2');
    screen.setAttribute('width', '20'); screen.setAttribute('height', '14');
    screen.setAttribute('rx', '2'); screen.setAttribute('ry', '2');
    screen.setAttribute('fill', 'none'); screen.setAttribute('stroke', color);
    screen.setAttribute('stroke-width', '1.8');
    icon.appendChild(screen);
    const stand = document.createElementNS(SVG_NS, 'path');
    stand.setAttribute('d', 'M8 18 L16 18 M12 16 L12 18');
    stand.setAttribute('stroke', color); stand.setAttribute('stroke-width', '1.8');
    stand.setAttribute('fill', 'none'); stand.setAttribute('stroke-linecap', 'round');
    icon.appendChild(stand);
    const screenLine = document.createElementNS(SVG_NS, 'line');
    screenLine.setAttribute('x1', '6'); screenLine.setAttribute('y1', '9');
    screenLine.setAttribute('x2', '18'); screenLine.setAttribute('y2', '9');
    screenLine.setAttribute('stroke', color); screenLine.setAttribute('stroke-width', '1');
    screenLine.setAttribute('opacity', '0.4');
    icon.appendChild(screenLine);

  } else if (t === 'принтер') {
    // Printer icon
    const body = document.createElementNS(SVG_NS, 'rect');
    body.setAttribute('x', '3'); body.setAttribute('y', '8');
    body.setAttribute('width', '18'); body.setAttribute('height', '10');
    body.setAttribute('rx', '2'); body.setAttribute('ry', '2');
    body.setAttribute('fill', 'none'); body.setAttribute('stroke', color);
    body.setAttribute('stroke-width', '1.8');
    icon.appendChild(body);
    const paper = document.createElementNS(SVG_NS, 'rect');
    paper.setAttribute('x', '6'); paper.setAttribute('y', '2');
    paper.setAttribute('width', '12'); paper.setAttribute('height', '8');
    paper.setAttribute('fill', 'none'); paper.setAttribute('stroke', color);
    paper.setAttribute('stroke-width', '1.5');
    icon.appendChild(paper);
    const tray = document.createElementNS(SVG_NS, 'path');
    tray.setAttribute('d', 'M7 18 L7 21 L17 21 L17 18');
    tray.setAttribute('stroke', color); tray.setAttribute('stroke-width', '1.5');
    tray.setAttribute('fill', 'none');
    icon.appendChild(tray);

  } else if (t === 'коммутатор') {
    // Switch icon (box with ports)
    const box = document.createElementNS(SVG_NS, 'rect');
    box.setAttribute('x', '1'); box.setAttribute('y', '6');
    box.setAttribute('width', '22'); box.setAttribute('height', '12');
    box.setAttribute('rx', '2'); box.setAttribute('ry', '2');
    box.setAttribute('fill', 'none'); box.setAttribute('stroke', color);
    box.setAttribute('stroke-width', '1.8');
    icon.appendChild(box);
    // Ports
    for (let px = 5; px <= 19; px += 4) {
      const port = document.createElementNS(SVG_NS, 'rect');
      port.setAttribute('x', String(px)); port.setAttribute('y', '9');
      port.setAttribute('width', '3'); port.setAttribute('height', '3');
      port.setAttribute('fill', color); port.setAttribute('opacity', '0.7');
      icon.appendChild(port);
    }
    // LEDs
    for (let px = 5; px <= 19; px += 4) {
      const led = document.createElementNS(SVG_NS, 'circle');
      led.setAttribute('cx', String(px + 1.5)); led.setAttribute('cy', '15');
      led.setAttribute('r', '1');
      led.setAttribute('fill', color); led.setAttribute('opacity', '0.5');
      icon.appendChild(led);
    }

  } else if (t === 'маршрутизатор') {
    // Router icon (circle with arrows)
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '1.8');
    icon.appendChild(circle);
    const arrows = document.createElementNS(SVG_NS, 'path');
    arrows.setAttribute('d', 'M12 5 L12 19 M5 12 L19 12 M8 8 L16 16 M16 8 L8 16');
    arrows.setAttribute('stroke', color); arrows.setAttribute('stroke-width', '1.2');
    arrows.setAttribute('fill', 'none'); arrows.setAttribute('stroke-linecap', 'round');
    arrows.setAttribute('opacity', '0.6');
    icon.appendChild(arrows);
    const innerCircle = document.createElementNS(SVG_NS, 'circle');
    innerCircle.setAttribute('cx', '12'); innerCircle.setAttribute('cy', '12');
    innerCircle.setAttribute('r', '3');
    innerCircle.setAttribute('fill', color); innerCircle.setAttribute('opacity', '0.3');
    icon.appendChild(innerCircle);

  } else {
    // Default: generic device icon (server-like box)
    const box = document.createElementNS(SVG_NS, 'rect');
    box.setAttribute('x', '4'); box.setAttribute('y', '3');
    box.setAttribute('width', '16'); box.setAttribute('height', '18');
    box.setAttribute('rx', '2'); box.setAttribute('ry', '2');
    box.setAttribute('fill', 'none'); box.setAttribute('stroke', color);
    box.setAttribute('stroke-width', '1.8');
    icon.appendChild(box);
    const line1 = document.createElementNS(SVG_NS, 'line');
    line1.setAttribute('x1', '4'); line1.setAttribute('y1', '10');
    line1.setAttribute('x2', '20'); line1.setAttribute('y2', '10');
    line1.setAttribute('stroke', color); line1.setAttribute('stroke-width', '1');
    icon.appendChild(line1);
    const line2 = document.createElementNS(SVG_NS, 'line');
    line2.setAttribute('x1', '4'); line2.setAttribute('y1', '15');
    line2.setAttribute('x2', '20'); line2.setAttribute('y2', '15');
    line2.setAttribute('stroke', color); line2.setAttribute('stroke-width', '1');
    icon.appendChild(line2);
  }

  g.appendChild(icon);
}

// ---------------------------------------------------------------------------
// API-загрузка
// ---------------------------------------------------------------------------

/**
 * Загружает ноды, связи и модели через API параллельно.
 *
 * @returns {Promise<{nodes: Array, connections: Array, models: Array}>}
 * @throws {Error} при ошибке сети или HTTP 5xx
 */
export async function loadTopologyData() {
  const [nodes, connections, models] = await Promise.all([
    fetchJson('/api/nodes'),
    fetchJson('/api/connections'),
    fetchJson('/api/models'),
  ]);
  return { nodes, connections, models };
}

/**
 * Вспомогательная функция: выполняет GET-запрос и возвращает JSON.
 *
 * @param {string} url
 * @returns {Promise<any>}
 */
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Карта моделей
// ---------------------------------------------------------------------------

/**
 * Строит Map из id модели → объект модели для O(1)-доступа.
 *
 * @param {Array} models — массив объектов моделей
 * @returns {Map<number, Object>}
 */
export function buildModelMap(models) {
  const map = new Map();
  for (const model of models) {
    map.set(Number(model.id), model);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Размеры ноды
// ---------------------------------------------------------------------------

/**
 * Возвращает размеры прямоугольника ноды из её модели.
 * Если модель не найдена или не содержит корректных размеров — возвращает значения по умолчанию.
 *
 * @param {Object} node — объект ноды (должен содержать model_id)
 * @param {Map<number, Object>} modelMap — карта id → модель
 * @returns {{ width: number, height: number }}
 */
export function getNodeDimensions(node, modelMap) {
    const model = node.model_id != null ? modelMap.get(Number(node.model_id)) : undefined;
    if (model && model.width && model.height) {
        return { 
            width: Number(model.width), 
            height: Number(model.height) 
        };
    }
    return { 
        width: DEFAULT_NODE_WIDTH, 
        height: DEFAULT_NODE_HEIGHT 
    };
}


// ---------------------------------------------------------------------------
// Cabinet-сегмент
// ---------------------------------------------------------------------------

/**
 * Извлекает cabinet-сегмент из имени ноды по заданной схеме.
 * Возвращает пустую строку, если сегмент отсутствует.
 *
 * @param {string} name — имя ноды
 * @param {string[]} schema — схема сегментов (например, ['building','floor','cabinet','device'])
 * @returns {string}
 */
export function getCabinetSegment(name, schema) {
  const delimiter = getDelimiter();
  const cabIdx = getCabinetIndex();
  const parts = name.split(delimiter);
  return (cabIdx >= 0 && cabIdx < parts.length) ? parts[cabIdx] : '';
}

// ---------------------------------------------------------------------------
// Алгоритм компоновки
// ---------------------------------------------------------------------------

/**
 * Основной алгоритм компоновки нод.
 *
 * 1. Группирует ноды по rank (из модели; если модели нет — rank = DEFAULT_RANK).
 * 2. Сортирует группы по возрастанию rank (слева направо).
 * 3. Внутри каждой группы сортирует ноды по cabinet-сегменту лексикографически.
 * 4. Вычисляет x, y координаты для каждого прямоугольника ноды.
 *
 * Правила вычисления координат:
 *   - Первая колонка начинается с x = PADDING_X
 *   - Каждая следующая колонка: x += (max_width_в_предыдущей_колонке + COLUMN_GAP)
 *   - Первая нода в колонке: y = PADDING_Y
 *   - Каждая следующая нода: y += (высота_предыдущей_ноды + ROW_GAP)
 *
 * @param {Array} nodes — массив объектов нод
 * @param {Map<number, Object>} modelMap — карта id → модель
 * @param {string[]} [schema=DEFAULT_SCHEMA] — схема сегментов для парсинга имён
 * @returns {Array<{node: Object, x: number, y: number, width: number, height: number}>}
 */
export function layoutNodes(nodes, modelMap, schema = DEFAULT_SCHEMA) {
  const rankGroups = new Map();

  for (const node of nodes) {
    const model = node.model_id != null ? modelMap.get(Number(node.model_id)) : undefined;
    const rank = (model != null && model.rank != null) ? Number(model.rank) : DEFAULT_RANK;
    if (!rankGroups.has(rank)) rankGroups.set(rank, []);
    rankGroups.get(rank).push(node);
  }

  const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b);

  const layoutItems = [];
  let currentY = PADDING_Y;

  let maxTierWidth = 0;
  const tierData = [];
  for (const rank of sortedRanks) {
    const group = rankGroups.get(rank);
    group.sort((a, b) => {
      const cabinetA = getCabinetSegment(a.name ?? '', schema);
      const cabinetB = getCabinetSegment(b.name ?? '', schema);
      if (cabinetA < cabinetB) return -1;
      if (cabinetA > cabinetB) return 1;
      return (a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0;
    });
    const tierWidth = group.length * DEFAULT_NODE_WIDTH + (group.length - 1) * COLUMN_GAP;
    if (tierWidth > maxTierWidth) maxTierWidth = tierWidth;
    tierData.push({ rank, group, tierWidth });
  }

  const canvasWidth = maxTierWidth + PADDING_X * 2;

  for (const { group, tierWidth } of tierData) {
    const startX = (canvasWidth - tierWidth) / 2;
    let currentX = startX;
    for (const node of group) {
      const { width, height } = getNodeDimensions(node, modelMap);
      layoutItems.push({ node, x: currentX, y: currentY, width, height });
      currentX += width + COLUMN_GAP;
    }
    currentY += DEFAULT_NODE_HEIGHT + ROW_GAP;
  }

  return layoutItems;
}

// ---------------------------------------------------------------------------
// Оркестратор компоновки
// ---------------------------------------------------------------------------

/**
 * Оркестрирует полную компоновку: строит карту моделей и вычисляет позиции нод.
 *
 * @param {Array} nodes — массив объектов нод
 * @param {Array} connections — массив объектов связей
 * @param {Array} models — массив объектов моделей
 * @param {string[]} [schema] — схема сегментов; если не передана — читается из getSchema()
 * @returns {{ layoutItems: Array, connections: Array, modelMap: Map }}
 */
export function computeLayout(nodes, connections, models, schema) {
  const resolvedSchema = schema ?? getSchema();
  const modelMap = buildModelMap(models);
  const layoutItems = layoutNodes(nodes, modelMap, resolvedSchema);
  return { layoutItems, connections, modelMap };
}

// ---------------------------------------------------------------------------
// SVG-рендеринг нод и меток (Requirements: 6.1, 6.6, 6.7, 6.8)
// ---------------------------------------------------------------------------

/** SVG namespace URI */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Создаёт SVG-элемент с авто-подгоняемыми размерами.
 * viewBox задаётся позже через fitSvgToContent().
 *
 * @returns {SVGSVGElement}
 */
export function createSvgCanvas() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('xmlns', SVG_NS);
  svg.style.minHeight = '400px';
  return svg;
}

/**
 * Подгоняет viewBox SVG под содержимое с отступами.
 */
export function fitSvgToContent(svg, layoutItems) {
  if (layoutItems.length === 0) {
    svg.setAttribute('viewBox', '0 0 800 400');
    svg.style.height = '400px';
    return;
  }
  let maxX = 0, maxY = 0;
  for (const item of layoutItems) {
    const right = item.x + item.width;
    const bottom = item.y + item.height;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  const vw = maxX + PADDING_X;
  const vh = maxY + PADDING_Y;
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.style.height = Math.max(400, vh) + 'px';
}

/**
 * Определяет метку для ноды согласно правилу:
 *   - Если в имени присутствует cabinet-сегмент (≥3 сегментов по схеме по умолчанию),
 *     возвращает device-сегмент (последний сегмент имени).
 *   - Иначе возвращает первые 6 символов имени.
 *
 * @param {string} name — имя ноды
 * @param {string[]} [schema=DEFAULT_SCHEMA] — схема сегментов
 * @returns {string}
 */
export function getNodeLabel(name, schema = DEFAULT_SCHEMA) {
  return (name ?? '').length > 20 ? (name ?? '').slice(0, 18) + '…' : (name ?? '');
}

/**
 * Отрисовывает ноды и их метки на SVG-холсте.
 *
 * Для каждого элемента компоновки:
 *   - Добавляет `<rect>` с координатами и размерами из layoutItem
 *   - Добавляет `<text>` с меткой, расположенной на 8pt выше прямоугольника
 *
 * @param {SVGSVGElement} svg — SVG-элемент, созданный через createSvgCanvas()
 * @param {Array<{node: Object, x: number, y: number, width: number, height: number}>} layoutItems
 * @param {string[]} [schema=DEFAULT_SCHEMA] — схема сегментов для определения метки
 */
export function renderNodes(svg, layoutItems, schema = DEFAULT_SCHEMA) {
  // Add drop shadow filter
  const defs = document.createElementNS(SVG_NS, 'defs');
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', 'shadow');
  filter.setAttribute('x', '-5%');
  filter.setAttribute('y', '-5%');
  filter.setAttribute('width', '120%');
  filter.setAttribute('height', '130%');
  const feOffset = document.createElementNS(SVG_NS, 'feDropShadow');
  feOffset.setAttribute('dx', '2');
  feOffset.setAttribute('dy', '2');
  feOffset.setAttribute('stdDeviation', '3');
  feOffset.setAttribute('flood-color', 'rgba(0,0,0,0.15)');
  filter.appendChild(feOffset);
  defs.appendChild(filter);
  svg.appendChild(defs);

  for (const item of layoutItems) {
    const { node, x, y, width, height } = item;
    const colors = getNodeColor(node.type ?? '');

    const g = document.createElementNS(SVG_NS, 'g');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('rx', '8');
    rect.setAttribute('ry', '8');
    rect.setAttribute('fill', colors.fill);
    rect.setAttribute('stroke', colors.stroke);
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('filter', 'url(#shadow)');
    g.appendChild(rect);

    // Device icon on the left
    const iconCX = x + 24;
    const iconCY = y + height / 2;
    renderDeviceIcon(g, node.type, iconCX, iconCY, colors.stroke);

    // Vertical separator line
    const sep = document.createElementNS(SVG_NS, 'line');
    sep.setAttribute('x1', String(x + 44)); sep.setAttribute('y1', String(y + 6));
    sep.setAttribute('x2', String(x + 44)); sep.setAttribute('y2', String(y + height - 6));
    sep.setAttribute('stroke', colors.stroke); sep.setAttribute('opacity', '0.25');
    sep.setAttribute('stroke-width', '1');
    g.appendChild(sep);

    // Node name (right of icon)
    const textAreaX = x + 48;
    const textAreaW = width - 52;
    const label = getNodeLabel(node.name ?? '', schema);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(textAreaX + textAreaW / 2));
    text.setAttribute('y', String(y + height / 2 - 5));
    text.setAttribute('font-size', '13px');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-family', 'sans-serif');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', colors.text);
    text.textContent = label;
    g.appendChild(text);

    // Type label (small, below name)
    if (node.type) {
      const typeText = document.createElementNS(SVG_NS, 'text');
      typeText.setAttribute('x', String(textAreaX + textAreaW / 2));
      typeText.setAttribute('y', String(y + height / 2 + 12));
      typeText.setAttribute('font-size', '10px');
      typeText.setAttribute('font-family', 'sans-serif');
      typeText.setAttribute('text-anchor', 'middle');
      typeText.setAttribute('dominant-baseline', 'central');
      typeText.setAttribute('fill', colors.stroke);
      typeText.setAttribute('opacity', '0.7');
      typeText.textContent = node.type;
      g.appendChild(typeText);
    }

    svg.appendChild(g);
  }
}

// ---------------------------------------------------------------------------
// Карта позиций нод (Requirements: 6.9, 6.10)
// ---------------------------------------------------------------------------

/**
 * Строит Map из node.id → элемент компоновки для O(1)-доступа при рендеринге связей.
 *
 * @param {Array<{node: Object, x: number, y: number, width: number, height: number}>} layoutItems
 * @returns {Map<number|string, {node: Object, x: number, y: number, width: number, height: number}>}
 */
export function buildNodePositionMap(layoutItems) {
  const map = new Map();
  for (const item of layoutItems) {
    map.set(Number(item.node.id), item);
  }
  return map;
}

// ---------------------------------------------------------------------------
// SVG-рендеринг связей (Requirements: 6.9, 6.10)
// ---------------------------------------------------------------------------

/**
 * Отрисовывает связи на SVG-холсте как двухсегментные ломаные (L-образные).
 *
 * Для каждой связи строится `<polyline>` из трёх точек:
 *   1. (srcRight, srcMidY)  — правый край источника
 *   2. (dstLeft,  srcMidY)  — горизонтальный сегмент до x назначения
 *   3. (dstLeft,  dstMidY)  — вертикальный сегмент до центра назначения
 *
 * Это даёт ровно два сегмента: один горизонтальный и один вертикальный изгиб.
 *
 * Атрибуты линии:
 *   - `stroke`        = colour_line (по умолчанию #000000)
 *   - `fill`          = none
 *   - `stroke-width`  = 1 (normal/dashed), 0.5 (thin), 2 (thick)
 *   - `stroke-dasharray` = "4,4" только для type_line === 'dashed'
 *
 * @param {SVGSVGElement} svg — SVG-элемент, созданный через createSvgCanvas()
 * @param {Array<{id: number, src_node_id: number, dst_node_id: number, type_line: string, colour_line: string}>} connections
 * @param {Map<number|string, {node: Object, x: number, y: number, width: number, height: number}>} nodePositionMap
 */
export function renderConnections(svg, connections, nodePositionMap) {
  for (const conn of connections) {
    const src = nodePositionMap.get(Number(conn.src_node_id));
    const dst = nodePositionMap.get(Number(conn.dst_node_id));
    if (!src || !dst) continue;

    // Determine connection points based on relative positions
    const srcCX = src.x + src.width / 2;
    const srcCY = src.y + src.height / 2;
    const dstCX = dst.x + dst.width / 2;
    const dstCY = dst.y + dst.height / 2;

    let sx, sy, ex, ey;
    if (Math.abs(dstCY - srcCY) > Math.abs(dstCX - srcCX)) {
      // Vertical connection
      if (dstCY > srcCY) {
        sx = srcCX; sy = src.y + src.height; // bottom of src
        ex = dstCX; ey = dst.y;              // top of dst
      } else {
        sx = srcCX; sy = src.y;              // top of src
        ex = dstCX; ey = dst.y + dst.height; // bottom of dst
      }
    } else {
      // Horizontal connection
      if (dstCX > srcCX) {
        sx = src.x + src.width; sy = srcCY;  // right of src
        ex = dst.x;             ey = dstCY;  // left of dst
      } else {
        sx = src.x;             sy = srcCY;  // left of src
        ex = dst.x + dst.width; ey = dstCY;  // right of dst
      }
    }

    // Smooth bezier curve
    const midY = (sy + ey) / 2;
    const d = `M ${sx} ${sy} C ${sx} ${midY}, ${ex} ${midY}, ${ex} ${ey}`;

    const typeLine   = conn.type_line   ?? 'normal';
    const colourLine = conn.colour_line ?? '#7f8c8d';
    let strokeWidth;
    switch (typeLine) {
      case 'thin':  strokeWidth = '1';   break;
      case 'thick': strokeWidth = '3';   break;
      default:      strokeWidth = '2';   break;
    }

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', colourLine);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', strokeWidth);
    path.setAttribute('stroke-linecap', 'round');
    if (typeLine === 'dashed') {
      path.setAttribute('stroke-dasharray', '8,4');
    }

    // Draw small circle at connection endpoints
    const dot1 = document.createElementNS(SVG_NS, 'circle');
    dot1.setAttribute('cx', String(sx));
    dot1.setAttribute('cy', String(sy));
    dot1.setAttribute('r', '3');
    dot1.setAttribute('fill', colourLine);

    const dot2 = document.createElementNS(SVG_NS, 'circle');
    dot2.setAttribute('cx', String(ex));
    dot2.setAttribute('cy', String(ey));
    dot2.setAttribute('r', '3');
    dot2.setAttribute('fill', colourLine);

    svg.appendChild(path);
    svg.appendChild(dot1);
    svg.appendChild(dot2);
  }
}

// ---------------------------------------------------------------------------
// Группировка по кабинетам (Requirements: 6.12, 6.13)
// ---------------------------------------------------------------------------

/** Отступ вокруг группы нод при рисовании пунктирного прямоугольника (px) */
export const CABINET_GROUP_PADDING = 12;

/**
 * Вариант layoutNodes с явной группировкой по кабинетам внутри каждой rank-колонки.
 *
 * Алгоритм идентичен layoutNodes (ноды уже сортируются по cabinet-сегменту),
 * но функция явно документирована как «grouped» вариант для использования
 * при включённом чекбоксе «Группировка по кабинетам».
 *
 * При включённой группировке ноды внутри каждого cabinet-сегмента располагаются
 * вертикально (что уже обеспечивается сортировкой по cabinet в layoutNodes).
 *
 * @param {Array} nodes — массив объектов нод
 * @param {Map<number, Object>} modelMap — карта id → модель
 * @param {string[]} [schema=DEFAULT_SCHEMA] — схема сегментов для парсинга имён
 * @returns {Array<{node: Object, x: number, y: number, width: number, height: number}>}
 *
 * Requirements: 6.13
 */
export function layoutNodesGrouped(nodes, modelMap, schema = DEFAULT_SCHEMA) {
  // Delegates to layoutNodes — cabinet-sorting is already applied there,
  // which arranges nodes within each cabinet group vertically.
  return layoutNodes(nodes, modelMap, schema);
}

/**
 * Отрисовывает пунктирные прямоугольники вокруг групп нод с одинаковым cabinet-сегментом.
 *
 * Для каждой уникальной пары (cabinet, rank-колонка) вычисляет bounding box всех нод
 * группы и рисует `<rect>` с отступом CABINET_GROUP_PADDING со всех сторон.
 *
 * Атрибуты прямоугольника:
 *   - `stroke-dasharray` = "4,4"
 *   - `fill`             = "none"
 *   - `stroke`           = "#666666"
 *   - `stroke-width`     = "1"
 *
 * Ноды без cabinet-сегмента (cabinet === '') не группируются и не обводятся.
 *
 * Рекомендуемый CSS для страницы топологии (для поддержки экспорта PDF):
 * ```css
 * \@media print {
 *   \@page { size: A4 landscape; }
 * }
 * ```
 *
 * @param {SVGSVGElement} svg — SVG-элемент, созданный через createSvgCanvas()
 * @param {Array<{node: Object, x: number, y: number, width: number, height: number}>} layoutItems
 * @param {string[]} [schema=DEFAULT_SCHEMA] — схема сегментов для парсинга имён
 *
 * Requirements: 6.12
 */
export function renderCabinetGroups(svg, layoutItems, schema = DEFAULT_SCHEMA) {
  // Build a map: cabinetKey → array of layoutItems
  // cabinetKey = "<cabinet>@<x>" — unique per cabinet within a rank column
  // (nodes in the same rank column share the same x-coordinate)
  /** @type {Map<string, Array>} */
  const groups = new Map();

  for (const item of layoutItems) {
    const cabinet = getCabinetSegment(item.node.name ?? '', schema);
    if (cabinet === '') continue; // skip nodes without a cabinet segment

    // Use cabinet + x-coordinate as the group key so that nodes in different
    // rank columns with the same cabinet name are treated as separate groups.
    const key = `${cabinet}@${item.x}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }

  // Draw a dashed rect around each group
  const createEl = svg.createElementNS
    ? (ns, tag) => svg.createElementNS(ns, tag)
    : (ns, tag) => document.createElementNS(ns, tag);

  for (const items of groups.values()) {
    if (items.length === 0) continue;

    // Compute bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of items) {
      if (item.x < minX) minX = item.x;
      if (item.y < minY) minY = item.y;
      if (item.x + item.width > maxX) maxX = item.x + item.width;
      if (item.y + item.height > maxY) maxY = item.y + item.height;
    }

    // Apply padding
    const rectX = minX - CABINET_GROUP_PADDING;
    const rectY = minY - CABINET_GROUP_PADDING;
    const rectW = (maxX - minX) + CABINET_GROUP_PADDING * 2;
    const rectH = (maxY - minY) + CABINET_GROUP_PADDING * 2;

    const rect = createEl(SVG_NS, 'rect');
    rect.setAttribute('x',                String(rectX));
    rect.setAttribute('y',                String(rectY));
    rect.setAttribute('width',            String(rectW));
    rect.setAttribute('height',           String(rectH));
    rect.setAttribute('rx',               '6');
    rect.setAttribute('ry',               '6');
    rect.setAttribute('fill',             'rgba(200,220,240,0.15)');
    rect.setAttribute('stroke',           '#90a4ae');
    rect.setAttribute('stroke-width',     '1.5');
    rect.setAttribute('stroke-dasharray', '6,3');

    // Cabinet label
    const cabinet = getCabinetSegment(items[0].node.name ?? '', schema);
    if (cabinet) {
      const cabinetLabel = createEl(SVG_NS, 'text');
      cabinetLabel.setAttribute('x', String(rectX + 8));
      cabinetLabel.setAttribute('y', String(rectY + 14));
      cabinetLabel.setAttribute('font-size', '10px');
      cabinetLabel.setAttribute('font-family', 'sans-serif');
      cabinetLabel.setAttribute('fill', '#607d8b');
      cabinetLabel.textContent = cabinet;
      svg.appendChild(cabinetLabel);
    }

    svg.appendChild(rect);
  }
}

// ---------------------------------------------------------------------------
// Экспорт PDF (Requirement: 6.14)
// ---------------------------------------------------------------------------

/**
 * Вызывает браузерный диалог печати для экспорта топологии в PDF.
 *
 * Для корректного форматирования страница топологии должна включать следующий CSS:
 * ```css
 * \@media print {
 *   \@page { size: A4 landscape; }
 *   body  { margin: 0; }
 * }
 * ```
 *
 * Этот CSS обеспечивает:
 *   - Ориентацию A4 landscape при печати/сохранении в PDF
 *   - Отсутствие лишних отступов вокруг SVG-схемы
 *
 * @returns {void}
 *
 * Requirements: 6.14
 */
export function triggerPdfExport() {
  window.print();
}
