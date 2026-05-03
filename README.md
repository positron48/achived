# GoalGraph

Личное веб-приложение для визуального планирования целей в виде графа зависимостей.

## Технологии

- Next.js (App Router) + TypeScript
- React Flow (`@xyflow/react`)
- Prisma + PostgreSQL
- Zod (валидация API)
- Docker / docker-compose
- Vitest (юнит-тесты API и доменной логики)

## Основные фичи

- Граф целей: узлы + связи зависимостей
- CRUD для целей
- CRUD для связей
- Сохранение позиций нод после перетаскивания
- Computed state (`AVAILABLE`, `LOCKED`, `ACTIVE`, `DONE`, `BLOCKED`, `DROPPED`)
- Sidebar "что делать сейчас" (`Active`, `Available next`, `Blocked`, `Recently done`)
- `GET /api/next` для ближайших задач
- Goal drawer с редактированием (`title`, `description`, `type`, `status`, `priority`)
- Защита от циклов при создании зависимостей
- Опциональный Basic Auth (через `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD`)
- Seed-данные тестового графа

## Локальная разработка

### Вариант 1 (рекомендуется): через Make + Docker

```bash
make up
```

После запуска в терминале будет показан URL вида `http://localhost:<port>`.

Остановить:

```bash
make down
```

Заполнить тестовыми данными:

```bash
make seed
```

### Вариант 2: вручную

1. Поднять PostgreSQL локально.
2. Создать `.env` на основе `.env.example`.
3. Выполнить:

```bash
npm install
npx prisma db push
npm run prisma:generate
npm run dev
```

## Полезные команды

```bash
npm run test:run
npm run lint
npm run build
```
