# Бесплатный хостинг через Replit (Россия, без VPN)

**Replit** — самый простой бесплатный вариант для вашего проекта:
- Работает в России **без VPN**
- **Постоянный URL** (не меняется при каждом запуске)
- Сайт + API + PostgreSQL в одном месте
- Проект **уже настроен** под Replit (файлы `.replit`, `artifact.toml`)

---

## Вариант A — проект на Replit уже есть

### 1. Откройте проект

https://replit.com → войдите → откройте **Lite-Structure-Parser** (или как он у вас называется)

### 2. Обновите парсер (если меняли код локально)

Скопируйте файл с вашего ПК в Replit:

**Откуда (ваш ПК):**
```
c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser\artifacts\api-server\src\lib\litematic-parser.ts
```

**Куда (в Replit):**
```
artifacts/api-server/src/lib/litematic-parser.ts
```

Можно перетащить файл в окно Replit или вставить содержимое вручную.

### 3. Пересоберите API

В **Shell** (консоль) Replit:

```bash
pnpm --filter @workspace/api-server run build
```

### 4. Опубликуйте

Нажмите **Deploy** / **Publish** (кнопка вверху справа) → **Republish**.

### 5. Скопируйте URL

После публикации Replit покажет ссылку вида:

```
https://ваш-проект.ваш-логин.repl.co
```
или
```
https://ваш-проект.replit.app
```

**Эта ссылка постоянная** — не меняется при перезапуске.

---

## Вариант B — создать проект заново

### 1. Зарегистрируйтесь

https://replit.com — регистрация бесплатная (Google / GitHub / email)

### 2. Создайте архив проекта

На вашем ПК запустите:

```powershell
cd c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser
.\deploy\pack-for-replit.ps1
```

Появится файл **`litematic-hub-replit.zip`** в папке `deploy\`.

### 3. Импортируйте в Replit

1. Replit → **Create Repl**
2. **Import** → загрузите `litematic-hub-replit.zip`
3. Или: **Create Repl** → **Import from GitHub** (если зальёте на GitHub)

### 4. Подключите базу данных

1. В Replit слева: **Tools** → **Database** (PostgreSQL)
2. Создайте базу — Replit сам добавит `DATABASE_URL` в Secrets

### 5. Запустите и опубликуйте

1. Нажмите **Run**
2. Дождитесь сборки
3. **Deploy** → **Publish**

---

## API для вашего сервера

Подставьте **ваш** URL Replit:

```
GET https://ВАШ-URL.replit.app/api/info/{key}
GET https://ВАШ-URL.replit.app/api/part/{key}/{number}
```

Пример:
```
https://litematic-hub.user.replit.app/api/part/550e8400-e29b-41d4-a716-446655440000/1
```

---

## Как пользоваться

1. Откройте URL Replit в браузере
2. Загрузите `.litematic`
3. Скопируйте **key** (UUID) со страницы файла
4. Укажите URL + key на Minecraft-сервере / в своём коде

---

## Лимиты бесплатного Replit

| | |
|---|---|
| Цена | 0 ₽ |
| VPN | Не нужен |
| URL | Постоянный |
| ПК дома | Можно выключить |
| Лимиты | Есть (трафик, время работы) — для личного/серверного использования обычно хватает |

---

## После изменения парсера

```bash
# 1. Заменить litematic-parser.ts в Replit
# 2. В Shell:
pnpm --filter @workspace/api-server run build
# 3. Deploy → Republish
# 4. Перезагрузить .litematic (старые key в базе не пересчитываются)
```

---

## Сравнение с Docker + Cloudflare

| | Replit | Docker + Cloudflare |
|---|--------|---------------------|
| Бесплатно | Да | Да |
| VPN | Не нужен | Лучше выключить |
| URL постоянный | **Да** | Нет (меняется) |
| ПК должен работать | **Нет** | Да |
| Стабильность в РФ | **Хорошая** | Нестабильная |

**Вывод:** для бесплатного хостинга в России используйте **Replit**.
