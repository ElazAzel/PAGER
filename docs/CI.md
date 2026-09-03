# Проверки в GitHub

`.github/workflows/verify.yml` запускает проверку типов, lint, тесты и production build на push и pull request. Используются зафиксированные ревизии [actions/checkout](https://github.com/actions/checkout) и [pnpm/setup](https://github.com/pnpm/setup), Node.js 24.19.0 и версия pnpm из `package.json`.

Установка выполняется с `--frozen-lockfile`. В workflow нет ключей внешних сервисов и включения настоящих платежей. Он проверяет сборку и локальные контрактные/интеграционные тесты, включая исполнение SQL в PGlite. Проверки живого Supabase, Stripe Sandbox и Cal.com требуют отдельного стенда.

Файл workflow подготовлен локально. Успешный запуск GitHub Actions можно подтвердить только после подключения удалённого репозитория и выполнения workflow.
