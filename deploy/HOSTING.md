# Самостоятельный хостинг Litematic Hub

Replit не нужен. Есть два способа запуска.

## Бесплатно в интернет (без открытия порта на роутере)

Как в проекте `quick-host`: **Cloudflare Tunnel** — бесплатная ссылка вида `https://xxxx.trycloudflare.com`.

### Вариант A — без Docker (рекомендуется, если Docker не хотите)

**Скачать:**
1. **[Node.js 22](https://nodejs.org/)** — бесплатно
2. **База [Neon](https://neon.tech)** — бесплатный PostgreSQL в облаке (регистрация, без карты)
3. **cloudflared** — скачается сам при первом запуске

**Настройка (один раз):**
1. На neon.tech создайте проект → скопируйте Connection string
2. В `deploy/.env` добавьте строку:
   ```
   DATABASE_URL=postgres://...
   ```

**Запуск:**

```powershell
.\deploy\host-public-no-docker.bat
```

Двойной клик по `host-public-no-docker.bat` — получите публичный URL для API.

---

### Вариант B — с Docker

**Скачать:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```powershell
.\deploy\host-public.bat
```

---

### Что указать на другом сервере

```
https://xxxx.trycloudflare.com/api/info/{key}
https://xxxx.trycloudflare.com/api/part/{key}/{number}
```

**Окно не закрывайте** — пока оно открыто, ссылка работает. URL меняется после перезапуска (бесплатный режим).

Если приложение уже запущено:

```powershell
.\deploy\host-public.ps1 -TunnelOnly
# или
.\deploy\host-public-no-docker.ps1 -TunnelOnly
```

---

## Способ 1: Docker (только локально)

Нужны только [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```powershell
cd Lite-Structure-Parser
copy deploy\.env.example deploy\.env
docker compose -f deploy/docker-compose.yml up --build -d
```

Сайт: **http://localhost:8080**

Остановить:

```powershell
docker compose -f deploy/docker-compose.yml down
```

Данные PostgreSQL сохраняются в Docker volume `postgres_data`.

### Сменить порт

В `deploy/.env`:

```
APP_PORT=3000
```

Перезапуск: `docker compose -f deploy/docker-compose.yml up --build -d`

---

## Способ 2: Локально на Windows (без Docker-образа приложения)

Docker нужен только для PostgreSQL. Сборка и запуск — через Node.js на вашей машине.

```powershell
cd Lite-Structure-Parser
.\deploy\start-local.ps1
```

Скрипт сам:
1. Поднимет PostgreSQL в Docker
2. Соберёт фронтенд и API
3. Применит схему БД
4. Запустит сервер на http://localhost:8080

---

## Доступ из интернета

На домашнем ПК откройте порт в роутере (проброс на ваш IP:8080) или используйте туннель:

- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [ngrok](https://ngrok.com/) — `ngrok http 8080`

На VPS (Linux) достаточно способа 1 + reverse proxy (nginx/Caddy) с HTTPS.

---

## Переменные окружения

| Переменная | Описание |
|---|---|
| `PORT` | Порт API (и всего сайта при self-host) |
| `DATABASE_URL` | Строка подключения PostgreSQL |
| `STATIC_DIR` | Папка со сборкой фронтенда (включить UI в одном процессе) |
| `BASE_PATH` | Базовый путь фронтенда при сборке (`/` для self-host) |

---

## После обновления парсера

```powershell
# Docker
docker compose -f deploy/docker-compose.yml up --build -d

# Локально
pnpm --filter @workspace/api-server run build
# перезапустить start-local.ps1 или node artifacts/api-server/dist/index.mjs
```

Старые загруженные файлы в БД **не пересчитываются** — нужно загрузить `.litematic` заново.

---

## API (без изменений)

- `GET /api/info/:key` — имя и число частей
- `GET /api/part/:key/:number` — JSON части (поле `data`)

Клиент должен читать массив из **`data`**, а не обрезать весь HTTP-ответ.
