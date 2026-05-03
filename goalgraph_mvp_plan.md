# GoalGraph — MVP за 1 день

Личное веб-приложение для визуального планирования глобальных целей в виде графа зависимостей.

## Идея

Пользователь строит граф целей:

```txt
prerequisite goal → unlocked goal
```

Пример:

```txt
Обновить CV → Податься на вакансии → Получить оффер → Переезд
```

Приложение показывает:

- глобальные цели;
- промежуточные этапы;
- конкретные задачи;
- зависимости между ними;
- что уже выполнено;
- что заблокировано;
- что можно делать прямо сейчас.

---

# 1. Границы MVP

## Входит в MVP

```txt
- граф целей
- создание / редактирование / удаление целей
- связи между целями
- статусы
- приоритеты
- позиции нод на canvas
- вычисление ближайших доступных целей
- деплой в k3s
```

## Не входит в MVP

```txt
- пользователи
- команды
- auth через OAuth
- мобильное приложение
- история изменений
- notifications
- recurrence
- импорт/экспорт
- markdown-редактор
- AI
```

---

# 2. Стек

## Application

- Next.js App Router
- TypeScript
- React Flow / `@xyflow/react`
- Tailwind CSS
- shadcn/ui
- Zod

## Backend

- Next.js API Routes / Route Handlers
- Prisma
- PostgreSQL

## Deploy

- Docker
- k3s
- Kubernetes Deployment
- Kubernetes Service
- Kubernetes Ingress
- Kubernetes Secret
- NetworkPolicy

---

# 3. Архитектура

```txt
Browser
  ↓ HTTP
Next.js app
  ├─ UI
  ├─ API routes
  ├─ server-side Prisma client
  ↓
PostgreSQL
```

Важно:

```txt
Frontend не ходит в БД напрямую.
DATABASE_URL доступен только server-side.
```

Один Docker image содержит и UI, и backend API.

---

# 4. Bootstrap проекта

```bash
npx create-next-app@latest goalgraph \
  --ts \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd goalgraph

npm install @xyflow/react prisma @prisma/client zod
npm install class-variance-authority clsx tailwind-merge lucide-react

npx prisma init
```

## Структура

```txt
src/
  app/
    api/
    page.tsx
  components/
  lib/
  server/
prisma/
  schema.prisma
  seed.ts
```

---

# 5. Модель данных

## Основные сущности

```txt
Goal
  id
  title
  description
  status
  priority
  type
  x
  y
  createdAt
  updatedAt

GoalEdge
  id
  sourceId
  targetId
  type
  createdAt
```

## Смысл связи

```txt
sourceId → targetId
```

означает:

```txt
source must be completed before target becomes available
```

Пример:

```txt
Собрать документы → Податься на визу
```

---

# 6. Prisma schema

```prisma
model Goal {
  id          String     @id @default(cuid())
  title       String
  description String     @default("")
  status      GoalStatus @default(TODO)
  priority    Int        @default(3)
  type        GoalType   @default(TASK)

  x           Float      @default(0)
  y           Float      @default(0)

  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  outgoingEdges GoalEdge[] @relation("SourceGoal")
  incomingEdges GoalEdge[] @relation("TargetGoal")
}

model GoalEdge {
  id        String   @id @default(cuid())

  sourceId  String
  targetId  String

  source    Goal     @relation("SourceGoal", fields: [sourceId], references: [id], onDelete: Cascade)
  target    Goal     @relation("TargetGoal", fields: [targetId], references: [id], onDelete: Cascade)

  type      EdgeType @default(REQUIRES)

  createdAt DateTime @default(now())

  @@unique([sourceId, targetId, type])
}

enum GoalStatus {
  TODO
  ACTIVE
  DONE
  BLOCKED
  DROPPED
}

enum GoalType {
  EPIC
  MILESTONE
  TASK
  HABIT
}

enum EdgeType {
  REQUIRES
  RELATED
}
```

---

# 7. Миграции

Для локальной разработки:

```bash
npx prisma migrate dev --name init
```

Для production:

```bash
npx prisma migrate deploy
```

---

# 8. Seed-данные

Минимальный тестовый граф:

```txt
Обустроить жизнь в Испании
  ← Найти работу
  ← Подготовить документы
  ← Разобраться с налогами
```

Практический пример:

```txt
Обновить CV → Податься на вакансии → Получить оффер
Собрать документы → Податься на визу
Получить оффер → Податься на визу
Податься на визу → Переезд
Разобраться с налогами → Финансовый план
Финансовый план → Переезд
```

---

# 9. Server-side Prisma client

```ts
// src/server/db.ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
```

---

# 10. Validation

```ts
// src/server/validation.ts
import { z } from "zod"

export const createGoalSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(5000).optional(),
  type: z.enum(["EPIC", "MILESTONE", "TASK", "HABIT"]).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
})

export const updateGoalSchema = createGoalSchema.partial().extend({
  status: z.enum(["TODO", "ACTIVE", "DONE", "BLOCKED", "DROPPED"]).optional(),
})

export const createEdgeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  type: z.enum(["REQUIRES", "RELATED"]).optional(),
})
```

---

# 11. API

## Endpoints

```txt
GET    /api/graph
POST   /api/goals
PATCH  /api/goals/:id
DELETE /api/goals/:id

POST   /api/edges
DELETE /api/edges/:id

GET    /api/next
```

---

## 11.1 GET /api/graph

Возвращает весь граф.

Response:

```json
{
  "goals": [],
  "edges": []
}
```

---

## 11.2 POST /api/goals

Создать цель.

Payload:

```json
{
  "title": "Подготовить CV",
  "type": "TASK",
  "priority": 1,
  "x": 100,
  "y": 200
}
```

---

## 11.3 PATCH /api/goals/:id

Обновить цель.

Payload:

```json
{
  "title": "Обновить CV",
  "status": "ACTIVE",
  "priority": 1,
  "x": 250,
  "y": 400
}
```

---

## 11.4 DELETE /api/goals/:id

Удаляет цель и связанные edges.

---

## 11.5 POST /api/edges

Создать зависимость.

Payload:

```json
{
  "sourceId": "goal_a",
  "targetId": "goal_b",
  "type": "REQUIRES"
}
```

Смысл:

```txt
goal_a must be done before goal_b becomes available
```

---

## 11.6 DELETE /api/edges/:id

Удалить связь.

---

## 11.7 GET /api/next

Возвращает ближайшие доступные цели.

Response:

```json
[
  {
    "id": "abc",
    "title": "Обновить CV",
    "priority": 1,
    "status": "TODO",
    "computedState": "AVAILABLE",
    "blockedBy": []
  }
]
```

---

# 12. API safety rules

На API уровне запретить:

```txt
- self-edge: A → A
- duplicate edge
- edge на несуществующую ноду
- title пустой
- priority вне диапазона 1..5
- неизвестные status/type/edge type
```

Желательно также запретить циклы:

```txt
если добавление A → B создаёт путь B → ... → A, вернуть 400
```

---

# 13. Domain logic

## Computed state

Цель может иметь вычисляемое состояние:

```txt
DONE
DROPPED
BLOCKED
LOCKED
ACTIVE
AVAILABLE
```

## Правила

Цель доступна, если:

```txt
- она не DONE
- она не DROPPED
- она не BLOCKED
- все prerequisite-ноды DONE
```

## Псевдокод

```ts
type GoalStatus = "TODO" | "ACTIVE" | "DONE" | "BLOCKED" | "DROPPED"

function getGoalComputedState(goal, goals, edges) {
  if (goal.status === "DONE") return "DONE"
  if (goal.status === "DROPPED") return "DROPPED"
  if (goal.status === "BLOCKED") return "BLOCKED"

  const blockers = edges
    .filter(e => e.type === "REQUIRES" && e.targetId === goal.id)
    .map(e => goals.find(g => g.id === e.sourceId))
    .filter(Boolean)
    .filter(g => g.status !== "DONE")

  if (blockers.length > 0) return "LOCKED"

  if (goal.status === "ACTIVE") return "ACTIVE"

  return "AVAILABLE"
}
```

## Сортировка ближайших задач

```txt
ACTIVE first
AVAILABLE second
priority ASC
updatedAt DESC
```

---

# 14. Frontend layout

Один основной экран:

```txt
┌────────────────────────────────────────────┐
│ Topbar: Search | Add Goal | Save Layout    │
├───────────────┬────────────────────────────┤
│ Sidebar       │ Graph Canvas               │
│               │                            │
│ Next goals    │  [Goal] → [Goal] → [Goal]  │
│ Active        │                            │
│ Blocked       │                            │
│ Done          │                            │
├───────────────┴────────────────────────────┤
│ Right drawer: selected goal editor          │
└────────────────────────────────────────────┘
```

## Компоненты

```txt
AppShell
  Topbar
  LeftSidebar
  GoalGraph
  GoalDrawer
```

## Файлы

```txt
src/app/page.tsx
src/components/GoalGraphClient.tsx
src/components/GoalNode.tsx
src/components/GoalDrawer.tsx
src/components/LeftSidebar.tsx
```

---

# 15. React Flow mapping

## DB Goal → React Flow Node

```ts
{
  id: goal.id,
  position: { x: goal.x, y: goal.y },
  data: {
    title: goal.title,
    status: goal.status,
    priority: goal.priority,
    computedState,
  },
  type: "goalNode"
}
```

## DB Edge → React Flow Edge

```ts
{
  id: edge.id,
  source: edge.sourceId,
  target: edge.targetId,
  type: "smoothstep"
}
```

---

# 16. React Flow events

```txt
onNodeDragStop → PATCH /api/goals/:id { x, y }
onConnect      → POST /api/edges
onNodeClick    → open drawer
onEdgeClick    → select edge / delete
```

---

# 17. Custom Goal Node

Нода должна показывать:

```txt
- title
- type badge
- priority
- status
- computed state
```

## Визуальные состояния

```txt
AVAILABLE — яркая рамка
LOCKED    — приглушенная
ACTIVE    — акцентная
DONE      — зачеркнутая / completed
DROPPED   — faded
BLOCKED   — locked/manual
```

---

# 18. Goal Drawer

Поля:

```txt
title
description
type
status
priority
```

Кнопки:

```txt
Save
Mark done
Mark active
Drop
Delete
```

Информационный блок:

```txt
Blocked by:
- X
- Y

Unlocks:
- Z
- W
```

---

# 19. Sidebar “что делать сейчас”

Блоки:

```txt
Active
Available next
Blocked
Recently done
```

Для каждой цели:

```txt
title
priority
type
quick status change
```

Клик по цели:

```txt
- выделить ноду
- открыть drawer
- центрировать graph viewport, если успеешь
```

---

# 20. Security

## Application level

```txt
- Zod validation на входящих payload
- Prisma только server-side
- DATABASE_URL только в server env
- не использовать NEXT_PUBLIC_DATABASE_URL
- max length для title/description
- обработка ошибок Prisma
```

## Kubernetes level

```txt
- DATABASE_URL только в Secret
- Postgres только ClusterIP
- NetworkPolicy: app → postgres
- нет публичного доступа к Postgres
```

## Auth для личного сервиса

Для MVP достаточно одного из вариантов:

```txt
- Basic Auth на Ingress
- VPN-only доступ
- private network only
- Authelia / oauth2-proxy позже
```

---

# 21. Docker

## next.config.ts

```ts
const nextConfig = {
  output: "standalone",
}

export default nextConfig
```

## Dockerfile

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "server.js"]
```

---

# 22. k3s manifests

Минимальный набор:

```txt
namespace.yaml
secret.yaml
deployment.yaml
service.yaml
ingress.yaml
networkpolicy.yaml
```

---

## 22.1 Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: goalgraph-secret
type: Opaque
stringData:
  database-url: postgresql://goalgraph:password@postgres:5432/goalgraph
```

---

## 22.2 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: goalgraph
spec:
  replicas: 1
  selector:
    matchLabels:
      app: goalgraph
  template:
    metadata:
      labels:
        app: goalgraph
    spec:
      containers:
        - name: goalgraph
          image: registry.example.com/goalgraph:latest
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: goalgraph-secret
                  key: database-url
```

---

## 22.3 Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: goalgraph
spec:
  selector:
    app: goalgraph
  ports:
    - port: 80
      targetPort: 3000
```

---

## 22.4 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: goalgraph
spec:
  rules:
    - host: goals.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: goalgraph
                port:
                  number: 80
```

---

## 22.5 NetworkPolicy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-only-from-goalgraph
spec:
  podSelector:
    matchLabels:
      app: postgres
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: goalgraph
      ports:
        - protocol: TCP
          port: 5432
```

---

# 23. Production checklist

Статус на 2026-05-03:

```txt
[x] приложение стартует локально
[~] миграция применяется (сейчас: prisma db push, не prisma migrate)
[x] seed создаёт тестовый граф
[x] можно создать goal
[x] можно соединить goals
[x] можно удалить edge
[x] можно поменять статус
[x] available goals считаются корректно
[x] позиции нод сохраняются
[ ] Docker image билдится
[x] контейнер стартует с DATABASE_URL
[ ] k3s deployment healthy
[ ] Postgres не торчит наружу
[ ] Ingress защищён хотя бы basic auth / VPN / private network
```

---

# 24. Приоритет выполнения в течение дня

## Блок 1 — критично

```txt
БД + API + React Flow + CRUD goals + CRUD edges
```

Статус: [x] реализовано.

Без этого продукта нет.

## Блок 2 — важно

```txt
computed state + sidebar next goals + drawer edit
```

Статус: [x] реализовано.

Это делает продукт полезным.

## Блок 3 — желательно

```txt
custom node design + cycle detection + basic auth + seed
```

Статус: [x] реализовано (custom node design + cycle detection + app-level basic auth + seed).

Это делает продукт приятным и безопасным.

## Блок 4 — потом

```txt
история изменений
экспорт
импорт
шорткаты
горячие клавиши
темы
поиск
группы
теги
```

---

# 25. Порядок реализации

Самый короткий путь:

```txt
1. [x] Prisma schema
2. [x] /api/graph
3. [x] React Flow render
4. [x] create goal
5. [x] drag save position
6. [x] create edge
7. [x] edit status
8. [x] computed available/locked
9. [x] sidebar next actions
10. [~] Docker + k3s (сейчас только docker-compose для dev)
```

---

# 26. Технический принцип

Не делать отдельную иерархию.

В MVP всё является графом:

```txt
Task → Milestone → Epic
```

Большая цель отличается только типом:

```txt
type = EPIC
```

Промежуточный этап:

```txt
type = MILESTONE
```

Конкретное действие:

```txt
type = TASK
```

Так не возникает конфликта:

```txt
дерево != граф
```

А приложение остаётся простым.

---

# 27. Что считать готовым MVP

MVP готов, если можно:

```txt
1. создать глобальную цель;
2. создать несколько подцелей;
3. связать их зависимостями;
4. отметить часть выполненной;
5. увидеть, что стало доступно дальше;
6. открыть это через Ingress в k3s;
7. не иметь прямого доступа к БД снаружи.
```