# PAGER

Персональная страница для консультанта: запись, продажи материалов и товаров, история клиентов.

**В разработке.** Реализованы серверная основа, мобильный creator workspace в направлении Page Studio, публичная страница, Checkout, buyer library и локальные демонстрационные сценарии. Реальные провайдеры и внешний HTTPS-стенд требуют отдельной настройки; наличие локального API и проходящих тестов не означает готовность live-платежей.

## Локальный запуск

Требуются Node.js 24.19.0 и pnpm 11.19.0. Версии пакетов зафиксированы в `pnpm-lock.yaml`.

```powershell
pnpm install --frozen-lockfile
$env:PAGER_DEMO = 'true'
$env:PAGER_APP_URL = 'http://127.0.0.1:3000'
pnpm dev
```

Пока доступны серверные маршруты, например `GET /api/session`. Демо привязано к loopback и хранит данные отдельно в `.data/pager-demo`. Оно не выполняет настоящие платежи, бронирования или отправку писем. Вход в демонстрационные аккаунты выполняется только через явно обозначенный `/api/demo/session`.

Для настоящих интеграций используйте `.env.example`, [настройку Supabase](supabase/README.md) и `docs/INTEGRATIONS.md`. CLI Supabase закреплён в зависимостях; `pnpm db:generate <имя>` создаёт миграцию, `pnpm db:migrate --dry-run` проверяет её для подключённого проекта. Реальный режим не переключается в демо при отсутствии ключей. Ключи храните в локальном окружении или настройках стенда, не в Git.

## Проверки

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` включает проверку SQL/RLS в PostgreSQL WASM (PGlite). Это не заменяет проверку Supabase Auth, Storage и PostgREST. На текущем компьютере Docker не запускается из-за отсутствия WSL; проверка локального Supabase остаётся отдельным шагом.

HTTP-сценарий `pnpm test:api` запускается против **свежего изолированного демо**. В первом терминале:

```powershell
$env:PAGER_DEMO = 'true'
$env:PAGER_APP_URL = 'http://127.0.0.1:3015'
$env:PAGER_DATA_DIR = Join-Path (Get-Location) ('.data/api-smoke-' + [guid]::NewGuid())
pnpm dev --port 3015
```

Во втором:

```powershell
$env:PAGER_SMOKE_URL = 'http://127.0.0.1:3015'
pnpm test:api
```

Сценарий меняет только данные выбранного локального демо. Для повторного полного прогона остановите сервер и запустите его с новой папкой данных. Он не предназначен для рабочего аккаунта или публичного стенда.

## Документы

- `docs/SPEC.md` — принятые требования и мобильное уточнение.
- `docs/CONTRACTS.md` — типы, маршруты и границы модулей.
- `docs/IMPLEMENTATION.md` — выполненное и оставшаяся работа.
- `docs/ACCEPTANCE.md` — сценарии приёмки полного продукта.
- `docs/VERIFICATION.md` — фактически выполненные проверки и открытые ограничения.
- `docs/METRICS.md` — определения конверсий и North Star.
- `docs/sources-report.md` — установленные навыки, версии, лицензии и обновление.
- `docs/SOURCE-DECISIONS.md` — решение по присланным источникам и runtime-интеграциям.
- `docs/CI.md` — подготовленный workflow GitHub Actions.

Supabase, Stripe Connect, Cal.com, Resend и Inngest требуют отдельной настройки и проверки на HTTPS-стенде. Внешние подключения не подтверждены демонстрационными данными.
