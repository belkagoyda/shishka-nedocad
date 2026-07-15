/**
 * topology_view.js — визуализация топологии сети.
 * Линии рисуются с двумя изгибами, точка изгиба ищется в свободном пространстве.
 */

import { DEFAULT_SCHEMA, getSchema, getDelimiter, getCabinetIndex } from './settings.js';

// ---------------------------------------------------------------------------
// Константы (будут переопределены настройками пользователя)
// ---------------------------------------------------------------------------
export const DEFAULT_NODE_WIDTH = 180;
export const DEFAULT_NODE_HEIGHT = 56;
export const PADDING_X = 60;
export const PADDING_Y = 50;
const DEFAULT_RANK = 10;

// Цвета нод
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

// Получение настроек из localStorage
function getTopologySettings() {
  try {
    const raw = localStorage.getItem('topologySettings');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { colGap: 80, rowGap: 160, maxOffset: 30, nodeOffset: 10, straightLines: false };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export async function loadTopologyData() {
  const [nodes, connections, models] = await Promise.all([
    fetchJson('/api/nodes'),
    fetchJson('/api/connections'),
    fetchJson('/api/models'),
  ]);
  return { nodes, connections, models };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Модели и размеры
// ---------------------------------------------------------------------------
export function buildModelMap(models) {
  const map = new Map();
  for (const model of models) {
    map.set(Number(model.id), model);
  }
  return map;
}

export function getNodeDimensions(node, modelMap) {
  const model = node.model_id != null ? modelMap.get(Number(node.model_id)) : undefined;
  if (model && model.width && model.height) {
    return { width: Number(model.width), height: Number(model.height) };
  }
  return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
}

// ---------------------------------------------------------------------------
// Cabinet-сегмент
// ---------------------------------------------------------------------------
export function getCabinetSegment(name, schema) {
  const delimiter = getDelimiter();
  const cabIdx = getCabinetIndex();
  const parts = name.split(delimiter);
  return (cabIdx >= 0 && cabIdx < parts.length) ? parts[cabIdx] : '';
}

// ---------------------------------------------------------------------------
// Компоновка (с учётом настроек)
// ---------------------------------------------------------------------------
export function layoutNodes(nodes, modelMap, schema = DEFAULT_SCHEMA) {
  const settings = getTopologySettings();
  const colGap = settings.colGap || 80;
  const rowGap = settings.rowGap || 160;

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
    const tierWidth = group.reduce((sum, node) => {
      const { width } = getNodeDimensions(node, modelMap);
      return sum + width + colGap;
    }, -colGap);
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
      currentX += width + colGap;
    }
    const maxHeightInRow = group.reduce((max, node) => {
      const { height } = getNodeDimensions(node, modelMap);
      return Math.max(max, height);
    }, 0);
    currentY += maxHeightInRow + rowGap;
  }

  return layoutItems;
}

export function computeLayout(nodes, connections, models, schema) {
  const resolvedSchema = schema ?? getSchema();
  const modelMap = buildModelMap(models);
  const layoutItems = layoutNodes(nodes, modelMap, resolvedSchema);
  return { layoutItems, connections, modelMap };
}

// ---------------------------------------------------------------------------
// SVG-рендеринг нод
// ---------------------------------------------------------------------------
const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSvgCanvas() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('xmlns', SVG_NS);
  svg.style.minHeight = '400px';
  return svg;
}

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

export function getNodeLabel(name, schema = DEFAULT_SCHEMA) {
  return (name ?? '').length > 20 ? (name ?? '').slice(0, 18) + '…' : (name ?? '');
}

// Заглушка для иконок (можно заменить на свои)
function renderDeviceIcon(g, nodeType, cx, cy, color) {
  const icon = document.createElementNS(SVG_NS, 'g');
  icon.setAttribute('transform', `translate(${cx - 12}, ${cy - 12})`);
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', '2'); rect.setAttribute('y', '2');
  rect.setAttribute('width', '20'); rect.setAttribute('height', '20');
  rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', color);
  rect.setAttribute('stroke-width', '1.5');
  icon.appendChild(rect);
  g.appendChild(icon);
}

export function renderNodes(svg, layoutItems, schema = DEFAULT_SCHEMA) {
  const defs = document.createElementNS(SVG_NS, 'defs');
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', 'shadow');
  filter.setAttribute('x', '-5%'); filter.setAttribute('y', '-5%');
  filter.setAttribute('width', '120%'); filter.setAttribute('height', '130%');
  const feOffset = document.createElementNS(SVG_NS, 'feDropShadow');
  feOffset.setAttribute('dx', '2'); feOffset.setAttribute('dy', '2');
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
    rect.setAttribute('x', String(x)); rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(width)); rect.setAttribute('height', String(height));
    rect.setAttribute('rx', '8'); rect.setAttribute('ry', '8');
    rect.setAttribute('fill', colors.fill); rect.setAttribute('stroke', colors.stroke);
    rect.setAttribute('stroke-width', '2'); rect.setAttribute('filter', 'url(#shadow)');
    g.appendChild(rect);

    const iconCX = x + 24; const iconCY = y + height / 2;
    renderDeviceIcon(g, node.type, iconCX, iconCY, colors.stroke);

    const sep = document.createElementNS(SVG_NS, 'line');
    sep.setAttribute('x1', String(x + 44)); sep.setAttribute('y1', String(y + 6));
    sep.setAttribute('x2', String(x + 44)); sep.setAttribute('y2', String(y + height - 6));
    sep.setAttribute('stroke', colors.stroke); sep.setAttribute('opacity', '0.25');
    sep.setAttribute('stroke-width', '1');
    g.appendChild(sep);

    const textAreaX = x + 48; const textAreaW = width - 52;
    const label = getNodeLabel(node.name ?? '', schema);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(textAreaX + textAreaW / 2));
    text.setAttribute('y', String(y + height / 2 - 5));
    text.setAttribute('font-size', '13px'); text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-family', 'sans-serif'); text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central'); text.setAttribute('fill', colors.text);
    text.textContent = label;
    g.appendChild(text);

    if (node.type) {
      const typeText = document.createElementNS(SVG_NS, 'text');
      typeText.setAttribute('x', String(textAreaX + textAreaW / 2));
      typeText.setAttribute('y', String(y + height / 2 + 12));
      typeText.setAttribute('font-size', '10px'); typeText.setAttribute('font-family', 'sans-serif');
      typeText.setAttribute('text-anchor', 'middle'); typeText.setAttribute('dominant-baseline', 'central');
      typeText.setAttribute('fill', colors.stroke); typeText.setAttribute('opacity', '0.7');
      typeText.textContent = node.type;
      g.appendChild(typeText);
    }
    svg.appendChild(g);
  }
}

// ---------------------------------------------------------------------------
// Карта позиций нод
// ---------------------------------------------------------------------------
export function buildNodePositionMap(layoutItems) {
  const map = new Map();
  for (const item of layoutItems) {
    map.set(Number(item.node.id), item);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Вспомогательная функция рисования полилинии
// ---------------------------------------------------------------------------
function drawPolyline(svg, points, conn) {
  const typeLine = conn.type_line ?? 'normal';
  const colourLine = conn.colour_line ?? '#7f8c8d';
  let strokeWidth;
  switch (typeLine) {
    case 'thin': strokeWidth = '1'; break;
    case 'thick': strokeWidth = '3'; break;
    default: strokeWidth = '2'; break;
  }

  const d = points.map(p => `${p[0]},${p[1]}`).join(' ');
  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('points', d);
  polyline.setAttribute('stroke', colourLine);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke-width', strokeWidth);
  polyline.setAttribute('stroke-linecap', 'round');
  polyline.setAttribute('stroke-linejoin', 'round');
  if (typeLine === 'dashed') {
    polyline.setAttribute('stroke-dasharray', '8,4');
  }
  svg.appendChild(polyline);
}

// ---------------------------------------------------------------------------
// Функция проверки, пересекает ли отрезок прямоугольник
// ---------------------------------------------------------------------------
function segmentIntersectsRect(x1, y1, x2, y2, node) {
  const rx = node.x;
  const ry = node.y;
  const rw = node.width;
  const rh = node.height;

  // Быстрая проверка: если отрезок полностью слева/справа/сверху/снизу
  if (Math.max(x1, x2) < rx || Math.min(x1, x2) > rx + rw ||
      Math.max(y1, y2) < ry || Math.min(y1, y2) > ry + rh) {
    return false;
  }

  // Проверяем пересечение с каждой стороной прямоугольника
  // Левая сторона
  if (lineIntersectsLine(x1, y1, x2, y2, rx, ry, rx, ry + rh)) return true;
  // Правая
  if (lineIntersectsLine(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh)) return true;
  // Верхняя
  if (lineIntersectsLine(x1, y1, x2, y2, rx, ry, rx + rw, ry)) return true;
  // Нижняя
  if (lineIntersectsLine(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Проверка пересечения двух отрезков
// ---------------------------------------------------------------------------
function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d1 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const d2 = (x2 - x1) * (y4 - y1) - (y2 - y1) * (x4 - x1);
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) return false;

  const d3 = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
  const d4 = (x4 - x3) * (y2 - y3) - (y4 - y3) * (x2 - x3);
  if ((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Рендеринг связей с гарантированным обходом узлов
// ---------------------------------------------------------------------------
export function renderConnections(svg, connections, nodePositionMap) {
  const settings = getTopologySettings();
  const MAX_OFFSET = settings.maxOffset || 30;
  const NODE_OFFSET = settings.nodeOffset || 10;
  const straight = settings.straightLines || false;

  const allNodes = Array.from(nodePositionMap.values());

  // Группируем по паре для веера
  const groups = new Map();
  for (const conn of connections) {
    const key = `${conn.src_node_id}-${conn.dst_node_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(conn);
  }

  for (const [key, conns] of groups) {
    const src = nodePositionMap.get(Number(conns[0].src_node_id));
    const dst = nodePositionMap.get(Number(conns[0].dst_node_id));
    if (!src || !dst) continue;

    const srcCX = src.x + src.width / 2;
    const srcCY = src.y + src.height / 2;
    const dstCX = dst.x + dst.width / 2;
    const dstCY = dst.y + dst.height / 2;

    const dx = dstCX - srcCX;
    const dy = dstCY - srcCY;
    const isHorizontal = Math.abs(dx) >= Math.abs(dy);

    const count = conns.length;
    const step = count > 1 ? (MAX_OFFSET * 2) / (count - 1) : 0;

    conns.forEach((conn, index) => {
      let offset = 0;
      if (count > 1) {
        offset = -MAX_OFFSET + index * step;
      }

      // Точки подключения (с отступом от краёв)
      let sx, sy, ex, ey;
      if (isHorizontal) {
        if (dx > 0) {
          sx = src.x + src.width - NODE_OFFSET;
          sy = srcCY + offset;
          ex = dst.x + NODE_OFFSET;
          ey = dstCY + offset;
        } else {
          sx = src.x + NODE_OFFSET;
          sy = srcCY + offset;
          ex = dst.x + dst.width - NODE_OFFSET;
          ey = dstCY + offset;
        }
      } else {
        if (dy > 0) {
          sx = srcCX + offset;
          sy = src.y + src.height - NODE_OFFSET;
          ex = dstCX + offset;
          ey = dst.y + NODE_OFFSET;
        } else {
          sx = srcCX + offset;
          sy = src.y + NODE_OFFSET;
          ex = dstCX + offset;
          ey = dst.y + dst.height - NODE_OFFSET;
        }
      }

      let points;
      if (straight) {
        points = [[sx, sy], [ex, ey]];
      } else {
        // Находим безопасную координату изгиба
        // Сначала проверим, есть ли конфликт с узлами на уровне середины
        let mid = isHorizontal ? (sx + ex) / 2 : (sy + ey) / 2;
        let safe = false;
        let attempts = 0;
        const maxAttempts = 30;
        const stepSize = 10;
        const margin = 15;

        while (!safe && attempts < maxAttempts) {
          safe = true;
          // Проверяем горизонтальный и вертикальный сегменты
          if (isHorizontal) {
            // Горизонтальный путь: (sx, sy) -> (mid, sy) -> (mid, ey) -> (ex, ey)
            // Проверяем первый сегмент (горизонтальный)
            if (segmentIntersectsRect(sx, sy, mid, sy, src) || segmentIntersectsRect(sx, sy, mid, sy, dst)) {
              safe = false;
            } else {
              for (const node of allNodes) {
                if (node.node.id === src.node.id || node.node.id === dst.node.id) continue;
                if (segmentIntersectsRect(sx, sy, mid, sy, node) ||
                    segmentIntersectsRect(mid, sy, mid, ey, node) ||
                    segmentIntersectsRect(mid, ey, ex, ey, node)) {
                  safe = false;
                  break;
                }
              }
            }
          } else {
            // Вертикальный путь: (sx, sy) -> (sx, mid) -> (ex, mid) -> (ex, ey)
            if (segmentIntersectsRect(sx, sy, sx, mid, src) || segmentIntersectsRect(sx, sy, sx, mid, dst)) {
              safe = false;
            } else {
              for (const node of allNodes) {
                if (node.node.id === src.node.id || node.node.id === dst.node.id) continue;
                if (segmentIntersectsRect(sx, sy, sx, mid, node) ||
                    segmentIntersectsRect(sx, mid, ex, mid, node) ||
                    segmentIntersectsRect(ex, mid, ex, ey, node)) {
                  safe = false;
                  break;
                }
              }
            }
          }

          if (!safe) {
            // Сдвигаем mid в сторону от источника
            const dir = isHorizontal ? (dx > 0 ? 1 : -1) : (dy > 0 ? 1 : -1);
            mid += dir * stepSize;
            attempts++;
          }
        }

        // Если не нашли безопасную точку, используем смещение за пределы всех узлов
        if (!safe) {
          if (isHorizontal) {
            // Для горизонтальных — смещаем mid в сторону, где меньше узлов
            const leftMost = Math.min(sx, ex);
            const rightMost = Math.max(sx, ex);
            // Находим крайний узел справа или слева
            let maxRight = rightMost;
            for (const node of allNodes) {
              if (node.node.id === src.node.id || node.node.id === dst.node.id) continue;
              if (node.x + node.width > maxRight) maxRight = node.x + node.width;
            }
            mid = maxRight + 50;
          } else {
            const topMost = Math.min(sy, ey);
            const bottomMost = Math.max(sy, ey);
            let maxBottom = bottomMost;
            for (const node of allNodes) {
              if (node.node.id === src.node.id || node.node.id === dst.node.id) continue;
              if (node.y + node.height > maxBottom) maxBottom = node.y + node.height;
            }
            mid = maxBottom + 50;
          }
        }

        // Строим L-образную линию с изгибом в mid
        if (isHorizontal) {
          points = [
            [sx, sy],
            [mid, sy],
            [mid, ey],
            [ex, ey]
          ];
        } else {
          points = [
            [sx, sy],
            [sx, mid],
            [ex, mid],
            [ex, ey]
          ];
        }
      }

      drawPolyline(svg, points, conn);
    });
  }
}

// ---------------------------------------------------------------------------
// Группировка по кабинетам (одна рамка на кабинет)
// ---------------------------------------------------------------------------
export const CABINET_GROUP_PADDING = 12;

export function layoutNodesGrouped(nodes, modelMap, schema = DEFAULT_SCHEMA) {
  return layoutNodes(nodes, modelMap, schema);
}

export function renderCabinetGroups(svg, layoutItems, schema = DEFAULT_SCHEMA) {
  const groups = new Map();
  for (const item of layoutItems) {
    const cabinet = getCabinetSegment(item.node.name ?? '', schema);
    if (cabinet === '') continue;
    if (!groups.has(cabinet)) groups.set(cabinet, []);
    groups.get(cabinet).push(item);
  }

  const createEl = svg.createElementNS
    ? (ns, tag) => svg.createElementNS(ns, tag)
    : (ns, tag) => document.createElementNS(ns, tag);

  for (const [cabinet, items] of groups) {
    if (items.length === 0) continue;
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const item of items) {
      if (item.x < minX) minX = item.x;
      if (item.y < minY) minY = item.y;
      if (item.x + item.width > maxX) maxX = item.x + item.width;
      if (item.y + item.height > maxY) maxY = item.y + item.height;
    }
    const rectX = minX - CABINET_GROUP_PADDING;
    const rectY = minY - CABINET_GROUP_PADDING;
    const rectW = (maxX - minX) + CABINET_GROUP_PADDING * 2;
    const rectH = (maxY - minY) + CABINET_GROUP_PADDING * 2;
    const rect = createEl(SVG_NS, 'rect');
    rect.setAttribute('x', String(rectX));
    rect.setAttribute('y', String(rectY));
    rect.setAttribute('width', String(rectW));
    rect.setAttribute('height', String(rectH));
    rect.setAttribute('rx', '6');
    rect.setAttribute('ry', '6');
    rect.setAttribute('fill', 'rgba(200,220,240,0.15)');
    rect.setAttribute('stroke', '#90a4ae');
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('stroke-dasharray', '6,3');
    svg.appendChild(rect);

    const cabinetLabel = createEl(SVG_NS, 'text');
    cabinetLabel.setAttribute('x', String(rectX + 8));
    cabinetLabel.setAttribute('y', String(rectY + 14));
    cabinetLabel.setAttribute('font-size', '10px');
    cabinetLabel.setAttribute('font-family', 'sans-serif');
    cabinetLabel.setAttribute('fill', '#607d8b');
    cabinetLabel.textContent = cabinet;
    svg.appendChild(cabinetLabel);
  }
}

// ---------------------------------------------------------------------------
// Экспорт PDF
// ---------------------------------------------------------------------------
export function triggerPdfExport() {
  window.print();
}