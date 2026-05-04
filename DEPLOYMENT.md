# Разворачивание GoalGraph (Google OAuth + PostgreSQL)

Этот документ описывает, какие креды нужны, где их получить и куда прописать.

## 1) Что нужно заранее

- Доступ к PostgreSQL (локально или managed)
- Домен/URL приложения (для production)
- Google account для создания OAuth Client

## 2) Настройка Google OAuth

1. Откройте [Google Cloud Console](https://console.cloud.google.com/).
2. Создайте новый проект (или выберите существующий).
3. Перейдите в `APIs & Services` -> `OAuth consent screen`:
  - Тип: `External` (или `Internal` для Workspace)
  - Заполните `App name`, `User support email`, `Developer contact information`
  - Добавьте scope: `email`, `profile`, `openid`
  - Для test-режима добавьте тестовых пользователей
4. Перейдите в `APIs & Services` -> `Credentials` -> `Create credentials` -> `OAuth client ID`.
5. Тип приложения: `Web application`.
6. Добавьте `Authorized redirect URIs`:
  - Локально: `http://localhost:3000/api/auth/callback/google`
  - Прод: `https://<your-domain>/api/auth/callback/google`
7. Сохраните `Client ID` и `Client Secret`.

## 3) Переменные окружения

Создайте `.env` на основе `.env.example` и заполните:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?schema=public"

GOOGLE_CLIENT_ID="из Google Cloud Console"
GOOGLE_CLIENT_SECRET="из Google Cloud Console"

# Любая длинная случайная строка
NEXTAUTH_SECRET="openssl rand -base64 32"
```

Рекомендуемые дополнительные переменные для production:

```env
NEXTAUTH_URL="https://<your-domain>"
NODE_ENV="production"
```

Опционально (инфраструктурная защита поверх приложения):

```env
BASIC_AUTH_USER="admin"
BASIC_AUTH_PASSWORD="strong-password"
```

## 4) Подготовка базы

Для production:

```bash
npm install
npm run prisma:generate
npm run prisma:deploy
```

Для локальной разработки (если не используете миграции deploy):

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
```

## 5) Инициализация данных

Dev/demo-данные:

```bash
npm run prisma:seed
```

Важно: в production обычно `seed` не запускают автоматически.

## 6) Запуск приложения

Локально:

```bash
npm run dev
```

Production:

```bash
npm run build
npm run start
```

## 7) Проверка после запуска

- Откройте приложение и нажмите `Войти через Google`
- Убедитесь, что после входа создается/открывается доска
- Проверьте публичный read-only шаринг (`/share/<token>`)
- Health-check: `GET /api/health`

## 8) Типичные ошибки

- `redirect_uri_mismatch`:
  - URI в Google Console не совпадает с фактическим callback
- `Unauthorized` после логина:
  - не заполнены `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`NEXTAUTH_SECRET`
- Ошибки Prisma:
  - не применены миграции (`npm run prisma:deploy`)