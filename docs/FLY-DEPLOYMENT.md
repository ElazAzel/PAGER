# PAGER: GitHub → Fly.io

Подготовлено 5 сентября 2026. Репозиторий: `https://github.com/ElazAzel/PAGER`.

В репозитории есть Dockerfile, `fly.toml` и workflow `.github/workflows/verify.yml`. После настройки push в `main` запускает проверки, сборку и проверку контейнера, затем деплой через защищённое GitHub environment `production` и проверку HTTPS. Автодеплой включается явной repository variable `FLY_DEPLOY_ENABLED=true`.

## 1. Создать приложение и выбрать регион

Установите [flyctl](https://fly.io/docs/flyctl/install/) и войдите в свой аккаунт:

```powershell
fly auth login
fly apps create ИМЯ_ПРИЛОЖЕНИЯ
```

В `fly.toml` замените `app = "pager-set-your-app-name"` на выбранное имя и добавьте в начало `primary_region = "КОД_РЕГИОНА"`. Выберите доступный регион близко к вашему Supabase. Домен по умолчанию — `https://ИМЯ_ПРИЛОЖЕНИЯ.fly.dev`; custom domain подключается отдельно. Workflow передаёт `--app` из `FLY_APP_NAME`, поэтому проверьте, что оба значения совпадают.

`fly.toml` задаёт HTTPS, 1 shared CPU / 1 GB RAM, минимум одну запущенную машину в основном регионе, корректный SIGTERM и health-check `/api/health`. Первая команда deploy по умолчанию может создать дополнительную HA-машину; число машин и расходы проверьте в Fly Dashboard. Данные хранятся в Supabase; Fly volume приложению не нужен.

## 2. Подготовить Supabase и runtime secrets

Используйте отдельный production-проект Supabase. Примените миграции из `supabase/migrations` по инструкции [supabase/README.md](../supabase/README.md), проверьте forced RLS и приватный bucket `pager-private`. Подключение `DATABASE_URL` должно работать с серверной ролью, требуемой репозиторием. Миграции не запускаются автоматически при деплое: сначала резервная копия/проверка целевой базы, затем миграции, затем приложение.

Настройте Supabase Site URL на ваш HTTPS-origin, шаблоны OTP из `supabase/templates` и рабочий SMTP. Не включайте публичное демо: `PAGER_DEMO=false`.

Создайте локальный `.env.production.local` — он игнорируется Git и Docker — и заполните только реальные значения:

| Переменная | Что указать |
| --- | --- |
| `PAGER_APP_URL` | Канонический HTTPS-origin без пути, например ваш `*.fly.dev` |
| `DATABASE_URL` | Серверное соединение с целевой Supabase/Postgres |
| `NEXT_PUBLIC_SUPABASE_URL` | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key целевого проекта |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key; только runtime secret |
| `PAGER_INTEGRATION_KEY` | Стабильные 32 случайных байта в base64 для шифрования интеграций |
| `PAGER_OPERATOR_NAME` | Настоящее публичное имя оператора |
| `PAGER_SUPPORT_EMAIL` | Рабочий публичный адрес поддержки |
| `PAGER_CREATOR_INVITE_EMAILS` | Проверенные email приглашённых авторов, через запятую |
| `PAGER_ADMIN_USER_IDS` | Точные Supabase user ID администраторов; пусто выключает admin |

Названия `NEXT_PUBLIC_SUPABASE_*` сохранены для совместимости, но код использует их на сервере во время выполнения. Секреты не передаются через Docker build arguments. Не меняйте `PAGER_INTEGRATION_KEY` после подключения авторов без отдельной процедуры перешифрования.

Импортируйте секреты через stdin, без значений в истории команд:

```powershell
Get-Content -LiteralPath .env.production.local | fly secrets import --stage --app ИМЯ_ПРИЛОЖЕНИЯ
fly secrets list --app ИМЯ_ПРИЛОЖЕНИЯ
```

В Bash эквивалент импорта: `fly secrets import --stage --app ИМЯ_ПРИЛОЖЕНИЯ < .env.production.local`. Файл — строки `NAME=value`; значения не отправляйте в чат, issues или логи. `--stage` применит их при следующем deploy.

По умолчанию пилот принимает заявки и бронирования, платежи выключены. Без обязательной конфигурации health отвечает **503**, и новая машина не проходит release gate.

## 3. Настроить GitHub

В репозитории откройте Settings → Environments → создайте `production`. Разрешите deployment только из `main`; при необходимости назначьте required reviewers.

В environment `production` добавьте:

| Тип | Имя | Значение |
| --- | --- | --- |
| Secret | `FLY_API_TOKEN` | App-scoped deploy token только этого Fly-приложения |
| Variable | `FLY_APP_NAME` | Выбранное имя Fly-приложения |
| Variable | `PAGER_REAL_URL` | Тот же HTTPS-origin, что в `PAGER_APP_URL` |

Получить ограниченный токен можно локальной командой:

```powershell
fly tokens create deploy --app ИМЯ_ПРИЛОЖЕНИЯ --expiry 720h
```

Вставьте весь токен непосредственно в GitHub secret; запланируйте его обновление до истечения 30 дней. Обычный пользовательский/организационный токен workflow не нужен.

В Settings → Secrets and variables → Actions → **Variables** добавьте repository variable `FLY_DEPLOY_ENABLED=true`, когда Supabase, secrets и регион готовы. Именно repository variable используется для включения job, поскольку environment variables на этапе выбора job ещё недоступны.

Для `main` настройте правила pull request и обязательные checks `quality` и `container`. Pull request выполняет локальные проверки без доступа к `production` и без деплоя.

## 4. Первый релиз

Сохраните изменения в Git и отправьте ветку, выполните PR в `main`. Пока включение автодеплоя не задано, выполняются только проверки. После включения можно запустить workflow вручную через Actions → Verify PAGER → Run workflow → **main** или отправить следующий проверенный commit в `main`.

Workflow выполняет:

1. Frozen install, typecheck, lint, Vitest, production build.
2. Chromium desktop/mobile, API access/payment/inventory и discovery/admin проверки на отдельном локальном демо.
3. Docker build и boot smoke с проверкой non-root user, отсутствия `.env` в образе, SSR, static assets и health.
4. Fly remote build/deploy, только после двух успешных jobs и разрешения environment.
5. `scripts/smoke-real.mjs` по HTTPS: real/pilot mode, чтение базы, реквизиты, статусы зависимостей и публичные маршруты.

Локально перед отправкой:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:demo-gate
docker build --tag pager:release-check .
node scripts/smoke-container.mjs
git diff --check
```

`test:demo-gate` использует production standalone-сборку; сначала нужен `pnpm build`. Его тестовые данные создаются во временном каталоге и удаляются после прогона. Если порт 3100 занят, задайте `PAGER_GATE_PORT` на другой свободный loopback-порт.

Ручной deploy при необходимости выполняется из той же проверенной ревизии:

```powershell
fly config validate --strict --config fly.toml
fly deploy --remote-only --app ИМЯ_ПРИЛОЖЕНИЯ --strategy rolling --wait-timeout 5m
$env:PAGER_REAL_URL = 'https://ИМЯ_ПРИЛОЖЕНИЯ.fly.dev'
pnpm test:real
```

Локальный Docker для `--remote-only` не требуется, но `container` job в GitHub должен быть зелёным.

## 5. Приёмка и эксплуатация

Проверьте реальную доставку кода на email, создание страницы приглашённым автором, публикацию и заявку с другого аккаунта. Подтвердите доступ к своим данным и отказ в чужих. Реквизиты оператора и тексты `/privacy` и `/terms` должны быть проверены оператором для применимых условий сервиса.

Опциональные провайдеры включаются по [INTEGRATIONS.md](INTEGRATIONS.md):

- Stripe: полный набор `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET`, получатель Connect, повторы webhook, refund/dispute/renewal. После sandbox-проверок включите `PAGER_PILOT_MODE=false`, `PAGER_PAYMENTS_ENABLED=true`; для live-ключей также `PAGER_STRIPE_LIVE=true`. Изменение pilot mode открывает self-serve создание авторов — это отдельное продуктовое решение.
- Cal.com: полный OAuth client pair или проверенный API key автора в кабинете, подписанные webhooks и настоящая тестовая запись/перенос/отмена.
- Email: `PAGER_NOTIFICATIONS_ENABLED=true` только вместе с Inngest/Resend, проверенным отправителем, доставкой и повторами.
- Telegram: включение только с ботом, webhook secret и добровольным pairing получателя.

Включённый, но неполностью настроенный провайдер блокирует readiness. Статус `ready` подтверждает наличие runtime-конфигурации и чтение базы, но не успешную операцию во внешнем провайдере.

```powershell
fly status --app ИМЯ_ПРИЛОЖЕНИЯ
fly checks list --app ИМЯ_ПРИЛОЖЕНИЯ
fly logs --app ИМЯ_ПРИЛОЖЕНИЯ
fly releases --app ИМЯ_ПРИЛОЖЕНИЯ
```

При сбое остановите последующие деплои (`FLY_DEPLOY_ENABLED=false`), проверьте health/logs. Для отката используйте точный сохранённый image reference предыдущего успешного релиза с `fly deploy --image IMAGE_REFERENCE --app ИМЯ_ПРИЛОЖЕНИЯ`, после проверки совместимости схемы. Откат контейнера не откатывает миграции и данные; для базы используйте проверенный backup/recovery план.

## Проверенные источники

- [Fly: Next.js standalone](https://fly.io/docs/js/frameworks/nextjs/)
- [Fly: GitHub Actions](https://fly.io/docs/launch/continuous-deployment-with-github-actions/)
- [Fly: fly.toml и health checks](https://fly.io/docs/reference/configuration/)
- [Fly: runtime secrets](https://fly.io/docs/apps/secrets/)
- [Fly: app-scoped deploy tokens](https://fly.io/docs/flyctl/tokens-create-deploy/)

Ни создание приложения, ни импорт secrets, ни миграции, ни внешняя публикация в рамках локальной подготовки не выполнялись.
