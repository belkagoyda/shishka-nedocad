/**
 * models.js — управление каталогом моделей оборудования.
 *
 * Экспортирует функции для загрузки, рендеринга и отправки моделей.
 * Использует fetch() для взаимодействия с API.
 * Типы оборудования подгружаются динамически из settings.js.
 */

import { getDeviceTypeNames, getTypeDefaults } from './settings.js';

const API_URL = '/api/models';

/**
 * Загружает список моделей через GET /api/models.
 */
export async function loadModels() {
  const response = await fetch(API_URL);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Создаёт новую модель через POST /api/models.
 */
export async function createModel(data) {
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
 * Обновляет модель через PUT /api/models/:id.
 */
export async function updateModel(id, data) {
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
 * Удаляет модель через DELETE /api/models/:id.
 */
export async function deleteModel(id) {
  const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
}

// ---------------------------------------------------------------------------
// Генерация <select> для типа с автозаполнением полей rank/width/height
// ---------------------------------------------------------------------------

/**
 * Создаёт <select> для типа оборудования.
 * При изменении типа автозаполняет rank/width/height из настроек.
 *
 * @param {string|null} selectedType — текущий тип (или null для нового)
 * @param {HTMLTableRowElement} tr — строка таблицы
 * @returns {HTMLSelectElement}
 */
function createTypeSelect(selectedType, tr) {
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

  select.addEventListener('change', () => {
    applyTypeDefaults(tr, select.value);
  });

  return select;
}

/**
 * Автозаполнение rank/width/height из настроек типа.
 */
function applyTypeDefaults(tr, typeName) {
  const defaults = getTypeDefaults(typeName);
  const rankInput = tr.querySelector('[data-field="rank"]');
  const widthInput = tr.querySelector('[data-field="width"]');
  const heightInput = tr.querySelector('[data-field="height"]');
  if (rankInput) rankInput.value = defaults.rank;
  if (widthInput) widthInput.value = defaults.width;
  if (heightInput) heightInput.value = defaults.height;
}

// ---------------------------------------------------------------------------
// Отображение строк таблицы
// ---------------------------------------------------------------------------

function createModelRow(model, onEdit, onDelete) {
  const tr = document.createElement('tr');
  tr.dataset.id = model.id;

  const fields = ['name', 'type', 'rank', 'width', 'height'];
  fields.forEach((field) => {
    const td = document.createElement('td');
    td.textContent = model[field] ?? '';
    tr.appendChild(td);
  });

  const tdActions = document.createElement('td');

  const btnEdit = document.createElement('button');
  btnEdit.textContent = 'Ред.';
  btnEdit.addEventListener('click', () => onEdit(tr, model));

  const btnDelete = document.createElement('button');
  btnDelete.textContent = 'Удал.';
  btnDelete.addEventListener('click', () => onDelete(model.id, tr));

  tdActions.appendChild(btnEdit);
  tdActions.appendChild(btnDelete);
  tr.appendChild(tdActions);

  return tr;
}

function createEditRow(model, onSave, onCancel) {
  const tr = document.createElement('tr');
  tr.dataset.id = model.id;
  tr.dataset.editRow = 'true';

  // name
  const tdName = document.createElement('td');
  const inputName = document.createElement('input');
  inputName.type = 'text';
  inputName.value = model.name || '';
  inputName.dataset.field = 'name';
  const errName = document.createElement('span');
  errName.className = 'field-error';
  tdName.appendChild(inputName);
  tdName.appendChild(errName);
  tr.appendChild(tdName);

  // type (select с динамическими типами)
  const tdType = document.createElement('td');
  const selectType = createTypeSelect(model.type, tr);
  const errType = document.createElement('span');
  errType.className = 'field-error';
  tdType.appendChild(selectType);
  tdType.appendChild(errType);
  tr.appendChild(tdType);

  // rank
  const tdRank = document.createElement('td');
  const inputRank = document.createElement('input');
  inputRank.type = 'number';
  inputRank.min = '0';
  inputRank.max = '10';
  inputRank.value = model.rank ?? '';
  inputRank.dataset.field = 'rank';
  inputRank.title = '0 = верх топологии, 10 = низ. ПК=1, коммутатор=5, маршрутизатор=10';
  const errRank = document.createElement('span');
  errRank.className = 'field-error';
  tdRank.appendChild(inputRank);
  tdRank.appendChild(errRank);
  tr.appendChild(tdRank);

  // width
  const tdWidth = document.createElement('td');
  const inputWidth = document.createElement('input');
  inputWidth.type = 'number';
  inputWidth.value = model.width ?? '';
  inputWidth.dataset.field = 'width';
  const errWidth = document.createElement('span');
  errWidth.className = 'field-error';
  tdWidth.appendChild(inputWidth);
  tdWidth.appendChild(errWidth);
  tr.appendChild(tdWidth);

  // height
  const tdHeight = document.createElement('td');
  const inputHeight = document.createElement('input');
  inputHeight.type = 'number';
  inputHeight.value = model.height ?? '';
  inputHeight.dataset.field = 'height';
  const errHeight = document.createElement('span');
  errHeight.className = 'field-error';
  tdHeight.appendChild(inputHeight);
  tdHeight.appendChild(errHeight);
  tr.appendChild(tdHeight);

  // Actions
  const tdActions = document.createElement('td');
  const btnSave = document.createElement('button');
  btnSave.textContent = 'Сохр.';
  btnSave.addEventListener('click', () => onSave(tr));

  const btnCancel = document.createElement('button');
  btnCancel.textContent = 'Отмена';
  btnCancel.addEventListener('click', () => onCancel(tr, model));

  tdActions.appendChild(btnSave);
  tdActions.appendChild(btnCancel);
  tr.appendChild(tdActions);

  return tr;
}

/**
 * Создаёт пустую редактируемую строку для добавления новой модели.
 * Автозаполняет rank/width/height по типу ПК (по умолчанию).
 */
export function createNewRow(onSave) {
  const tr = document.createElement('tr');
  tr.dataset.newRow = 'true';

  // name
  const tdName = document.createElement('td');
  const inputName = document.createElement('input');
  inputName.type = 'text';
  inputName.value = '';
  inputName.placeholder = 'Название';
  inputName.dataset.field = 'name';
  const errName = document.createElement('span');
  errName.className = 'field-error';
  tdName.appendChild(inputName);
  tdName.appendChild(errName);
  tr.appendChild(tdName);

  // type (select, по умолчанию ПК)
  const tdType = document.createElement('td');
  const selectType = createTypeSelect(null, tr);
  const errType = document.createElement('span');
  errType.className = 'field-error';
  tdType.appendChild(selectType);
  tdType.appendChild(errType);
  tr.appendChild(tdType);

  // rank — предзаполнено из дефолтов типа
  const defaultType = 'ПК';
  const defaults = getTypeDefaults(defaultType);

  const tdRank = document.createElement('td');
  const inputRank = document.createElement('input');
  inputRank.type = 'number';
  inputRank.min = '0';
  inputRank.max = '10';
  inputRank.value = defaults.rank;
  inputRank.dataset.field = 'rank';
  inputRank.title = '0 = верх топологии, 10 = низ. ПК=1, коммутатор=5, маршрутизатор=10';
  const errRank = document.createElement('span');
  errRank.className = 'field-error';
  tdRank.appendChild(inputRank);
  tdRank.appendChild(errRank);
  tr.appendChild(tdRank);

  // width — предзаполнено
  const tdWidth = document.createElement('td');
  const inputWidth = document.createElement('input');
  inputWidth.type = 'number';
  inputWidth.value = defaults.width;
  inputWidth.dataset.field = 'width';
  const errWidth = document.createElement('span');
  errWidth.className = 'field-error';
  tdWidth.appendChild(inputWidth);
  tdWidth.appendChild(errWidth);
  tr.appendChild(tdWidth);

  // height — предзаполнено
  const tdHeight = document.createElement('td');
  const inputHeight = document.createElement('input');
  inputHeight.type = 'number';
  inputHeight.value = defaults.height;
  inputHeight.dataset.field = 'height';
  const errHeight = document.createElement('span');
  errHeight.className = 'field-error';
  tdHeight.appendChild(inputHeight);
  tdHeight.appendChild(errHeight);
  tr.appendChild(tdHeight);

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

function collectRowData(tr) {
  const data = {};
  tr.querySelectorAll('[data-field]').forEach((el) => {
    const field = el.dataset.field;
    const value = el.value.trim();
    if (field === 'rank' || field === 'width' || field === 'height') {
      data[field] = value === '' ? undefined : Number(value);
    } else {
      data[field] = value;
    }
  });
  return data;
}

function clearRowErrors(tr) {
  tr.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
  });
}

function detectErrorField(errorMessage) {
  const match1 = errorMessage.match(/Field '(\w+)'/i);
  if (match1) return match1[1];
  const match2 = errorMessage.match(/for field '(\w+)'/i);
  if (match2) return match2[1];
  return 'name';
}

function showFieldError(tr, fieldName, message) {
  const target = tr.querySelector(`[data-field="${fieldName}"]`);
  if (target) {
    const errSpan = target.parentElement.querySelector('.field-error');
    if (errSpan) errSpan.textContent = message;
  }
}

function showApiError(tr, errorMessage) {
  const field = detectErrorField(errorMessage);
  const target = tr.querySelector(`[data-field="${field}"]`);
  if (target) {
    const errSpan = target.parentElement.querySelector('.field-error');
    if (errSpan) { errSpan.textContent = errorMessage; return; }
  }
  showFieldError(tr, 'name', errorMessage);
}

// ---------------------------------------------------------------------------
// Рендеринг и инициализация
// ---------------------------------------------------------------------------

export function renderModels(models, tbody, onRefresh) {
  tbody.innerHTML = '';

  models.forEach((model) => {
      const onEdit = (tr, m) => {
      const editRow = createEditRow(
        m,
        async (editTr) => {
          clearRowErrors(editTr);
          const data = collectRowData(editTr);
          try {
            await updateModel(m.id, data);
            if (onRefresh) onRefresh();
          } catch (err) {
            showApiError(editTr, err.apiError || err.message);
          }
        },
        (editTr, original) => {
          const viewRow = createModelRow(original, onEdit, onDeleteHandler);
          editTr.replaceWith(viewRow);
        },
      );
      tr.replaceWith(editRow);
    };

    const onDeleteHandler = async (id, tr) => {
      try {
        await deleteModel(id);
        tr.remove();
      } catch (err) {
        alert(err.message);
      }
    };

    const row = createModelRow(model, onEdit, onDeleteHandler);
    tbody.appendChild(row);
  });

  const newRow = createNewRow(async (tr) => {
    clearRowErrors(tr);
    const data = collectRowData(tr);
    try {
      await createModel(data);
      if (onRefresh) onRefresh();
    } catch (err) {
      showApiError(tr, err.apiError || err.message);
    }
  });
  tbody.appendChild(newRow);
}

export async function initModelsPage(tbody, errorContainer) {
  const refresh = async () => {
    try {
      const models = await loadModels();
      renderModels(models, tbody, refresh);
    } catch (err) {
      if (errorContainer) {
        errorContainer.textContent = `Ошибка загрузки: ${err.message}`;
      }
    }
  };

  await refresh();
}
