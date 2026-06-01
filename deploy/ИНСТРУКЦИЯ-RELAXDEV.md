# Полная инструкция: Litematic Hub бесплатно 24/7 (RelaxDev)

**Что выбрать:** [RelaxDev](https://relaxdev.ru) (сайт + API, Россия, без VPN) + [Supabase](https://supabase.com) (бесплатная PostgreSQL **без лимита 30 дней** как у Replit).

**Проект на ПК:**  
`c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser`

**Не используйте** папку `litematic-hub-v2` как сайт — там был урезанный UI. В монорепо уже **старый интерфейс** и **новый парсер**.

---

## Часть 0. Что получится

- Постоянная ссылка вида `https://ваш-проект.relaxdev.ru` (точный домен покажет RelaxDev).
- Старый сайт: загрузка `.litematic`, список файлов, API.
- ПК может быть выключен.
- Пользователи из России открывают сайт **без VPN**.

---

## Часть 1. Подготовка на компьютере (один раз)

### 1.1. Установить Git (если нет)

https://git-scm.com/download/win — установить с настройками по умолчанию.

### 1.2. Установить GitHub Desktop (проще, чем командная строка)

https://desktop.github.com/

### 1.3. Аккаунт GitHub

1. https://github.com/signup — регистрация (email).
2. Войти в GitHub Desktop под этим аккаунтом.

### 1.4. Залить проект на GitHub

1. GitHub.com → **New repository**.
2. Имя, например: `litematic-hub`.
3. **Private** или Public — на ваш выбор.
4. **Не** ставьте галочки README / .gitignore (репозиторий пустой).
5. Create repository.

В **GitHub Desktop**:

1. File → Add local repository.
2. Папка: `c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser`
3. Если спросит «create repository» — Create repository.
4. Summary → напишите commit message: `initial`.
5. **Publish repository** → выберите созданный репозиторий на GitHub.

Дождитесь загрузки (может занять несколько минут — проект большой).

---

## Часть 2. База данных Supabase (бесплатно, без срока Replit)

### 2.1. Регистрация

1. https://supabase.com → Start your project.
2. Войти через GitHub (удобнее всего).
3. **New project**:
   - Organization: ваша.
   - Name: `litematic`.
   - Database password: **придумайте и сохраните** (например в блокнот).
   - Region: **Frankfurt** или ближайший к РФ (если есть).
4. Create new project — подождите 1–2 минуты.

Если Supabase **не пускает** с российского IP — см. **План Б** в конце (Conhos или VPS).

### 2.2. Строка подключения DATABASE_URL

1. В проекте Supabase: **Project Settings** (шестерёнка) → **Database**.
2. Раздел **Connection string** → вкладка **URI**.
3. Скопируйте строку вида:
   ```
   postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
4. Вставьте **ваш пароль** вместо `[YOUR-PASSWORD]`.
5. Для Node часто нужен режим **Transaction** pooler (порт **6543**) — как в примере Supabase.

Сохраните итоговую строку — это `DATABASE_URL`.

### 2.3. Создать таблицы (один раз)

1. Supabase → **SQL Editor** → New query.
2. Откройте на ПК файл:  
   `c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser\deploy\init.sql`
3. Скопируйте **весь** текст → вставьте в SQL Editor → **Run**.
4. Должно быть Success (таблицы `litematic_files`, `litematic_parts`).

---

## Часть 3. Деплой на RelaxDev

### 3.1. Регистрация

1. https://relaxdev.ru
2. Войти (GitHub — рекомендуется).
3. Бесплатный tier для пет-проектов (на сайте указано «бесплатный старт»).

### 3.2. Новый проект из GitHub

1. Панель RelaxDev → **Создать проект** / **Deploy** / **Import from GitHub** (формулировка может отличаться).
2. Разрешить доступ к GitHub → выбрать репозиторий `litematic-hub`.
3. Ветка: `main` (или `master`).

### 3.3. Настройки Docker (важно)

RelaxDev должен собрать **ваш** Dockerfile, не авто-детект Next.js.

| Параметр | Значение |
|----------|----------|
| Тип / Builder | **Docker** / Dockerfile |
| Путь к Dockerfile | `deploy/Dockerfile` |
| Build context (контекст сборки) | `.` (корень репозитория) |
| Порт приложения | `8080` |

Если в панели только «автоопределение стека» — выберите раздел **Docker**: https://relaxdev.ru/deploy/docker

### 3.4. Переменные окружения

В настройках проекта → **Environment variables** / **Secrets**:

| Имя | Значение |
|-----|----------|
| `PORT` | `8080` |
| `DATABASE_URL` | ваша строка из Supabase (часть 2.2) |
| `STATIC_DIR` | `/app/public` |
| `NODE_ENV` | `production` |

Сохранить.

### 3.5. Deploy

1. Нажать **Deploy** / **Запустить**.
2. Ждать сборки 5–15 минут (первая сборка долгая: pnpm + два build).
3. Смотреть **Logs** — в конце должно быть что-то вроде `Server listening` на порту 8080.

### 3.6. Публичный URL

RelaxDev выдаст ссылку на проект. Откройте в браузере:

- Должен открыться **старый** Litematic Hub (загрузка файла, список).
- Проверка API: `https://ВАШ-URL/api/health` или загрузите тестовый `.litematic`.

### 3.7. Если сборка падает

1. Скопировать текст ошибки из логов RelaxDev.
2. Написать в поддержку RelaxDev (на сайте — «помощь при деплое»): приложите лог и укажите Dockerfile `deploy/Dockerfile`, Node 22, pnpm monorepo.
3. Локально проверить Docker на ПК:
   ```powershell
   cd c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser
   copy deploy\.env.example deploy\.env
   # в .env прописать DATABASE_URL от Supabase
   docker compose -f deploy\docker-compose.yml up --build
   ```
   Если локально работает на http://localhost:8080 — проблема в настройках RelaxDev, не в коде.

---

## Часть 4. После обновления парсера на ПК

Когда меняете файлы в `artifacts/api-server/src/lib/`:

1. GitHub Desktop → Commit → **Push**.
2. RelaxDev пересоберёт проект автоматически (или нажмите Redeploy).
3. **Обязательно заново загрузите** каждый `.litematic` на сайте — старые части в БД **не пересчитываются**.

Файлы парсера (если меняли только их):

- `artifacts/api-server/src/lib/litematic-parser.ts`
- `artifacts/api-server/src/lib/nbt/*`
- `artifacts/api-server/src/lib/litematic/*`

---

## Часть 5. API для JustMC / загрузчика

```
GET https://ВАШ-URL.relaxdev.ru/api/info/{key}
GET https://ВАШ-URL.relaxdev.ru/api/part/{key}/{number}
```

`{number}` — с 1.

---

## Часть 6. Проверка попугаев / Variant

1. Загрузить `.litematic` с попугаем.
2. Открыть часть с сущностями → в JSON найти `entity_data`.
3. Должно быть: `"id":"minecraft:parrot"` и `"Variant":0` (или 1–4).

Нет `Variant` в JSON → парсер на сервере старый (не запушен / не пересобран).  
Есть `Variant`, в игре не тот моб → смотреть JustMC (спавн из яйца).

---

## План Б — если Supabase не регистрируется

### Б — Conhos (Node + Postgres в РФ)

https://conhos.ru/docs/HostingNodePostgres.md  

Один конфиг: Node + Postgres. Поддержка в РФ.

### В — Бесплатный VPS + Docker (всё в одном compose)

1. Бесплатный VPS в Москве (например GratisVPS — проверьте лимиты на сайте).
2. Ubuntu, установить Docker.
3. Клонировать репозиторий, в папке `deploy`:
   ```bash
   cp .env.example .env
   nano .env   # задать POSTGRES_PASSWORD
   docker compose up --build -d
   ```
4. Открыть порт 8080 в панели VPS.

Postgres и сайт в одном `docker-compose.yml` — отдельный Supabase не нужен.

---

## Краткий чеклист

- [ ] Проект на GitHub (монорепо `Lite-Structure-Parser`)
- [ ] Supabase: проект, `DATABASE_URL`, выполнен `init.sql`
- [ ] RelaxDev: репозиторий, Dockerfile `deploy/Dockerfile`, env, порт 8080
- [ ] Deploy успешен, сайт открывается
- [ ] Загружен `.litematic`, API отдаёт части
- [ ] После смены парсера — push + **перезаливка** `.litematic`

---

## Почему не Replit / Render

| | Replit Deploy | Render free DB |
|--|---------------|----------------|
| Срок | ~30 дней | БД ~30 дней |
| Плата | потом да | потом да |

RelaxDev + Supabase — бесплатный старт **без этих 30 дней** на деплой (лимиты по ресурсам у платформ всё равно читайте на их сайтах).
