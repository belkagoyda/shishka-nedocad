/**
 * Name_Parser — клиентский модуль разбора имён нод по настраиваемому разделителю.
 *
 * Схема по умолчанию: ['здание', 'этаж', 'кабинет', 'устройство']
 * Разделитель по умолчанию: '-'
 */

import { DEFAULT_SCHEMA, DEFAULT_DELIMITER } from './settings.js';

/**
 * Разбирает строку имени ноды по указанному разделителю согласно переданной схеме.
 *
 * @param {string} name — имя ноды
 * @param {string[]} [schema=DEFAULT_SCHEMA] — массив меток сегментов
 * @param {string} [delimiter=DEFAULT_DELIMITER] — символ-разделитель
 * @returns {Object} — объект {label: value}; при пустой строке возвращает {}
 */
export function parseName(name, schema = DEFAULT_SCHEMA, delimiter = DEFAULT_DELIMITER) {
  if (typeof name !== 'string' || name === '') {
    return {};
  }

  const segments = name.split(delimiter);
  const result = {};

  for (let i = 0; i < segments.length; i++) {
    const label = schema[i];
    if (label !== undefined) {
      result[label] = segments[i];
    }
  }

  if (segments.length > schema.length) {
    result._extra = segments.slice(schema.length);
  }

  return result;
}

/**
 * Восстанавливает строку имени из объекта, возвращённого parseName.
 *
 * @param {Object} parsed — результат parseName
 * @param {string} [delimiter=DEFAULT_DELIMITER] — символ-разделитель
 * @returns {string}
 */
export function reconstructName(parsed, delimiter = DEFAULT_DELIMITER) {
  if (!parsed || typeof parsed !== 'object') {
    return '';
  }

  const { _extra, ...labeled } = parsed;
  const values = Object.values(labeled);
  const extra = Array.isArray(_extra) ? _extra : [];

  return [...values, ...extra].join(delimiter);
}
