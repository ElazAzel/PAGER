# PAGER UX/UI remediation design

Дата: 2026-09-04

## Решение

Закрыть аудит одним сквозным изменением, сохранив текущую PAGER visual system: warm paper, ink, terracotta signal, serif display type, restrained UI copy, mobile-first public page. Работа не добавляет новые интеграции и не подменяет Supabase, Stripe или Cal.com симуляциями. Она делает существующие demo/pilot/real состояния честными и завершает критические локальные пользовательские пути.

## Пользовательский результат

Для посетителя и покупателя:

1. Пользователь видит ровно тот режим оплаты и сумму, которую подтверждает.
2. Платная запись не заканчивается ложным success до checkout; бесплатная/pilot запись явно сообщает, почему checkout нет.
3. Физический товар собирает адрес доставки до создания заказа.
4. Купленный digital item имеет безопасное действие открытия материала; expired order имеет terminal state.
5. Ошибки и demo controls зависят от server-owned capabilities и локализованы.

Для автора:

1. Publish рядом с readiness показывает, что именно блокирует запуск.
2. Статус публикации един со страницей и revision.
3. Stripe setup и catalog setup имеют понятные next steps.
4. Ошибка dashboard не превращается в ложный onboarding.

Для всех:

1. Public/catalog dialogs управляют фокусом, Escape, restore и объявлениями.
2. Loading/error/status states доступны screen reader.
3. RU/EN labels, landmarks, tab/segmented semantics и touch targets последовательны.
4. CSS tokens не меняют смысл цветов через cascade.

## Границы и контракты

### Booking result

`POST /api/bookings` уже возвращает `{ booking, orderId?, paymentError?, bookingUrl?, demo? }`. Этот контракт становится типизированным и проходит через `BookingPicker` → `BookingModal` → `PublicPageScreen`. `orderId` ведёт в `/checkout/:id`; `bookingUrl` остаётся внешним provider redirect; `paymentError` не скрывается и не выдаёт оплату за завершённую.

### Access offers

Locked block передаёт mode из выбранной кнопки: `onBuyBlock(block, mode)`. Если доступны обе цены, UI показывает две явно подписанные опции; если доступна одна, показывает одну. Display amount и checkout mode берутся из одной пары.

### Physical checkout

Shipping form собирает `name`, `line1`, `city`, `postalCode`, `country`. Список стран берётся из `item.shipping`; checkout создаётся только после валидного выбора. Адрес передаётся только в checkout request и не попадает в публичную projection.

### Capability-aware demo

Public projection уже содержит `capabilities`. Demo buyer CTA отображается только когда `capabilities.demo === true`. Loopback guard остаётся закрытым для внешнего real mode; для локального браузерного proxy допускается только same-origin loopback request с безопасной проверкой Origin/Host.

## Files and ownership

- `src/app/api/bookings/route.ts`, `src/app/ui/booking-picker.tsx`, `src/app/ui/public-page.tsx`, `src/app/ui/block-renderer.tsx`: commerce result, offers, shipping, auth/error UI.
- `src/app/ui/buyer-pages.tsx`: checkout/library terminal and delivery states, locale, landmarks.
- `src/app/ui/pager-shell.tsx`, `src/app/ui/page-editor.tsx`, `src/app/ui/page-readiness.tsx`: creator publish/readiness/status/catalog/integration UX.
- `src/lib/server/demo.ts`: safe local demo request acceptance.
- `src/app/ui/public-conversion.module.css`, `src/app/globals.css`, `src/app/ui/page-readiness.module.css`: responsive and accessible visual fixes; preserve warm paper direction.
- `src/lib/i18n.ts`, `src/app/layout.tsx`, `src/app/ui/pager-icon.tsx`: copy, document language, and icon registry.
- `tests/integrations-checkout.test.ts`, `tests/pilot-booking.test.ts`, `tests/readiness.test.ts`, plus focused new tests: regression coverage.

## Non-goals

- No real Stripe, Cal.com, email, Supabase or shipping provider call is introduced.
- No route migration to locale-prefixed URLs; current `/slug` routing remains.
- No removal of any of the 25 block types.
- No broad CSS rewrite or visual redesign outside the audited surfaces.

## Verification

Each behavior change gets a failing test first, then the smallest implementation. Final checks are `pnpm test`, `pnpm lint`, source/typecheck, `pnpm build`, `git diff --check`, plus a fresh browser pass at 320/390/768/1024/1440 where the local runtime permits. A red external/infrastructure gate remains explicitly reported.
