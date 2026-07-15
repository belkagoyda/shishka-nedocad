/**
 * nodes.js — управление реестром сетевых устройств (нод).
 *
 * Экспортирует функции для загрузки, рендеринга и отправки нод.
 * Использует fetch() для взаимодействия с API.
 * Подключает name_parser.js для отображения разобранных сегментов имени.
 * Типы оборудования подгружаются динамически из settings.js.
 */

import { parseName } from './name_parser.js';
import { getDeviceTypeNames, getDelimiter } from './settings.js';

const API_URL = '/api/nodes';
const MODELS_API_URL = '/api/models';

/**
 * Загружает список нод через GET /api/nodes.
 */
export async function loadNodes() {
  const response = await fetch(API_URL);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Загружает список моделей через GET /api/models.
 */
export async function loadModels() {
  const response = await fetch(MODELS_API_URL);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Создаёт новую ноду через POST /api/nodes.
 */
export async function createNode(data) {
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
 * Обновляет ноду через PUT /api/nodes/:id.
 */
export async function updateNode(id, data) {
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
 * Удаляет ноду через DELETE /api/nodes/:id.
 */
export async function deleteNode(id) {
  const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
}

/**
 * Форматирует результат parseName в строку «key:value» через пробел.
 */
function formatParsedName(name, schema, delimiter) {
  const parsed = parseName(name, schema, delimiter);
  return Object.entries(parsed)
    .filter(([k]) => k !== '_extra')
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
}

function getModelName(models, modelId) {
  if (modelId == null) return '';
  const model = models.find((m) => m.id === modelId);
  return model ? model.name : String(modelId);
}

// ---------------------------------------------------------------------------
// <select> для типа ноды
// ---------------------------------------------------------------------------

function createNodeTypeSelect(selectedType) {
  const select = document.createElement('select');
  select.dataset.field = 'type';
  const types = getDeviceTypeNames();
  const defaultType = 'ПК';
  const effectiveSelected = selectedType ?? (types.includes(defaultType) ? defaultType : types[0]);

  types.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === effectiveSelected) opt.selected = true;
    select.appendChild(opt);
  });
  return select;
}

// ---------------------------------------------------------------------------
// Отображение строк таблицы
// ---------------------------------------------------------------------------

function createNodeRow(node, models, schema, delimiter, onEdit, onDelete) {
  const tr = document.createElement('tr');
  tr.dataset.id = node.id;

  const tdName = document.createElement('td');
  tdName.textContent = node.name ?? '';
  tr.appendChild(tdName);

  const tdParsed = document.createElement('td');
  tdParsed.className = 'parsed-name-cell';
  tdParsed.textContent = node.name ? formatParsedName(node.name, schema, delimiter) : '';
  tr.appendChild(tdParsed);

  const tdType = document.createElement('td');
  tdType.textContent = node.type ?? '';
  tr.appendChild(tdType);

  const tdModel = document.createElement('td');
  tdModel.textContent = getModelName(models, node.model_id);
  tr.appendChild(tdModel);

  const tdIp = document.createElement('td');
  tdIp.textContent = node.ip ?? '';
  tr.appendChild(tdIp);

  const tdMac = document.createElement('td');
  tdMac.textContent = node.mac ?? '';
  tr.appendChild(tdMac);

  const tdActions = document.createElement('td');

  const btnEdit = document.createElement('button');
  btnEdit.textContent = 'Ред.';
  btnEdit.addEventListener('click', () => onEdit(tr, node));

  const btnDelete = document.createElement('button');
  btnDelete.textContent = 'Удал.';
  btnDelete.addEventListener('click', () => onDelete(node.id, tr));

  tdActions.appendChild(btnEdit);
  tdActions.appendChild(btnDelete);
  tr.appendChild(tdActions);

  return tr;
}

function createEditNodeRow(node, models, schema, delimiter, onSave, onCancel) {
  const tr = document.createElement('tr');
  tr.dataset.id = node.id;
  tr.dataset.editRow = 'true';

  // name
  const tdName = document.createElement('td');
  const inputName = document.createElement('input');
  inputName.type = 'text';
  inputName.value = node.name || '';
  inputName.dataset.field = 'name';
  const errName = document.createElement('span');
  errName.className = 'field-error';
  tdName.appendChild(inputName);
  tdName.appendChild(errName);
  tr.appendChild(tdName);

  // parsed name
  const tdParsed = document.createElement('td');
  tdParsed.className = 'parsed-name-cell';
  tdParsed.textContent = node.name ? formatParsedName(node.name, schema, delimiter) : '';
  inputName.addEventListener('input', () => {
    tdParsed.textContent = inputName.value ? formatParsedName(inputName.value, schema, delimiter) : '';
  });
  tr.appendChild(tdParsed);

  // type
  const tdType = document.createElement('td');
  const selectType = createNodeTypeSelect(node.type);
  const errType = document.createElement('span');
  errType.className = 'field-error';
  tdType.appendChild(selectType);
  tdType.appendChild(errType);
  tr.appendChild(tdType);

  // model_id
  const tdModel = document.createElement('td');
  const selectModel = document.createElement('select');
  selectModel.dataset.field = 'model_id';
  function populateModelSelect(type, selectedModelId) {
    selectModel.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '—';
    selectModel.appendChild(optNone);
    models.forEach((m) => {
      if (type && m.type !== type) return;
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (Number(m.id) === Number(selectedModelId)) opt.selected = true;
      selectModel.appendChild(opt);
    });
  }
  populateModelSelect(selectType.value, node.model_id);
  selectType.addEventListener('change', () => {
    populateModelSelect(selectType.value, null);
  });
  const errModel = document.createElement('span');
  errModel.className = 'field-error';
  tdModel.appendChild(selectModel);
  tdModel.appendChild(errModel);
  tr.appendChild(tdModel);

  // ip
  const tdIp = document.createElement('td');
  const inputIp = document.createElement('input');
  inputIp.type = 'text';
  inputIp.value = node.ip || '';
  inputIp.dataset.field = 'ip';
  const errIp = document.createElement('span');
  errIp.className = 'field-error';
  tdIp.appendChild(inputIp);
  tdIp.appendChild(errIp);
  tr.appendChild(tdIp);

  // mac
  const tdMac = document.createElement('td');
  const inputMac = document.createElement('input');
  inputMac.type = 'text';
  inputMac.value = node.mac || '';
  inputMac.dataset.field = 'mac';
  const errMac = document.createElement('span');
  errMac.className = 'field-error';
  tdMac.appendChild(inputMac);
  tdMac.appendChild(errMac);
  tr.appendChild(tdMac);

  // Actions
  const tdActions = document.createElement('td');
  const btnSave = document.createElement('button');
  btnSave.textContent = 'Сохр.';
  btnSave.addEventListener('click', () => onSave(tr));

  const btnCancel = document.createElement('button');
  btnCancel.textContent = 'Отмена';
  btnCancel.addEventListener('click', () => onCancel(tr, node));

  tdActions.appendChild(btnSave);
  tdActions.appendChild(btnCancel);
  tr.appendChild(tdActions);

  return tr;
}

export function createNewNodeRow(models, schema, delimiter, onSave) {
  const tr = document.createElement('tr');
  tr.dataset.newRow = 'true';

  // name
  const tdName = document.createElement('td');
  const inputName = document.createElement('input');
  inputName.type = 'text';
  inputName.value = '';
  inputName.placeholder = 'Имя ноды';
  inputName.dataset.field = 'name';
  const errName = document.createElement('span');
  errName.className = 'field-error';
  tdName.appendChild(inputName);
  tdName.appendChild(errName);
  tr.appendChild(tdName);

  // parsed name
  const tdParsed = document.createElement('td');
  tdParsed.className = 'parsed-name-cell';
  tdParsed.textContent = '';
  inputName.addEventListener('input', () => {
    tdParsed.textContent = inputName.value ? formatParsedName(inputName.value, schema, delimiter) : '';
  });
  tr.appendChild(tdParsed);

  // type (по умолчанию ПК)
  const tdType = document.createElement('td');
  const selectType = createNodeTypeSelect(null);
  const errType = document.createElement('span');
  errType.className = 'field-error';
  tdType.appendChild(selectType);
  tdType.appendChild(errType);
  tr.appendChild(tdType);

  // model_id
  const tdModel = document.createElement('td');
  const selectModel = document.createElement('select');
  selectModel.dataset.field = 'model_id';
  function populateNewModelSelect(type) {
    selectModel.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '—';
    optNone.selected = true;
    selectModel.appendChild(optNone);
    models.forEach((m) => {
      if (type && m.type !== type) return;
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      selectModel.appendChild(opt);
    });
  }
  populateNewModelSelect(selectType.value);
  selectType.addEventListener('change', () => {
    populateNewModelSelect(selectType.value);
  });
  const errModel = document.createElement('span');
  errModel.className = 'field-error';
  tdModel.appendChild(selectModel);
  tdModel.appendChild(errModel);
  tr.appendChild(tdModel);

  // ip
  const tdIp = document.createElement('td');
  const inputIp = document.createElement('input');
  inputIp.type = 'text';
  inputIp.value = '';
  inputIp.placeholder = '192.168.1.1';
  inputIp.dataset.field = 'ip';
  const errIp = document.createElement('span');
  errIp.className = 'field-error';
  tdIp.appendChild(inputIp);
  tdIp.appendChild(errIp);
  tr.appendChild(tdIp);

  // mac
  const tdMac = document.createElement('td');
  const inputMac = document.createElement('input');
  inputMac.type = 'text';
  inputMac.value = '';
  inputMac.placeholder = 'AA:BB:CC:DD:EE:FF';
  inputMac.dataset.field = 'mac';
  const errMac = document.createElement('span');
  errMac.className = 'field-error';
  tdMac.appendChild(inputMac);
  tdMac.appendChild(errMac);
  tr.appendChild(tdMac);

  // Actions
  const tdActions = document.createElement('td');
  const btnSave = document.createElement('button');
  btnSave.textContent = 'Сохр.';
  btnSave.addEventListener('click', () => onSave(tr));
  tdActions.appendChild(btnSave);
  tr.appendChild(tdActions);

  return tr;
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

function collectNodeRowData(tr) {
  const data = {};
  tr.querySelectorAll('[data-field]').forEach((el) => {
    const field = el.dataset.field;
    const value = el.value.trim();
    if (field === 'model_id') {
      data[field] = value === '' ? null : Number(value);
    } else {
      data[field] = value === '' ? null : value;
    }
  });
  return data;
}

function clearNodeRowErrors(tr) {
  tr.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
  });
}

function showNodeFieldError(tr, fieldName, message) {
  const target = tr.querySelector(`[data-field="${fieldName}"]`);
  if (target) {
    const errSpan = target.parentElement.querySelector('.field-error');
    if (errSpan) errSpan.textContent = message;
  }
}

function showNodeApiError(tr, errorMessage) {
  const match1 = errorMessage.match(/Field '(\w+)'/i);
  const match2 = errorMessage.match(/for field '(\w+)'/i);
  const field = (match1 && match1[1]) || (match2 && match2[1]) || 'name';
  const target = tr.querySelector(`[data-field="${field}"]`);
  if (target) {
    const errSpan = target.parentElement.querySelector('.field-error');
    if (errSpan) { errSpan.textContent = errorMessage; return; }
  }
  showNodeFieldError(tr, 'name', errorMessage);
}

// ---------------------------------------------------------------------------
// Рендеринг и инициализация
// ---------------------------------------------------------------------------

export function renderNodes(nodes, tbody, models, schema, onRefresh) {
  tbody.innerHTML = '';
  const delimiter = getDelimiter();

  nodes.forEach((node) => {
    const onEdit = (tr, n) => {
      const editRow = createEditNodeRow(
        n,
        models,
        schema,
        delimiter,
        async (editTr) => {
          clearNodeRowErrors(editTr);
          const data = collectNodeRowData(editTr);
          try {
            await updateNode(n.id, data);
            if (onRefresh) onRefresh();
          } catch (err) {
             showNodeApiError(editTr, err.apiError || err.message);
          }
        },
        (editTr, original) => {
          const viewRow = createNodeRow(original, models, schema, delimiter, onEdit, onDeleteHandler);
          editTr.replaceWith(viewRow);
        },
      );
      tr.replaceWith(editRow);
    };

    const onDeleteHandler = async (id, tr) => {
      try {
        await deleteNode(id);
        tr.remove();
      } catch (err) {
        alert(err.message);
      }
    };

    const row = createNodeRow(node, models, schema, delimiter, onEdit, onDeleteHandler);
    tbody.appendChild(row);
  });

  const newRow = createNewNodeRow(models, schema, delimiter, async (tr) => {
    clearNodeRowErrors(tr);
    const data = collectNodeRowData(tr);
    try {
      await createNode(data);
      if (onRefresh) onRefresh();
    } catch (err) {
      showNodeApiError(tr, err.apiError || err.message);
    }
  });
  tbody.appendChild(newRow);
}

export async function initNodesPage(tbody, errorContainer, schema) {
  const refresh = async () => {
    try {
      const [nodes, models] = await Promise.all([loadNodes(), loadModels()]);
      renderNodes(nodes, tbody, models, schema, refresh);
    } catch (err) {
      if (errorContainer) {
        errorContainer.textContent = `Ошибка загрузки: ${err.message}`;
      }
    }
  };

  await refresh();
}
