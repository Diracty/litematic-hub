# Хостинг 24/7 из России (без VPN у пользователей)

> **Бесплатно без лимита Replit 30 дней:** см. **[HOSTING-FREE-RU.md](./HOSTING-FREE-RU.md)** (RelaxDev, Conhos, free VPS).

ПК может быть выключен. Нужен только интернет у посетителей сайта.

**Я не могу зарегистрировать хостинг за вас** — нужен ваш аккаунт (email). Ниже варианты **не хуже Replit** по удобству, с доступом к сайту из РФ **без VPN**.

В проекте уже есть: **старый UI** (`litematic-hub`) + **новый парсер** (`api-server/src/lib/nbt`, `litematic`) + **Docker**.

---

## Вариант 1 — Replit (рекомендуется, бесплатный старт)

| | |
|--|--|
| Доступ из России | Обычно **да**, без VPN |
| 24/7 | **Deploy / Publish** — постоянный URL |
| UI | Старый React, как в монорепо |
| База | PostgreSQL в Repl |

**Шаги:**

1. https://replit.com — вход (Google/GitHub/email).
2. Импорт: zip всей папки `Lite-Structure-Parser\Lite-Structure-Parser` (не `litematic-hub-v2`).
3. В Repl: **Database** → PostgreSQL → скопировать `DATABASE_URL` в Secrets.
4. Shell:
   ```bash
   pnpm install
   pnpm --filter @workspace/api-server run build
   pnpm --filter @workspace/litematic-hub run build
   ```
5. **Deploy** → Republish → скопировать `https://….replit.app`.
6. Заново загрузить `.litematic` после смены парсера.

Подробнее: [REPLIT-FREE.md](./REPLIT-FREE.md)

---

## Вариант 2 — Timeweb Cloud (РФ, платный, стабильный 24/7)

| | |
|--|--|
| Доступ из России | **Да** |
| 24/7 | VPS / App Platform |
| Цена | от ~200–300 ₽/мес |

1. https://timeweb.cloud — регистрация.
2. **Облачный сервер** (Ubuntu) или **App Platform** с Docker.
3. На сервере установить Docker, залить проект, в каталоге `deploy`:
   ```bash
   cp .env.example .env
   # отредактировать POSTGRES_PASSWORD
   docker compose up --build -d
   ```
4. Открыть порт **8080** в файрволе панели → сайт `http://IP:8080`.

Постоянный домен — привязать в панели Timeweb.

---

## Вариант 3 — Docker на любом VPS (Selectel, REG.RU, и т.д.)

Тот же `deploy/docker-compose.yml` — сайт + PostgreSQL в одном compose.

```bash
git clone <ваш-репозиторий>
cd Lite-Structure-Parser/deploy
cp .env.example .env
docker compose up --build -d
```

Сайт: `http://<IP-VPS>:8080` — из России обычно доступен, если VPS не заблокирован у провайдера пользователя.

---

## Что НЕ советуем для «просто работает из РФ»

| Сервис | Проблема |
|--------|----------|
| Render / Railway / Fly.io | Часто **не пускают** с российского IP при регистрации |
| Cloudflare Tunnel с ПК | Пока ПК выключен — **сайта нет** (не 24/7) |
| `litematic-hub-v2` отдельно | Урезанный UI — **не использовать**, только парсер уже в монорепо |

---

## После любого деплоя

- API: `GET /api/info/:key`, `GET /api/part/:key/:number`
- Сайт: загрузка `.litematic` через браузер
- Сменили парсер → **перезалить** файлы `.litematic` (старые части в БД не обновятся)

---

## Локально на ПК (уже собранный парсер)

Парсер скопирован в `artifacts/api-server/src/lib/` (папки `nbt/`, `litematic/`, `litematic-parser.ts` — re-export).

Сборка:

```powershell
cd c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser
pnpm install
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/litematic-hub run build
```

Деплой — только **Replit** или **VPS/Docker** выше, не отдельный v2-сайт.
