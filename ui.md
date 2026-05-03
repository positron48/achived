Ниже — подробное ТЗ/дизайн-спецификация для воспроизведения интерфейса **GoalGraph** в тёмной теме: структура, визуальный стиль, цвета, состояния, поведение и функциональные решения.

---

# 1. Общая концепция интерфейса

**GoalGraph** — desktop web-приложение для визуального планирования целей через граф зависимостей.

Главная задача интерфейса: пользователь должен за 5–10 секунд понять:

1. какие цели сейчас в фокусе;
2. что можно делать прямо сейчас;
3. что заблокировано;
4. какая цель выбрана;
5. что её блокирует;
6. что она разблокирует;
7. как цели связаны между собой на графе;
8. какой следующий лучший шаг.

Интерфейс должен выглядеть как зрелый productivity/SaaS-продукт, а не как админка. Основной визуальный язык: **тёмный, спокойный, премиальный, без ярко-синих bootstrap-цветов**.

---

# 2. Общая композиция экрана

Экран делится на 4 основные зоны:

1. **Top bar** — верхняя навигационная панель.
2. **Left Focus Sidebar** — левый сайдбар с быстрым обзором целей.
3. **Graph Canvas** — центральное рабочее поле с графом зависимостей.
4. **Right Goal Inspector** — правая панель деталей выбранной цели.

Размер экрана в макете: примерно **16:9**, desktop, например `1672 × 941`.

Ориентировочные размеры:

```
Ширина экрана: 1672 px
Высота экрана: 941 px

Top bar height: 80 px
Left sidebar width: 300 px
Right inspector width: 340 px
Center canvas width: всё оставшееся пространство
```

Сетка:

```
┌───────────────────────────────────────────────────────────────┐
│                           TOP BAR                             │
├───────────────┬───────────────────────────────┬───────────────┤
│ LEFT SIDEBAR  │         GRAPH CANVAS          │ RIGHT PANEL   │
│               │                               │               │
│               │                               │               │
└───────────────┴───────────────────────────────┴───────────────┘
```

---

# 3. Цветовая система

## 3.1. Основная палитра

Главное требование: **без синего primary**, без bootstrap-схемы.

Использовать тёплую тёмную палитру:

```
--bg-main: #101211;              /* почти чёрный, но тёплый */
--bg-canvas: #121514;            /* центральное поле */
--bg-panel: #171918;             /* сайдбары */
--bg-panel-elevated: #1D201E;    /* карточки и панели */
--bg-card: #20231F;              /* обычные карточки */
--bg-card-muted: #191B1A;        /* неактивные карточки */
--bg-input: #181B1A;             /* поля ввода */
```

Границы:

```
--border-soft: rgba(255, 255, 255, 0.07);
--border-medium: rgba(255, 255, 255, 0.11);
--border-strong: rgba(255, 255, 255, 0.18);
```

Текст:

```
--text-primary: #F2EEE6;         /* основной текст */
--text-secondary: #B8B0A3;       /* вторичный */
--text-muted: #777268;           /* приглушенный */
--text-disabled: #56534D;        /* неактивный */
```

Акценты:

```
--accent-amber: #D39A43;         /* основной тёплый акцент */
--accent-copper: #B96745;        /* кнопка New goal / high priority */
--accent-olive: #8B944C;         /* прогресс, active, available */
--accent-sage: #A1AA7B;          /* done / completed */
--accent-plum: #8A536B;          /* blocked secondary */
--accent-rust: #A94F3D;          /* high priority / alert */
--accent-sand: #D8C8A8;          /* мягкий светлый акцент */
```

Тени:

```
--shadow-soft: 0 8px 24px rgba(0, 0, 0, 0.24);
--shadow-card: 0 12px 36px rgba(0, 0, 0, 0.28);
--shadow-glow-amber: 0 0 0 1px rgba(211,154,67,.7), 0 0 32px rgba(211,154,67,.18);
--shadow-glow-olive: 0 0 0 1px rgba(139,148,76,.55), 0 0 20px rgba(139,148,76,.14);
```

---

# 4. Типографика

Шрифт должен быть современный, нейтральный, хорошо читаемый в интерфейсе.

Подойдут:

```
font-family: Inter, Manrope, "SF Pro Display", system-ui, sans-serif;
```

Для логотипа можно использовать более характерный шрифт, но не декоративный. Например:

```
.logo {
  font-family: "Fraunces", "Cormorant Garamond", serif;
}
```

Размеры:

```
--font-xs: 11px;
--font-sm: 12px;
--font-base: 14px;
--font-md: 15px;
--font-lg: 18px;
--font-xl: 24px;
```

Основные правила:

- заголовки секций — 12 px, uppercase, letter-spacing `0.04em`;
- названия целей в карточках — 14–16 px, `font-weight: 600`;
- метаданные — 11–12 px;
- кнопки — 13–14 px;
- правый инспектор — title 24 px.

---

# 5. Top Bar

## 5.1. Назначение

Верхняя панель нужна для:

- идентификации продукта;
- поиска целей;
- переключения режимов отображения;
- фильтрации;
- добавления цели;
- просмотра агрегированной статистики.

## 5.2. Размеры

```
.topbar {
  height: 80px;
  padding: 0 24px;
  background: #111312;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  display: flex;
  align-items: center;
  gap: 20px;
}
```

## 5.3. Логотип

Слева:

```
[иконка-граф] GoalGraph
```

Иконка — набор точек, соединённых линиями, как маленький граф.

Цвет:

- точки: `#D8C8A8`;
- линии: `rgba(216,200,168,.55)`;
- текст: `#F2EEE6`.

Размер:

```
.logo-icon: 32 × 32 px
.logo-text: 26 px, weight 500
```

Логотип должен выглядеть спокойнее, чем SaaS-логотип с ярким цветом. Он задаёт интеллектуальный/productivity-тон.

---

## 5.4. Search

Поле поиска:

```
Поиск целей, тегов, заметок...
```

Справа внутри поля — shortcut badge:

```
⌘ K
```

Дизайн:

```
.search {
  width: 360px;
  height: 44px;
  background: #181A19;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 12px;
  padding: 0 14px;
}
```

Иконка поиска слева — `#8A857B`.

Текст placeholder — `#777268`.

Shortcut badge:

```
.shortcut {
  height: 24px;
  padding: 0 8px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 7px;
  color: #B8B0A3;
}
```

Функционально поиск должен искать:

- по названию цели;
- тегам;
- описанию;
- заметкам;
- статусам;
- связанным целям.

---

## 5.5. View Switcher

Три режима:

```
Graph | List | Timeline
```

Контейнер:

```
.view-switcher {
  height: 44px;
  background: #171918;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 14px;
  padding: 4px;
  display: flex;
}
```

Активный режим:

```
.view-tab.active {
  background: rgba(216,200,168,.10);
  color: #E6D7B8;
  box-shadow: inset 0 0 0 1px rgba(216,200,168,.12);
}
```

Неактивные:

```
.view-tab {
  color: #B8B0A3;
}
```

Иконки:

- Graph — маленькая иконка узлов;
- List — список;
- Timeline — горизонтальные линии.

---

## 5.6. Status Filter

Кнопка:

```
Все статусы ˅
```

Дизайн:

```
.filter-button {
  height: 44px;
  padding: 0 18px;
  border-radius: 12px;
  background: #171918;
  border: 1px solid rgba(255,255,255,.09);
  color: #D8C8A8;
}
```

Dropdown должен позволять фильтровать:

- Все статусы;
- В фокусе;
- Можно начать;
- Заблокировано;
- Завершено;
- Архив.

---

## 5.7. New Goal Button

Кнопка:

```
+ Новая цель
```

Это главный CTA, но не синий. Использовать медный/терракотовый.

```
.new-goal-button {
  height: 44px;
  padding: 0 22px;
  border-radius: 12px;
  background: linear-gradient(180deg, #B96745 0%, #9E5037 100%);
  color: #FFF6EA;
  border: 1px solid rgba(255,255,255,.12);
  box-shadow: 0 10px 24px rgba(185,103,69,.24);
}
```

Hover:

```
background: linear-gradient(180deg, #C57550 0%, #A95B3E 100%);
```

---

## 5.8. Summary Stats

Справа компактная панель:

```
Всего        В фокусе      Завершено      Заблокировано
24           7             9              3
```

Дизайн:

```
.summary {
  height: 44px;
  display: flex;
  gap: 22px;
  padding: 6px 18px;
  border-radius: 12px;
  background: #171918;
  border: 1px solid rgba(255,255,255,.08);
}
```

Цвета чисел:

```
Всего: #D8C8A8
В фокусе: #D39A43
Завершено: #8B944C
Заблокировано: #B96745
```

---

## 5.9. Avatar

Круглый аватар справа:

```
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.16);
}
```

---

# 6. Left Focus Sidebar

## 6.1. Назначение

Левый сайдбар — это не просто список задач. Это **операционный пульт** пользователя.

Он отвечает на вопрос:

```
Что происходит прямо сейчас?
```

Секции:

1. **В фокусе**
2. **Можно начать**
3. **Заблокировано**
4. **Недавно завершено**

## 6.2. Контейнер

```
.left-sidebar {
  width: 300px;
  height: calc(100vh - 80px);
  background: #171918;
  border-right: 1px solid rgba(255,255,255,.07);
  padding: 24px 16px;
  overflow-y: auto;
}
```

Сайдбар слегка отделён от графа, но не должен быть визуально тяжелее центрального canvas.

---

## 6.3. Заголовок

```
ФОКУС        [иконка фильтров]
.sidebar-title {
  font-size: 12px;
  color: #B8B0A3;
  letter-spacing: .06em;
  text-transform: uppercase;
}
```

Иконка фильтров справа:

- цвет `#B8B0A3`;
- hover `#F2EEE6`.

---

## 6.4. Section Header

Пример:

```
В фокусе    2     ˅
```

Дизайн:

```
.section-header {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 22px;
}
```

Текст:

```
font-size: 15px;
font-weight: 600;
color: #F2EEE6;
```

Badge:

```
.section-count {
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(216,200,168,.12);
  color: #D8C8A8;
  font-size: 12px;
}
```

---

# 7. Карточки в левом сайдбаре

## 7.1. Базовая карточка

```
.sidebar-card {
  min-height: 58px;
  padding: 12px;
  border-radius: 12px;
  background: #20231F;
  border: 1px solid rgba(255,255,255,.08);
  display: grid;
  grid-template-columns: 36px 1fr auto;
  gap: 10px;
  align-items: center;
}
```

Состояние hover:

```
background: #242821;
border-color: rgba(216,200,168,.14);
```

---

## 7.2. Карточка “В фокусе”

Пример:

```
[иконка] Податься на вакансии      35%
        ⚑ Высокий
```

Иконка:

```
.icon-tile {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: rgba(139,148,76,.18);
  color: #C7D083;
}
```

Название:

```
font-size: 13px;
font-weight: 600;
color: #F2EEE6;
```

Приоритет:

```
font-size: 11px;
color: #B8B0A3;
```

Высокий приоритет:

```
.priority-high {
  color: #D47758;
}
```

Прогресс справа — маленький circular progress:

```
.progress-ring {
  width: 42px;
  height: 42px;
}
```

Цвет кольца:

- заполненная часть: `#8B944C`;
- фон кольца: `rgba(255,255,255,.08)`;
- текст внутри: `#F2EEE6`, 11 px.

---

## 7.3. Карточка “Можно начать”

Пример:

```
[иконка] Финансовый план       [Доступно]
        ⚑ Средний
```

Badge `Доступно`:

```
.available-chip {
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(139,148,76,.14);
  color: #B9C27A;
  border: 1px solid rgba(139,148,76,.22);
}
```

Эти карточки должны выглядеть активными, но не такими приоритетными, как “В фокусе”.

---

## 7.4. Карточка “Заблокировано”

Это важное изменение: **недоступные карточки должны выглядеть неактивными**.

Пример:

```
[приглушенная иконка] Податься на визу       [Ждёт документы]
                  ⚑ Высокий
```

Дизайн:

```
.sidebar-card.blocked {
  background: #171918;
  border-color: rgba(255,255,255,.05);
  opacity: 0.62;
}
```

Текст:

```
.sidebar-card.blocked .title {
  color: #8A857B;
}

.sidebar-card.blocked .meta {
  color: #666158;
}
```

Иконка:

```
.sidebar-card.blocked .icon-tile {
  background: rgba(255,255,255,.035);
  color: #777268;
}
```

Badge:

```
.blocked-chip {
  background: rgba(169,79,61,.10);
  color: #9B6A5F;
  border: 1px solid rgba(169,79,61,.16);
}
```

Важно: заблокированная карточка не должна быть нечитаемой. Она должна быть видимой, но визуально вторичной.

Hover для blocked:

```
.sidebar-card.blocked:hover {
  opacity: 0.78;
  border-color: rgba(255,255,255,.09);
}
```

То есть при наведении пользователь может её изучить, но она не выглядит как доступная к действию.

---

## 7.5. Карточка “Недавно завершено”

Пример:

```
✓ Собрать документы        12 мая
✓ Исследовать страны        5 мая
```

Дизайн:

```
.completed-row {
  height: 42px;
  opacity: .72;
}
```

Check icon:

```
color: #A1AA7B;
```

Текст:

```
color: #B8B0A3;
```

Дата:

```
color: #777268;
font-size: 12px;
```

---

## 7.6. Footer сайдбара

Внизу:

```
⌘ 1–9     Быстрый переход к цели
```

Дизайн:

```
.sidebar-shortcut {
  height: 38px;
  border-radius: 10px;
  background: rgba(255,255,255,.035);
  border: 1px solid rgba(255,255,255,.07);
  color: #8A857B;
}
```

---

# 8. Центральный Graph Canvas

## 8.1. Назначение

Центральная зона — главное рабочее пространство.

Она показывает:

- все цели как ноды;
- зависимости между ними;
- статус каждой цели;
- прогресс;
- что доступно;
- что заблокировано;
- какой следующий шаг.

---

## 8.2. Контейнер Canvas

```
.graph-canvas {
  position: relative;
  background: #121514;
  overflow: hidden;
}
```

Фон — тёмная сетка из едва заметных точек.

```
.graph-canvas {
  background-color: #121514;
  background-image:
    radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px);
  background-size: 16px 16px;
}
```

Можно добавить очень тонкий vignette:

```
box-shadow: inset 0 0 120px rgba(0,0,0,.35);
```

---

## 8.3. Suggested Next Step

Плавающая карточка сверху в центре canvas:

```
Suggested next step
Обновить CV          >
```

Дизайн:

```
.suggested-next {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 230px;
  height: 58px;
  border-radius: 12px;
  background: rgba(29,32,30,.88);
  border: 1px solid rgba(255,255,255,.09);
  box-shadow: var(--shadow-soft);
}
```

Label:

```
font-size: 11px;
color: #8A857B;
```

Goal title:

```
font-size: 14px;
font-weight: 600;
color: #F2EEE6;
```

Назначение: подсказывать пользователю лучший следующий шаг на основе доступности и приоритета.

---

# 9. Graph Nodes

## 9.1. Базовая структура ноды

Каждая цель на графе — карточка.

Содержит:

1. иконку;
2. название;
3. приоритет;
4. прогресс;
5. статусный цвет / border;
6. иногда checkmark или disabled-состояние.

Базовый размер:

```
.goal-node {
  width: 260px;
  height: 72px;
  border-radius: 12px;
  background: #20231F;
  border: 1px solid rgba(255,255,255,.09);
  display: grid;
  grid-template-columns: 42px 1fr 48px;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  box-shadow: 0 8px 22px rgba(0,0,0,.22);
}
```

---

## 9.2. Внутренности ноды

```
[icon]  Обновить CV        60%
        ⚑ Высокий
```

Иконка:

```
.node-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

Название:

```
.node-title {
  font-size: 15px;
  font-weight: 600;
  color: #F2EEE6;
}
```

Meta:

```
.node-meta {
  margin-top: 6px;
  font-size: 11px;
  color: #B8B0A3;
  display: flex;
  gap: 6px;
}
```

Прогресс:

```
.node-progress {
  width: 44px;
  height: 44px;
}
```

---

## 9.3. Состояние: selected / active

Выбранная нода — **“Обновить CV”**.

Она должна быть самым заметным элементом на графе.

```
.goal-node.selected {
  background: linear-gradient(180deg, #25261F 0%, #1E211C 100%);
  border-color: rgba(211,154,67,.72);
  box-shadow:
    0 0 0 1px rgba(211,154,67,.45),
    0 0 34px rgba(211,154,67,.18),
    0 14px 36px rgba(0,0,0,.36);
}
```

Иконка:

```
.goal-node.selected .node-icon {
  background: rgba(139,148,76,.22);
  color: #C7D083;
}
```

Прогресс:

```
progress-color: #8B944C;
```

Почему: пользователь всегда должен понимать, какая цель открыта в правой панели.

---

## 9.4. Состояние: in focus / active

Пример:

```
Податься на вакансии
```

Активные карточки, но не выбранные.

```
.goal-node.active {
  border-color: rgba(185,103,69,.42);
  background: #20221F;
}
```

Иконка:

```
background: rgba(185,103,69,.18);
color: #D98763;
```

---

## 9.5. Состояние: available

Примеры:

```
Изучить рынок
Финансовый план
Подготовиться к интервью
```

Available — доступные, но не в фокусе.

```
.goal-node.available {
  border-color: rgba(139,148,76,.24);
}
```

Иконки:

```
background: rgba(139,148,76,.14);
color: #AEB86D;
```

Они должны выглядеть кликабельными и живыми, но менее яркими, чем selected.

---

## 9.6. Состояние: done

Примеры:

```
Исследовать страны
Собрать документы
```

Done-ноды показывают, что шаг завершён.

```
.goal-node.done {
  background: #1D201E;
  border-color: rgba(161,170,123,.18);
}
```

Checkmark справа сверху:

```
.done-check {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: #8B944C;
  color: #101211;
}
```

Важно: done-ноды не должны кричать. Они подтверждают завершение и дают контекст.

---

## 9.7. Состояние: blocked / unavailable

Это критическое состояние.

Недоступные карточки должны выглядеть **неактивными, приглушенными, вторичными**.

Примеры:

```
Податься на визу
Разобраться с налогами
Переезд
```

Дизайн:

```
.goal-node.blocked {
  background: #171918;
  border-color: rgba(255,255,255,.045);
  opacity: 0.55;
  box-shadow: none;
  filter: saturate(0.45);
}
```

Текст:

```
.goal-node.blocked .node-title {
  color: #8A857B;
}

.goal-node.blocked .node-meta {
  color: #5F5B53;
}
```

Иконка:

```
.goal-node.blocked .node-icon {
  background: rgba(255,255,255,.035);
  color: #69655D;
}
```

Прогресс:

```
.goal-node.blocked .node-progress {
  opacity: .5;
}
```

Border:

```
border: 1px solid rgba(255,255,255,.045);
```

Hover:

```
.goal-node.blocked:hover {
  opacity: .72;
  border-color: rgba(255,255,255,.09);
  filter: saturate(.65);
}
```

Курсор:

```
cursor: pointer;
```

Но при клике не нужно сразу предлагать action “Start”. Вместо этого в инспекторе показать:

```
Почему заблокировано?
```

и список зависимостей.

---

# 10. Расположение нод на графе

Нужно воспроизвести структуру примерно так:

```
                         [Suggested next step: Обновить CV]

          [Исследовать страны]               [Собрать документы]
                    │                                  │
                    └──────────┬───────────────────────┘
                               │
      [Обновить CV] ───────> [Податься на вакансии] ───────> [Подготовиться к интервью]
            │                         ▲                              ▲
            │                         │                              │
      [Изучить рынок] ────────────────┘                              │
            │                                                        │
            └──────────────> [Финансовый план] ──────────────────────┘
                                   │
                                   │
      [Податься на визу] ─────> [Разобраться с налогами] ─────> [Переезд]
```

Фактическая визуальная композиция:

- верхний ряд: завершённые подготовительные цели;
- средний ряд: активный карьерный поток;
- нижний ряд: заблокированные релокационные цели;
- selected-нода “Обновить CV” находится слева от центра;
- “Податься на вакансии” — центральная активная нода;
- недоступные ноды снизу визуально приглушены.

---

# 11. Connector Lines

## 11.1. Стиль связей

Линии должны быть тонкие, плавные, не слишком контрастные.

```
.connector {
  stroke: rgba(216, 200, 168, 0.32);
  stroke-width: 1.4;
  fill: none;
}
```

Для активной цепочки:

```
.connector.active {
  stroke: rgba(211,154,67,.58);
}
```

Для связей к blocked-ноду:

```
.connector.blocked {
  stroke: rgba(255,255,255,.16);
  stroke-dasharray: 4 6;
}
```

Для completed dependencies:

```
.connector.done {
  stroke: rgba(139,148,76,.38);
}
```

Стрелки:

```
marker-end: small arrow;
```

Цвет стрелки совпадает с линией.

---

## 11.2. Anchor Points

У каждой ноды есть маленькие точки подключения.

```
.anchor {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #8A857B;
}
```

Для active/selected:

```
background: #D39A43;
```

Для blocked:

```
background: #55524C;
```

---

# 12. Graph Controls

Слева снизу внутри canvas — вертикальная панель:

```
+
−
⛶
🔒
```

Назначение:

- zoom in;
- zoom out;
- fit to screen;
- lock / unlock graph layout.

Дизайн:

```
.graph-controls {
  position: absolute;
  left: 20px;
  bottom: 28px;
  width: 42px;
  border-radius: 14px;
  background: rgba(29,32,30,.88);
  border: 1px solid rgba(255,255,255,.08);
  backdrop-filter: blur(10px);
}
```

Каждая кнопка:

```
.control-button {
  width: 42px;
  height: 42px;
  color: #B8B0A3;
}
```

Hover:

```
background: rgba(255,255,255,.045);
color: #F2EEE6;
```

---

# 13. Mini-map

Справа снизу внутри canvas.

Назначение:

- показать общий граф;
- дать понимание позиции viewport;
- перемещаться по большому графу.

Размер:

```
.minimap {
  width: 210px;
  height: 130px;
  position: absolute;
  right: 28px;
  bottom: 28px;
  border-radius: 12px;
  background: rgba(29,32,30,.82);
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: var(--shadow-soft);
}
```

Внутри:

- маленькие прямоугольники нод;
- тонкие линии связей;
- текущий viewport как рамка.

Цвета нод в minimap:

```
done: #8B944C
active: #B96745
selected: #D39A43
blocked: #5F4A56
default: #6E6A60
```

Viewport:

```
border: 1px solid rgba(216,200,168,.6);
background: rgba(216,200,168,.05);
```

---

# 14. Right Goal Inspector

## 14.1. Назначение

Правая панель показывает подробности выбранной цели.

Она должна отвечать:

- что это за цель;
- в каком она статусе;
- какой прогресс;
- что нужно сделать;
- что её блокирует;
- что она разблокирует;
- какие действия доступны.

---

## 14.2. Контейнер

```
.right-panel {
  width: 340px;
  height: calc(100vh - 80px);
  background: #171918;
  border-left: 1px solid rgba(255,255,255,.07);
  padding: 24px 18px;
  overflow-y: auto;
}
```

Панель должна быть чуть светлее canvas, но темнее активных карточек.

---

## 14.3. Header

```
Обновить CV        ☆       ×
.goal-title {
  font-size: 24px;
  font-weight: 600;
  color: #F2EEE6;
}
```

Star:

```
color: #8A857B;
hover: #D8C8A8;
```

Close:

```
color: #8A857B;
hover: #F2EEE6;
```

---

## 14.4. Type + Status Row

```
[иконка] Подготовка                  ● В работе ˅
```

Type:

```
.goal-type {
  color: #B8B0A3;
  font-size: 13px;
}
```

Status pill:

```
.status-pill {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(255,255,255,.08);
  color: #D8C8A8;
}
```

Dot inside:

```
background: #D39A43;
```

---

## 14.5. Priority + Progress Row

Две карточки в строку:

```
Приоритет    ⚑ Высокий
Прогресс     60%
```

Контейнер:

```
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
```

Meta card:

```
.meta-card {
  height: 42px;
  border-radius: 10px;
  background: #1D201E;
  border: 1px solid rgba(255,255,255,.07);
  padding: 0 12px;
}
```

Priority high:

```
color: #D47758;
```

Progress ring mini:

```
color: #8B944C;
```

---

## 14.6. Description

Текст:

```
Адаптировать резюме под международный рынок:
структура, достижения, навыки, формат.
```

Дизайн:

```
.description {
  margin-top: 18px;
  color: #D8D0C4;
  font-size: 13px;
  line-height: 1.55;
}
```

---

## 14.7. Properties List

Список:

```
Дедлайн       15 мая 2025
Энергия       Средняя
Теги          CV  Карьера  Приоритет
```

Дизайн:

```
.property-row {
  height: 32px;
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
}
```

Иконки:

```
color: #8A857B;
```

Label:

```
color: #B8B0A3;
font-size: 12px;
```

Value:

```
color: #D8C8A8;
font-size: 12px;
```

Tags:

```
.tag {
  height: 22px;
  padding: 0 8px;
  border-radius: 7px;
  background: rgba(255,255,255,.05);
  color: #B8B0A3;
}
```

---

# 15. Dependency Blocks в правой панели

## 15.1. Blocked by

Заголовок:

```
Заблокировано       1 ˅
```

Содержимое:

```
[folder icon] Собрать документы       ✓
```

Дизайн:

```
.dependency-section {
  margin-top: 22px;
}
```

Header:

```
.section-label {
  font-size: 14px;
  font-weight: 600;
  color: #F2EEE6;
}
```

Count badge:

```
background: rgba(255,255,255,.08);
color: #B8B0A3;
```

Item:

```
.dependency-item {
  min-height: 42px;
  border-radius: 10px;
  background: #1D201E;
  border: 1px solid rgba(255,255,255,.07);
  padding: 0 12px;
}
```

Done dependency check:

```
color: #8B944C;
```

---

## 15.2. Unlocks

Заголовок:

```
Разблокирует       2 ˅
```

Содержимое:

```
[briefcase] Податься на вакансии
[people]    Подготовиться к интервью
```

Цель блока: показать ценность выполнения выбранной задачи.

Дизайн тот же, но иконки:

```
color: #B96745;
```

---

## 15.3. Why blocked?

Карточка:

```
Почему заблокировано?

Нужно финализировать резюме для корректного
описания опыта и дат.

[Показать детали]
```

Даже если выбранная цель активная, этот блок можно использовать для объяснения зависимости.

Дизайн:

```
.why-card {
  margin-top: 14px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255,255,255,.035);
  border: 1px solid rgba(255,255,255,.07);
}
```

Заголовок:

```
font-size: 13px;
font-weight: 600;
color: #F2EEE6;
```

Текст:

```
font-size: 12px;
line-height: 1.45;
color: #B8B0A3;
```

Кнопка:

```
.details-button {
  height: 32px;
  border-radius: 999px;
  background: rgba(216,200,168,.08);
  color: #D8C8A8;
}
```

---

# 16. Action Buttons в правой панели

## 16.1. Primary action

```
▶ Начать сейчас
```

Дизайн:

```
.primary-action {
  height: 44px;
  width: 100%;
  border-radius: 10px;
  background: linear-gradient(180deg, #8B944C 0%, #747D3F 100%);
  color: #F8F1DF;
  border: 1px solid rgba(255,255,255,.10);
  box-shadow: 0 12px 24px rgba(139,148,76,.18);
}
```

Эта кнопка появляется, если цель доступна или активна.

Если цель заблокирована, вместо неё:

```
Недоступно: завершите зависимости
```

и кнопка disabled.

---

## 16.2. Mark Complete

```
✓ Отметить завершённой
.secondary-action {
  height: 40px;
  width: 100%;
  border-radius: 10px;
  background: rgba(255,255,255,.055);
  color: #D8C8A8;
  border: 1px solid rgba(255,255,255,.08);
}
```

---

## 16.3. Save + Archive

Нижняя строка:

```
[Сохранить] [Архивировать]
.action-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
```

Кнопки:

```
.ghost-button {
  height: 38px;
  border-radius: 10px;
  background: transparent;
  color: #B8B0A3;
  border: 1px solid rgba(255,255,255,.08);
}
```

Hover:

```
background: rgba(255,255,255,.04);
color: #F2EEE6;
```

---

# 17. Activity / Notes

Внизу правой панели:

```
Активность    Заметки
```

Tabs:

```
.tabs {
  display: flex;
  gap: 18px;
  border-bottom: 1px solid rgba(255,255,255,.07);
}
```

Active tab:

```
color: #F2EEE6;
border-bottom: 2px solid #D39A43;
```

Inactive:

```
color: #8A857B;
```

Activity item:

```
[avatar] Иван добавил в фокус       2 ч назад
.activity-item {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 10px;
  align-items: center;
  padding-top: 12px;
}
```

---

# 18. Disabled / Unavailable design system

Это отдельное системное правило.

## 18.1. Где применяется

- заблокированные ноды в графе;
- заблокированные карточки в левом сайдбаре;
- недоступные действия;
- зависимости, которые ещё нельзя выполнить;
- будущие шаги, которые не открыты.

## 18.2. Визуальные признаки

Недоступный элемент должен иметь:

1. ниже opacity;
2. меньше saturation;
3. меньше контраст;
4. отсутствие glow;
5. приглушенную иконку;
6. серо-тёплый border;
7. статусный chip с низким контрастом.

CSS-пример:

```
.is-unavailable {
  opacity: .55;
  filter: saturate(.45);
  background: #171918;
  border-color: rgba(255,255,255,.045);
  box-shadow: none;
}

.is-unavailable .title {
  color: #8A857B;
}

.is-unavailable .meta,
.is-unavailable .description {
  color: #5F5B53;
}

.is-unavailable .icon {
  background: rgba(255,255,255,.035);
  color: #69655D;
}

.is-unavailable .chip {
  background: rgba(255,255,255,.035);
  color: #6C675F;
  border-color: rgba(255,255,255,.05);
}
```

## 18.3. Hover для unavailable

На hover элемент становится чуть читабельнее, потому что пользователь может открыть детали.

```
.is-unavailable:hover {
  opacity: .72;
  filter: saturate(.6);
  border-color: rgba(255,255,255,.09);
}
```

Но CTA не должен становиться активным, если зависимости не выполнены.

---

# 19. Статусы целей

Рекомендуемые статусы:

```
type GoalStatus =
  | "todo"
  | "available"
  | "in_focus"
  | "active"
  | "blocked"
  | "done"
  | "archived"
  | "dropped";
```

## 19.1. Status mapping

```
todo        — создана, но ещё не доступна или не выбрана
available  — можно начать прямо сейчас
in_focus    — в фокусе пользователя
active      — в работе
blocked     — заблокирована зависимостями
done        — завершена
archived    — скрыта из основного workflow
dropped     — отменена
```

## 19.2. Визуальная система

```
available:
  border olive muted
  chip "Доступно"
  normal opacity

active / in_focus:
  warm amber/copper accents
  progress visible
  strong contrast

blocked:
  muted opacity
  desaturated
  no glow
  chip "Ждёт ..."
  disabled visual state

done:
  sage check
  slightly calm
  not too bright

selected:
  amber border/glow
  always highest visual priority
```

---

# 20. Приоритеты

Приоритеты:

```
Высокий
Средний
Низкий
```

Цвета:

```
priority-high: #D47758;
priority-medium: #D39A43;
priority-low: #8B944C;
```

Отображение:

```
⚑ Высокий
⚑ Средний
⚑ Низкий
```

Флаг маленький, цветной. Не делать большие красные warning-сигналы.

---

# 21. Прогресс

Прогресс показывается в двух местах:

1. на карточках графа;
2. в правой панели.

В карточках графа — circular progress 44 px.

```
60%
35%
20%
10%
0%
```

Для `0%` в blocked-состоянии кольцо должно быть почти невидимым.

Цвета:

```
progress-active: #8B944C;
progress-warning: #B96745;
progress-empty: rgba(255,255,255,.08);
progress-disabled: rgba(255,255,255,.045);
```

---

# 22. Функциональная логика “доступности”

Цель считается доступной, если все её зависимости выполнены.

```
function isAvailable(goal, allGoals) {
  return goal.dependencies.every(depId => {
    const dep = allGoals[depId];
    return dep.status === "done";
  });
}
```

Если цель недоступна:

- она получает статус `blocked`;
- отображается приглушенно;
- попадает в секцию “Заблокировано”;
- в right inspector показывается `Blocked by`;
- основная кнопка действия disabled или заменяется объяснением.

Если цель доступна:

- она попадает в “Можно начать”;
- её можно перевести в фокус;
- она может быть suggested next step.

---

# 23. Suggested Next Step logic

Рекомендованный следующий шаг выбирается по критериям:

1. доступна;
2. не завершена;
3. высокий приоритет;
4. меньше зависимостей впереди;
5. разблокирует больше других целей;
6. пользователь недавно с ней взаимодействовал или добавил в фокус.

Пример:

```
score =
  priorityWeight +
  unlocksCount * 2 -
  estimatedEffort +
  focusBonus;
```

В интерфейсе:

```
Suggested next step
Обновить CV >
```

По клику:

- выделяется нода;
- открывается right inspector;
- центрируется canvas на ноде.

---

# 24. Поведение кликов

## 24.1. Клик по ноде

- выделяет ноду;
- открывает детали справа;
- подсвечивает входящие и исходящие связи;
- остальные связи слегка приглушаются.

## 24.2. Клик по available карточке

- открывает детали;
- показывает CTA “Начать сейчас”.

## 24.3. Клик по blocked карточке

- открывает детали;
- показывает почему заблокировано;
- показывает список зависимостей;
- CTA неактивен.

## 24.4. Клик по done карточке

- открывает детали;
- показывает completed date;
- можно переоткрыть или архивировать.

---

# 25. Graph interaction

Необходимые действия:

- drag canvas;
- zoom колесом;
- zoom кнопками;
- fit to screen;
- drag node;
- create dependency via connector handles;
- click edge to edit/delete dependency;
- minimap navigation;
- keyboard shortcuts.

---

# 26. Keyboard shortcuts

В интерфейсе уже есть hint:

```
⌘ 1–9 Быстрый переход к цели
```

Рекомендуемые shortcuts:

```
⌘ K      — поиск
N        — новая цель
G        — graph view
L        — list view
T        — timeline view
F        — добавить в фокус
Space    — открыть/закрыть inspector
Enter    — начать выбранную цель
Shift+D  — отметить завершённой
Esc      — закрыть drawer / снять выделение
```

---

# 27. Содержимое демо-данных

Для воспроизведения экрана использовать такие цели:

```
[
  {
    "title": "Исследовать страны",
    "status": "done",
    "priority": "Низкий",
    "progress": 100
  },
  {
    "title": "Собрать документы",
    "status": "done",
    "priority": "Средний",
    "progress": 100
  },
  {
    "title": "Обновить CV",
    "status": "active",
    "priority": "Высокий",
    "progress": 60,
    "selected": true
  },
  {
    "title": "Податься на вакансии",
    "status": "in_focus",
    "priority": "Высокий",
    "progress": 35
  },
  {
    "title": "Подготовиться к интервью",
    "status": "available",
    "priority": "Низкий",
    "progress": 0
  },
  {
    "title": "Изучить рынок",
    "status": "available",
    "priority": "Средний",
    "progress": 10
  },
  {
    "title": "Финансовый план",
    "status": "available",
    "priority": "Средний",
    "progress": 20
  },
  {
    "title": "Податься на визу",
    "status": "blocked",
    "priority": "Высокий",
    "progress": 0
  },
  {
    "title": "Разобраться с налогами",
    "status": "blocked",
    "priority": "Средний",
    "progress": 0
  },
  {
    "title": "Переезд",
    "status": "blocked",
    "priority": "Высокий",
    "progress": 0
  }
]
```

Зависимости:

```
[
  ["Исследовать страны", "Обновить CV"],
  ["Собрать документы", "Обновить CV"],
  ["Обновить CV", "Податься на вакансии"],
  ["Податься на вакансии", "Подготовиться к интервью"],
  ["Изучить рынок", "Податься на вакансии"],
  ["Финансовый план", "Податься на вакансии"],
  ["Собрать документы", "Податься на визу"],
  ["Финансовый план", "Разобраться с налогами"],
  ["Податься на визу", "Переезд"],
  ["Разобраться с налогами", "Переезд"]
]
```

---

# 28. Правая панель: данные выбранной цели

Выбранная цель:

```
Обновить CV
```

Данные:

```
{
  "title": "Обновить CV",
  "type": "Подготовка",
  "status": "В работе",
  "priority": "Высокий",
  "progress": 60,
  "description": "Адаптировать резюме под международный рынок: структура, достижения, навыки, формат.",
  "deadline": "15 мая 2025",
  "energy": "Средняя",
  "tags": ["CV", "Карьера", "Приоритет"],
  "blockedBy": ["Собрать документы"],
  "unlocks": ["Податься на вакансии", "Подготовиться к интервью"],
  "activity": [
    {
      "user": "Иван",
      "action": "добавил в фокус",
      "time": "2 ч назад"
    }
  ]
}
```

---

# 29. Почему интерфейс устроен именно так

## 29.1. Левая панель

Левый сайдбар нужен не для полного управления всеми целями, а для быстрых решений:

```
Что делать сейчас?
Что можно начать?
Что мешает?
Что недавно закрыто?
```

Это снижает когнитивную нагрузку.

---

## 29.2. Центральный граф

Граф нужен для стратегического понимания:

```
Как текущие действия связаны с большой целью?
Что откроется после выполнения?
Где bottleneck?
```

---

## 29.3. Правая панель

Правый inspector нужен для тактической работы:

```
Что конкретно делать с выбранной целью?
Какой статус?
Какие зависимости?
Какие действия доступны?
```

---

## 29.4. Приглушенные blocked-карточки

Это важное UX-решение.

Заблокированные цели не должны конкурировать с доступными. Если они выглядят так же ярко, пользователь не понимает, куда нажимать.

Правильная иерархия:

```
1. Selected / active — самое заметное.
2. Available / can start — заметное.
3. Done — спокойное, подтверждающее.
4. Blocked — приглушенное, вторичное.
```

---

# 30. Итоговая визуальная иерархия

На экране пользователь сначала видит:

1. выбранную цель “Обновить CV”;
2. suggested next step;
3. активные/доступные цели;
4. связи между целями;
5. заблокированные цели как приглушенный нижний слой;
6. детали выбранной цели справа.

Именно так интерфейс помогает действовать, а не просто смотреть на красивый граф.