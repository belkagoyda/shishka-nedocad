/**
 * Settings — управление настройками приложения (localStorage).
 *
 * Хранит:
 *   - parseSchema     — метки сегментов имени ноды
 *   - parseDelimiter   — символ-разделитель имени ноды (по умолчанию "-")
 *   - cabinetIndex     — индекс сегмента «кабинет» для автосвязей
 *   - deviceTypes      — пользовательские типы оборудования с дефолтами и ролями
 */

// ---------------------------------------------------------------------------
// Ключи localStorage
// ---------------------------------------------------------------------------
const SCHEMA_KEY    = 'parseSchema';
const DELIMITER_KEY = 'parseDelimiter';
const CABINET_KEY   = 'cabinetIndex';
const TYPES_KEY     = 'deviceTypes';

// ---------------------------------------------------------------------------
// Значения по умолчанию
// ---------------------------------------------------------------------------

export const DEFAULT_SCHEMA    = ['здание', 'этаж', 'кабинет', 'устройство'];
export const DEFAULT_DELIMITER = '-';
export const DEFAULT_CABINET_INDEX = 2;

/**
 * Типы оборудования по умолчанию.
 * role: 'endpoint' | 'switch' | 'router'
 */
export const DEFAULT_DEVICE_TYPES = [
  { name: 'ПК',             rank: 1,  width: 40, height: 12, role: 'endpoint' },
  { name: 'принтер',        rank: 1,  width: 40, height: 12, role: 'endpoint' },
  { name: 'коммутатор',     rank: 5,  width: 60, height: 12, role: 'switch' },
  { name: 'маршрутизатор',  rank: 10, width: 80, height: 16, role: 'router' },
];

// ---------------------------------------------------------------------------
// Parse Schema
// ---------------------------------------------------------------------------

export function getSchema() {
  try {
    const raw = localStorage.getItem(SCHEMA_KEY);
    if (raw === null) return [...DEFAULT_SCHEMA];
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((s) => typeof s === 'string' && s.length > 0)
    ) {
      return parsed;
    }
    return [...DEFAULT_SCHEMA];
  } catch {
    return [...DEFAULT_SCHEMA];
  }
}

export function saveSchema(segments) {
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    !segments.every((s) => typeof s === 'string' && s.length > 0)
  ) {
    throw new Error('segments must be a non-empty array of non-empty strings');
  }
  localStorage.setItem(SCHEMA_KEY, JSON.stringify(segments));
}

// ---------------------------------------------------------------------------
// Delimiter
// ---------------------------------------------------------------------------

export function getDelimiter() {
  const val = localStorage.getItem(DELIMITER_KEY);
  if (val !== null && val.length > 0) return val;
  return DEFAULT_DELIMITER;
}

export function saveDelimiter(char) {
  if (typeof char !== 'string' || char.length === 0) {
    throw new Error('Разделитель должен быть непустой строкой');
  }
  localStorage.setItem(DELIMITER_KEY, char);
}

// ---------------------------------------------------------------------------
// Cabinet Index
// ---------------------------------------------------------------------------

export function getCabinetIndex() {
  try {
    const val = localStorage.getItem(CABINET_KEY);
    if (val === null) return DEFAULT_CABINET_INDEX;
    const num = parseInt(val, 10);
    return Number.isFinite(num) && num >= 0 ? num : DEFAULT_CABINET_INDEX;
  } catch {
    return DEFAULT_CABINET_INDEX;
  }
}

export function saveCabinetIndex(index) {
  localStorage.setItem(CABINET_KEY, String(index));
}

// ---------------------------------------------------------------------------
// Device Types
// ---------------------------------------------------------------------------

export function getDeviceTypes() {
  try {
    const raw = localStorage.getItem(TYPES_KEY);
    if (raw === null) return DEFAULT_DEVICE_TYPES.map((t) => ({ ...t }));
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((t) => ({
        name: t.name || '',
        rank: t.rank ?? 1,
        width: t.width ?? 40,
        height: t.height ?? 12,
        role: t.role || 'endpoint',
      }));
    }
    return DEFAULT_DEVICE_TYPES.map((t) => ({ ...t }));
  } catch {
    return DEFAULT_DEVICE_TYPES.map((t) => ({ ...t }));
  }
}

export function saveDeviceTypes(types) {
  if (!Array.isArray(types) || types.length === 0) {
    throw new Error('Список типов не может быть пустым');
  }
  localStorage.setItem(TYPES_KEY, JSON.stringify(types));
}

/**
 * Возвращает массив имён типов (строки) для использования в <select>.
 */
export function getDeviceTypeNames() {
  return getDeviceTypes().map((t) => t.name);
}

/**
 * Возвращает дефолты (rank, width, height) для указанного типа.
 */
export function getTypeDefaults(typeName) {
  const types = getDeviceTypes();
  const found = types.find((t) => t.name === typeName);
  if (found) return { rank: found.rank, width: found.width, height: found.height };
  return { rank: 1, width: 40, height: 12 };
}

// ---------------------------------------------------------------------------
// Auto-link role helpers
// ---------------------------------------------------------------------------

export function getEndpointTypeNames() {
  return getDeviceTypes().filter((t) => t.role === 'endpoint').map((t) => t.name);
}

export function getSwitchTypeName() {
  const sw = getDeviceTypes().find((t) => t.role === 'switch');
  return sw ? sw.name : 'коммутатор';
}

export function getRouterTypeName() {
  const r = getDeviceTypes().find((t) => t.role === 'router');
  return r ? r.name : 'маршрутизатор';
}
