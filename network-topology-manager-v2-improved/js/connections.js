/**
 * connections.js — управление реестром связей между нодами.
 *
 * Экспортирует функции для загрузки, рендеринга и отправки связей.
 * Использует fetch() для взаимодействия с API.
 *
 * Requirements: 4.6, 4.7, 5.1, 5.7
 */

import {
  getSchema,
  getDelimiter,
  getCabinetIndex,
  getEndpointTypeNames,
  getSwitchTypeName,
  getRouterTypeName,
} from './settings.js';

const API_URL = '/api/connections';
const NODES_API_URL = '/api/nodes';
const AUTO_LINK_URL = '/api/auto-link';

/** Допустимые значения типа линии */
export const LINE_TYPES = ['normal', 'thin', 'thick', 'dashed'];

/**
 * Загружает список связей через GET /api/connections.
 *
 * @returns {Promise<Array>} — массив объектов связей
 * @throws {Error} при ошибке сети или HTTP 5xx
 */
export async function loadConnections() {
  const response = await fetch(API_URL);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Загружает список нод через GET /api/nodes.
 *
 * @returns {Promise<Array>} — массив объектов нод
 * @throws {Error} при ошибке сети или HTTP 5xx
 */
export async function loadNodes() {
  const response = await fetch(NODES_API_URL);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Создаёт новую связь через POST /api/connections.
 *
 * @param {Object} data — поля связи: src_node_id, dst_node_id, type_line, colour_line
 * @returns {Promise<Object>} — созданная запись
 * @throws {Error} при ошибке сети; при HTTP 4xx возвращает объект с полем error
 */
export async function createConnection(data) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.error || `HTTP ${response.status}`);
    err.apiError = body.error || `HTTP ${response.status}`;
    err.status = response.status;
    throw err;
  }
  return body;
}

/**
 * Обновляет связь через PUT /api/connections/:id.
 *
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<Object>} — обновлённая запись
 */
export async function updateConnection(id, data) {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.error || `HTTP ${response.status}`);
    err.apiError = body.error || `HTTP ${response.status}`;
    err.status = response.status;
    throw err;
  }
  return body;
}

/**
 * Удаляет связь через DELETE /api/connections/:id.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteConnection(id) {
  const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
}

/**
 * Запускает Auto_Link_Engine через POST /api/auto-link.
 *
 * @returns {Promise<Object>} — { nodes_created, connections_created, errors }
 * @throws {Error} при ошибке сети или HTTP 5xx
 */
export async function runAutoLink() {
  const response = await fetch(AUTO_LINK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema: getSchema(),
      delimiter: getDelimiter(),
      cabinet_index: getCabinetIndex(),
      endpoint_types: getEndpointTypeNames(),
      switch_type: getSwitchTypeName(),
      router_type: getRouterTypeName(),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 207) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

/**
 * Находит имя ноды по её id.
 *
 * @param {Array} nodes — массив объектов нод
 * @param {number|null} nodeId
 * @returns {string}
 */
function getNodeName(nodes, nodeId) {
  if (nodeId == null) return '';
  const node = nodes.find((n) => n.id === nodeId);
  return node ? node.name : String(nodeId);
}

/**
 * Создаёт выпадающий список нод.
 *
 * @param {Array} nodes — массив объектов нод
 * @param {string} field — значение data-field
 * @param {number|null} selectedId — выбранный id
 * @returns {HTMLSelectElement}
 */
function createNodeSelect(nodes, field, selectedId) {
  const select = document.createElement('select');
  select.dataset.field = field;

  const optNone = document.createElement('option');
  optNone.value = '';
  optNone.textContent = '—';
  if (selectedId == null) optNone.selected = true;
  select.appendChild(optNone);

  nodes.forEach((n) => {
    const opt = document.createElement('option');
    opt.value = n.id;
    opt.textContent = n.name;
    if (n.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });

  return select;
}

/**
 * Создаёт строку таблицы для существующей связи (режим просмотра).
 *
 * @param {Object} conn — объект связи (с полями src_node_name, dst_node_name из JOIN или id)
 * @param {Array} nodes — массив объектов нод
 * @param {Function} onEdit — callback при нажатии Edit
 * @param {Function} onDelete — callback при нажатии Delete
 * @returns {HTMLTableRowElement}
 */
function createConnectionRow(conn, nodes, onEdit, onDelete) {
  const tr = document.createElement('tr');
  tr.dataset.id = conn.id;

  const tdSrc = document.createElement('td');
  tdSrc.textContent = conn.src_node_name ?? getNodeName(nodes, conn.src_node_id);
  tr.appendChild(tdSrc);

  const tdSrcPort = document.createElement('td');
  tdSrcPort.textContent = conn.src_port_id ?? '';
  tr.appendChild(tdSrcPort);

  const tdDst = document.createElement('td');
  tdDst.textContent = conn.dst_node_name ?? getNodeName(nodes, conn.dst_node_id);
  tr.appendChild(tdDst);

  const tdDstPort = document.createElement('td');
  tdDstPort.textContent = conn.dst_port_id ?? '';
  tr.appendChild(tdDstPort);

  const tdType = document.createElement('td');
  tdType.textContent = conn.type_line ?? 'normal';
  tr.appendChild(tdType);

  const tdColour = document.createElement('td');
  const colourSwatch = document.createElement('span');
  colourSwatch.style.display = 'inline-block';
  colourSwatch.style.width = '16px';
  colourSwatch.style.height = '16px';
  colourSwatch.style.backgroundColor = conn.colour_line ?? '#000000';
  colourSwatch.style.border = '1px solid #ccc';
  colourSwatch.style.marginRight = '6px';
  colourSwatch.style.verticalAlign = 'middle';
  tdColour.appendChild(colourSwatch);
  tdColour.appendChild(document.createTextNode(conn.colour_line ?? '#000000'));
  tr.appendChild(tdColour);

  const tdActions = document.createElement('td');

  const btnEdit = document.createElement('button');
  btnEdit.textContent = 'Ред.';
  btnEdit.addEventListener('click', () => onEdit(tr, conn));

  const btnDelete = document.createElement('button');
  btnDelete.textContent = 'Удал.';
  btnDelete.addEventListener('click', () => onDelete(conn.id, tr));

  tdActions.appendChild(btnEdit);
  tdActions.appendChild(btnDelete);
  tr.appendChild(tdActions);

  return tr;
}

/**
 * Создаёт строку таблицы в режиме редактирования для существующей связи.
 *
 * @param {Object} conn
 * @param {Array} nodes — массив объектов нод
 * @param {Function} onSave — callback при нажатии Save
 * @param {Function} onCancel — callback при нажатии Cancel
 * @returns {HTMLTableRowElement}
 */
function createEditConnectionRow(conn, nodes, onSave, onCancel) {
  const tr = document.createElement('tr');
  tr.dataset.id = conn.id;
  tr.dataset.editRow = 'true';

  const tdSrc = document.createElement('td');
  const selectSrc = createNodeSelect(nodes, 'src_node_id', conn.src_node_id);
  const errSrc = document.createElement('span');
  errSrc.className = 'field-error';
  tdSrc.appendChild(selectSrc);
  tdSrc.appendChild(errSrc);
  tr.appendChild(tdSrc);

  const tdSrcPort = document.createElement('td');
  const inputSrcPort = document.createElement('input');
  inputSrcPort.type = 'text';
  inputSrcPort.value = conn.src_port_id ?? '';
  inputSrcPort.placeholder = 'Порт';
  inputSrcPort.dataset.field = 'src_port_id';
  tdSrcPort.appendChild(inputSrcPort);
  tr.appendChild(tdSrcPort);

  const tdDst = document.createElement('td');
  const selectDst = createNodeSelect(nodes, 'dst_node_id', conn.dst_node_id);
  const errDst = document.createElement('span');
  errDst.className = 'field-error';
  tdDst.appendChild(selectDst);
  tdDst.appendChild(errDst);
  tr.appendChild(tdDst);

  const tdDstPort = document.createElement('td');
  const inputDstPort = document.createElement('input');
  inputDstPort.type = 'text';
  inputDstPort.value = conn.dst_port_id ?? '';
  inputDstPort.placeholder = 'Порт';
  inputDstPort.dataset.field = 'dst_port_id';
  tdDstPort.appendChild(inputDstPort);
  tr.appendChild(tdDstPort);

  const tdType = document.createElement('td');
  const selectType = document.createElement('select');
  selectType.dataset.field = 'type_line';
  LINE_TYPES.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === (conn.type_line ?? 'normal')) opt.selected = true;
    selectType.appendChild(opt);
  });
  const errType = document.createElement('span');
  errType.className = 'field-error';
  tdType.appendChild(selectType);
  tdType.appendChild(errType);
  tr.appendChild(tdType);

  // colour_line
  const tdColour = document.createElement('td');
  const inputColour = document.createElement('input');
  inputColour.type = 'color';
  inputColour.value = conn.colour_line ?? '#000000';
  inputColour.dataset.field = 'colour_line';
  const errColour = document.createElement('span');
  errColour.className = 'field-error';
  tdColour.appendChild(inputColour);
  tdColour.appendChild(errColour);
  tr.appendChild(tdColour);

  // Actions
  const tdActions = document.createElement('td');
  const btnSave = document.createElement('button');
  btnSave.textContent = 'Сохр.';
  btnSave.addEventListener('click', () => onSave(tr));

  const btnCancel = document.createElement('button');
  btnCancel.textContent = 'Отмена';
  btnCancel.addEventListener('click', () => onCancel(tr, conn));

  tdActions.appendChild(btnSave);
  tdActions.appendChild(btnCancel);
  tr.appendChild(tdActions);

  return tr;
}

/**
 * Создаёт пустую редактируемую строку для добавления новой связи.
 *
 * @param {Array} nodes — массив объектов нод
 * @param {Function} onSave — callback при нажатии Save
 * @returns {HTMLTableRowElement}
 */
export function createNewConnectionRow(nodes, onSave) {
  const tr = document.createElement('tr');
  tr.dataset.newRow = 'true';

  const tdSrc = document.createElement('td');
  const selectSrc = createNodeSelect(nodes, 'src_node_id', null);
  const errSrc = document.createElement('span');
  errSrc.className = 'field-error';
  tdSrc.appendChild(selectSrc);
  tdSrc.appendChild(errSrc);
  tr.appendChild(tdSrc);

  const tdSrcPort = document.createElement('td');
  const inputSrcPort = document.createElement('input');
  inputSrcPort.type = 'text';
  inputSrcPort.value = '';
  inputSrcPort.placeholder = 'Порт';
  inputSrcPort.dataset.field = 'src_port_id';
  tdSrcPort.appendChild(inputSrcPort);
  tr.appendChild(tdSrcPort);

  const tdDst = document.createElement('td');
  const selectDst = createNodeSelect(nodes, 'dst_node_id', null);
  const errDst = document.createElement('span');
  errDst.className = 'field-error';
  tdDst.appendChild(selectDst);
  tdDst.appendChild(errDst);
  tr.appendChild(tdDst);

  const tdDstPort = document.createElement('td');
  const inputDstPort = document.createElement('input');
  inputDstPort.type = 'text';
  inputDstPort.value = '';
  inputDstPort.placeholder = 'Порт';
  inputDstPort.dataset.field = 'dst_port_id';
  tdDstPort.appendChild(inputDstPort);
  tr.appendChild(tdDstPort);

  const tdType = document.createElement('td');
  const selectType = document.createElement('select');
  selectType.dataset.field = 'type_line';
  LINE_TYPES.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    selectType.appendChild(opt);
  });
  const errType = document.createElement('span');
  errType.className = 'field-error';
  tdType.appendChild(selectType);
  tdType.appendChild(errType);
  tr.appendChild(tdType);

  // colour_line
  const tdColour = document.createElement('td');
  const inputColour = document.createElement('input');
  inputColour.type = 'color';
  inputColour.value = '#000000';
  inputColour.dataset.field = 'colour_line';
  const errColour = document.createElement('span');
  errColour.className = 'field-error';
  tdColour.appendChild(inputColour);
  tdColour.appendChild(errColour);
  tr.appendChild(tdColour);

  // Actions
  const tdActions = document.createElement('td');
  const btnSave = document.createElement('button');
  btnSave.textContent = 'Сохр.';
  btnSave.addEventListener('click', () => onSave(tr));
  tdActions.appendChild(btnSave);
  tr.appendChild(tdActions);

  return tr;
}

/**
 * Считывает данные из строки таблицы (редактируемой или новой).
 *
 * @param {HTMLTableRowElement} tr
 * @returns {Object} — объект с полями src_node_id, dst_node_id, type_line, colour_line
 */
function collectConnectionRowData(tr) {
  const data = {};
  tr.querySelectorAll('[data-field]').forEach((el) => {
    const field = el.dataset.field;
    const value = el.value.trim();
    if (field === 'src_node_id' || field === 'dst_node_id') {
      data[field] = value === '' ? null : Number(value);
    } else {
      data[field] = value === '' ? null : value;
    }
  });
  return data;
}

/**
 * Очищает все ошибки в строке таблицы.
 *
 * @param {HTMLTableRowElement} tr
 */
function clearConnectionRowErrors(tr) {
  tr.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
  });
}

function showConnectionFieldError(tr, fieldName, message) {
  const target = tr.querySelector(`[data-field="${fieldName}"]`);
  if (target) {
    const errSpan = target.parentElement.querySelector('.field-error');
    if (errSpan) errSpan.textContent = message;
  }
}

function showConnectionApiError(tr, errorMessage) {
  const match1 = errorMessage.match(/Field '(\w+)'/i);
  const match2 = errorMessage.match(/for field '(\w+)'/i);
  const field = (match1 && match1[1]) || (match2 && match2[1]) || 'src_node_id';
  const target = tr.querySelector(`[data-field="${field}"]`);
  if (target) {
    const errSpan = target.parentElement.querySelector('.field-error');
    if (errSpan) { errSpan.textContent = errorMessage; return; }
  }
  showConnectionFieldError(tr, 'src_node_id', errorMessage);
}

/**
 * Рендерит таблицу связей в указанный tbody.
 * Добавляет строки для каждой связи и пустую редактируемую строку в конце.
 *
 * @param {Array} connections — массив объектов связей (с src_node_name, dst_node_name из JOIN)
 * @param {HTMLTableSectionElement} tbody — элемент tbody таблицы
 * @param {Array} nodes — массив объектов нод (для выпадающих списков)
 * @param {Function} onRefresh — callback для обновления таблицы (перезагрузка данных)
 */
export function renderConnections(connections, tbody, nodes, onRefresh) {
  tbody.innerHTML = '';

  connections.forEach((conn) => {
    const onEdit = (tr, c) => {
      const editRow = createEditConnectionRow(
        c,
        nodes,
        async (editTr) => {
          clearConnectionRowErrors(editTr);
          const data = collectConnectionRowData(editTr);
          try {
            await updateConnection(c.id, data);
            if (onRefresh) onRefresh();
          } catch (err) {
             showConnectionApiError(editTr, err.apiError || err.message);
          }
        },
        (editTr, original) => {
          const viewRow = createConnectionRow(original, nodes, onEdit, onDeleteHandler);
          editTr.replaceWith(viewRow);
        },
      );
      tr.replaceWith(editRow);
    };

    const onDeleteHandler = async (id, tr) => {
      try {
        await deleteConnection(id);
        tr.remove();
      } catch (err) {
        alert(err.message);
      }
    };

    const row = createConnectionRow(conn, nodes, onEdit, onDeleteHandler);
    tbody.appendChild(row);
  });

  // Пустая редактируемая строка в конце таблицы
  const newRow = createNewConnectionRow(nodes, async (tr) => {
    clearConnectionRowErrors(tr);
    const data = collectConnectionRowData(tr);
    try {
      await createConnection(data);
      if (onRefresh) onRefresh();
    } catch (err) {
      showConnectionApiError(tr, err.apiError || err.message);
    }
  });
  tbody.appendChild(newRow);
}

/**
 * Инициализирует страницу реестра связей.
 * Загружает данные и рендерит таблицу.
 * Подключает кнопку «Автосвязи».
 *
 * @param {HTMLTableSectionElement} tbody
 * @param {HTMLElement} errorContainer — элемент для отображения глобальных ошибок
 * @param {HTMLButtonElement} btnAutoLink — кнопка «Автосвязи»
 * @param {HTMLElement} autoLinkStatus — элемент для отображения результата автосвязей
 */
export async function initConnectionsPage(tbody, errorContainer, btnAutoLink, autoLinkStatus) {
  const refresh = async () => {
    try {
      const [connections, nodes] = await Promise.all([loadConnections(), loadNodes()]);
      renderConnections(connections, tbody, nodes, refresh);
    } catch (err) {
      if (errorContainer) {
        errorContainer.textContent = `Ошибка загрузки: ${err.message}`;
      }
    }
  };

  if (btnAutoLink) {
    btnAutoLink.addEventListener('click', async () => {
      btnAutoLink.disabled = true;
      if (autoLinkStatus) autoLinkStatus.textContent = 'Выполняется…';
      try {
        const result = await runAutoLink();
        if (autoLinkStatus) {
          autoLinkStatus.textContent =
            `Создано нод: ${result.nodes_created ?? 0}, ` +
            `создано связей: ${result.connections_created ?? 0}.` +
            (result.errors && result.errors.length > 0
              ? ` Ошибки: ${result.errors.join('; ')}`
              : '');
        }
        await refresh();
      } catch (err) {
        if (autoLinkStatus) autoLinkStatus.textContent = `Ошибка: ${err.message}`;
      } finally {
        btnAutoLink.disabled = false;
      }
    });
  }

  await refresh();
}
