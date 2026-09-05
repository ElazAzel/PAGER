# Проверки в GitHub

`.github/workflows/verify.yml` запускает проверку типов, lint, тесты, production build, Chromium desktop/mobile и API/discovery smoke на push, pull request и workflow_dispatch. Следующая job собирает и запускает Docker-образ с локальным демо. Используются зафиксированные ревизии [actions/checkout](https://github.com/actions/checkout) и [pnpm/setup](https://github.com/pnpm/setup), Node.js 24.19.0 и версия pnpm из `package.json`.

Установка выполняется с `--frozen-lockfile`. Jobs `quality` и `container` работают без provider secrets и проверяют локальные контракты, включая SQL в PGlite. Jobs обязательны перед deploy. Отдельная job `deploy` получает app-scoped Fly token только из environment `production`, запускается исключительно для `main` и только при repository variable `FLY_DEPLOY_ENABLED=true`.

Полная настройка приложения, environment, токена, secrets и проверок: [FLY-DEPLOYMENT.md](FLY-DEPLOYMENT.md). После деплоя выполняется real HTTPS smoke. Проверки живого Supabase Auth/SMTP, Stripe и Cal.com требуют отдельной приёмки.

Файл workflow подготовлен локально. Успешный запуск GitHub Actions можно подтвердить только после подключения удалённого репозитория и выполнения workflow.
