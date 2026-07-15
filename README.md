# Network Topology Manager

Веб-приложение для управления сетевой топологией: создание моделей оборудования, узлов (нод) и связей между ними с визуализацией в SVG.

## Быстрый старт

### Требования

- **PHP 8.1+** с расширением `pdo_sqlite`

### Запуск

```bash
# Linux / macOS (установит зависимости автоматически, если не найдены)
chmod +x start.sh
./start.sh          # порт 8000 по умолчанию
./start.sh 3000     # или указать свой порт
```

```bat
REM Windows
start.bat           REM порт 8000
start.bat 3000      REM или свой порт
```

Приложение откроется по адресу `http://localhost:8000/models.html`.

## Архитектура

```
┌────────────────────────────────┐
│   Браузер (HTML + JS ES-модули)│
│   models / nodes / connections │
│   topology / settings          │
└──────────────┬─────────────────┘
               │  fetch() → JSON
┌──────────────▼─────────────────┐
│   PHP встроенный сервер        │
│   api/index.php — маршрутизатор│
│   api/handlers/ — обработчики  │
└──────────────┬─────────────────┘
               │  PDO
┌──────────────▼─────────────────┐
│   SQLite (db/db.sqlite)        │
│   WAL-режим, FK-ограничения    │
└────────────────────────────────┘
```

### Структура файлов

```
├── api/
│   ├── index.php                   # Маршрутизатор (роутер) REST API
│   └── handlers/
│       ├── BaseHandler.php         # Базовый класс обработчиков
│       ├── ModelHandler.php        # CRUD для моделей оборудования
│       ├── NodeHandler.php         # CRUD для узлов (нод)
│       ├── ConnectionHandler.php   # CRUD для связей
│       └── AutoLinkHandler.php     # Автоматическое создание связей
├── db/
│   └── init.php                    # Инициализация БД и создание таблиц
├── js/
│   ├── models.js                   # UI модуля моделей
│   ├── nodes.js                    # UI модуля нод
│   ├── connections.js              # UI модуля связей
│   ├── topology_view.js            # SVG-визуализация топологии
│   ├── settings.js                 # Управление parse-схемой
│   └── name_parser.js              # Парсер имён нод по разделителю «-»
├── css/
│   └── style.css                   # Общие стили
├── models.html                     # Страница моделей
├── nodes.html                      # Страница нод
├── connections.html                # Страница связей
├── topology.html                   # Страница визуализации
├── settings.html                   # Настройки parse-схемы
├── start.sh                        # Скрипт запуска (Linux/macOS)
├── start.bat                       # Скрипт запуска (Windows)
└── README.md
```

## База данных

SQLite-база создаётся автоматически при первом запросе (`db/init.php`).
Используется WAL-режим для параллельных чтений и принудительные foreign key constraints.

### Таблицы

#### `model` — модели оборудования

| Поле   | Тип     | Описание                                                |
|--------|---------|---------------------------------------------------------|
| id     | INTEGER | PRIMARY KEY, автоинкремент                              |
| name   | TEXT    | Уникальное название                                    |
| type   | TEXT    | `router`, `switch_dist`, `switch_access`, `pc`, `printer` |
| rank   | INTEGER | Ранг 0–10 (определяет позицию в топологии)             |
| width  | INTEGER | Ширина ноды в SVG (по умолчанию 40)                    |
| height | INTEGER | Высота ноды в SVG (по умолчанию 12)                    |

#### `node` — узлы сети

| Поле     | Тип     | Описание                                       |
|----------|---------|-------------------------------------------------|
| id       | INTEGER | PRIMARY KEY                                     |
| name     | TEXT    | Уникальное имя в формате `building-floor-cabinet-device` |
| type     | TEXT    | Тип оборудования (аналогично model)              |
| model_id | INTEGER | FK → model.id (ON DELETE SET NULL)              |
| ip       | TEXT    | IP-адрес                                        |
| mac      | TEXT    | MAC-адрес                                       |

#### `connection` — связи между узлами

| Поле         | Тип     | Описание                            |
|--------------|---------|-------------------------------------|
| id           | INTEGER | PRIMARY KEY                         |
| src_node_id  | INTEGER | FK → node.id (ON DELETE CASCADE)    |
| dst_node_id  | INTEGER | FK → node.id (ON DELETE CASCADE)    |
| src_port_id  | TEXT    | Идентификатор порта источника       |
| dst_port_id  | TEXT    | Идентификатор порта назначения      |
| type_line    | TEXT    | `normal`, `thin`, `thick`, `dashed` |
| colour_line  | TEXT    | Цвет линии в формате `#RRGGBB`     |

## REST API

Базовый URL: `/api/`

### Модели `/api/models`

| Метод  | URL               | Описание             |
|--------|-------------------|----------------------|
| GET    | /api/models       | Список всех моделей  |
| GET    | /api/models/:id   | Одна модель по ID    |
| POST   | /api/models       | Создать модель       |
| PUT    | /api/models/:id   | Обновить модель      |
| DELETE | /api/models/:id   | Удалить модель       |

### Ноды `/api/nodes`

| Метод  | URL             | Описание           |
|--------|-----------------|---------------------|
| GET    | /api/nodes      | Список всех нод     |
| GET    | /api/nodes/:id  | Одна нода по ID     |
| POST   | /api/nodes      | Создать ноду        |
| PUT    | /api/nodes/:id  | Обновить ноду       |
| DELETE | /api/nodes/:id  | Удалить ноду        |

### Связи `/api/connections`

| Метод  | URL                    | Описание          |
|--------|------------------------|--------------------|
| GET    | /api/connections       | Список связей      |
| GET    | /api/connections/:id   | Одна связь по ID   |
| POST   | /api/connections       | Создать связь      |
| PUT    | /api/connections/:id   | Обновить связь     |
| DELETE | /api/connections/:id   | Удалить связь      |

### Автосвязи `/api/auto-link`

| Метод | URL            | Описание                       |
|-------|----------------|--------------------------------|
| POST  | /api/auto-link | Автоматическое создание связей |

Тело запроса:

```json
{
  "schema": ["building", "floor", "cabinet", "device"]
}
```

Ответ:

```json
{
  "nodes_created": 1,
  "connections_created": 3,
  "errors": []
}
```

## Функциональность

### Parse-схема имён

Имена нод строятся по формату `сегмент1-сегмент2-сегмент3-сегмент4` (разделитель `«-»`).
По умолчанию схема: `building`, `floor`, `cabinet`, `device`.

Пример: `B1-2-301-PC01` → `building:B1 floor:2 cabinet:301 device:PC01`

Схему можно настроить на странице **Настройки** (`settings.html`). Изменения сохраняются в `localStorage`.

### Алгоритм автосвязей

1. Для каждого `pc` / `printer` ищет `switch_access` с тем же `cabinet`-сегментом. Если не найден — создаёт новый узел `SW-<cabinet>`.
2. Каждый `switch_access` без связи к `switch_dist` подключается к любому существующему `switch_dist`.
3. Каждый `switch_dist` без связи к `router` подключается к любому существующему `router`.
4. Операция идемпотентна — повторный запуск не создаёт дублирующих связей.

### Визуализация топологии

- SVG-холст 1920×1080 с `viewBox` для масштабирования.
- Узлы группируются по рангу (колонки) и сортируются по `cabinet`-сегменту.
- Связи рисуются L-образными ломаными (`<polyline>`).
- Опциональная группировка по кабинетам с пунктирными рамками.
- Экспорт в PDF через `window.print()` с CSS `@media print` (A4 landscape).

## Примеры запросов

```bash
# Создать модель
curl -X POST http://localhost:8000/api/models \
  -H 'Content-Type: application/json' \
  -d '{"name":"Cisco 2960","type":"switch_access","rank":5}'

# Создать ноду
curl -X POST http://localhost:8000/api/nodes \
  -H 'Content-Type: application/json' \
  -d '{"name":"B1-2-301-PC01","type":"pc","ip":"192.168.1.10"}'

# Создать связь
curl -X POST http://localhost:8000/api/connections \
  -H 'Content-Type: application/json' \
  -d '{"src_node_id":1,"dst_node_id":2,"type_line":"normal","colour_line":"#0066cc"}'

# Запустить автосвязи
curl -X POST http://localhost:8000/api/auto-link \
  -H 'Content-Type: application/json' \
  -d '{"schema":["building","floor","cabinet","device"]}'
```
