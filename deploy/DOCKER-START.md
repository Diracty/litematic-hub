# Litematic Hub — запуск через Docker

Пошаговая инструкция для Windows. После настройки другой сервер сможет скачивать части по API.

---

## Шаг 1. Скачать Docker Desktop

**Официальный сайт:**  
https://www.docker.com/products/docker-desktop/

**Прямая ссылка (Windows):**  
https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe

---

## Шаг 2. Установить Docker

1. Запустите скачанный **Docker Desktop Installer.exe**
2. Оставьте галочку **Use WSL 2** (рекомендуется)
3. Дождитесь окончания установки
4. **Перезагрузите компьютер**, если программа попросит
5. Запустите **Docker Desktop** из меню Пуск
6. Дождитесь, пока внизу слева появится **Docker Desktop is running** (зелёный/Running)

> Если Docker просит включить WSL 2 — согласитесь. Без запущенного Docker Desktop скрипты не работают.

---

## Шаг 3. Подготовить проект (один раз)

Откройте **PowerShell** или **Терминал в Cursor** и выполните:

```powershell
cd c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser
copy deploy\.env.example deploy\.env
```

Файл `deploy\.env` можно не менять — настройки по умолчанию подходят.

---

## Шаг 4. Запуск с публичной ссылкой (для другого сервера)

**Двойной клик** по файлу:

```
c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser\deploy\host-public.bat
```

Или в терминале:

```powershell
cd c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser
.\deploy\host-public.bat
```

### Что произойдёт

1. При первом запуске Docker **скачает и соберёт** образ (~5–15 минут)
2. Скачается **cloudflared** (~20 МБ) — бесплатный туннель
3. В окне появится строка вида:

```
https://random-words-here.trycloudflare.com
```

**Это ваша публичная ссылка.** Её указываете на другом сервере.

### API для другого сервера

```
GET https://ВАША-ССЫЛКА.trycloudflare.com/api/info/{key}
GET https://ВАША-ССЫЛКА.trycloudflare.com/api/part/{key}/{number}
```

Пример: если ссылка `https://abc-def.trycloudflare.com`, а key файла `550e8400-...`, то:

```
https://abc-def.trycloudflare.com/api/info/550e8400-...
https://abc-def.trycloudflare.com/api/part/550e8400-.../1
```

---

## Шаг 5. Загрузить .litematic

1. Откройте публичную ссылку в браузере
2. Загрузите файл `.litematic`
3. Скопируйте **key** (UUID) со страницы файла
4. Передайте этот key + публичный URL на свой сервер

---

## Важно

| Правило | Почему |
|---------|--------|
| **Не закрывайте окно** с `host-public.bat | Пока окно открыто — сайт доступен из интернета |
| **Не выключайте Docker Desktop** | Контейнеры остановятся |
| **ПК должен быть включён** | Сервис крутится у вас дома |
| **URL меняется** после перезапуска | Это нормально для бесплатного туннеля |

---

## Только локально (без интернета)

Если нужен сайт только у себя на ПК:

```powershell
cd c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser
copy deploy\.env.example deploy\.env
docker compose -f deploy/docker-compose.yml up --build -d
```

Откройте: **http://localhost:8080**

Остановить:

```powershell
docker compose -f deploy/docker-compose.yml down
```

---

## После обновления парсера

Пересобрать и перезапустить:

```powershell
cd c:\ProjectsCursor\Lite-Structure-Parser\Lite-Structure-Parser
docker compose -f deploy/docker-compose.yml up --build -d
```

Затем снова запустите `host-public.bat` для новой публичной ссылки.

**Старые загрузки в базе не пересчитываются** — загрузите `.litematic` заново.

---

## Если что-то не работает

### «Docker not found»
→ Установите Docker Desktop и убедитесь, что он **запущен** (иконка в трее).

### Долго висит на первом запуске
→ Первую сборку ждите 5–15 минут — Docker качает PostgreSQL и собирает проект.

### Ошибка порта 8080 занят
→ В `deploy\.env` измените:
```
APP_PORT=8081
```
Перезапустите `host-public.bat`.

### Посмотреть логи
```powershell
docker compose -f deploy/docker-compose.yml logs app
docker compose -f deploy/docker-compose.yml logs db
```

### Полный сброс (удалит загруженные файлы в базе)
```powershell
docker compose -f deploy/docker-compose.yml down -v
```

---

## Краткая шпаргалка

```
1. Скачать Docker Desktop → установить → перезагрузка
2. Запустить Docker Desktop (дождаться Running)
3. Двойной клик: deploy\host-public.bat
4. Скопировать https://....trycloudflare.com
5. Загрузить .litematic → взять key → отдать на сервер
```
