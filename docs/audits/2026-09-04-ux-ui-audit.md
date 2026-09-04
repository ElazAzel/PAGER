# PAGER — UX/UI audit

Дата: 2026-09-04
Статус: **P0/P1 исправлены локально; production/pilot sign-off остаётся условным до внешних gate-проверок**

## Итог аудита (baseline до remediation)

PAGER уже имеет сильную визуальную основу: тёплая editorial/bento-подача, спокойная иерархия, mobile-first reflow, крупные CTA и понятная публичная страница. Однако сейчас нельзя честно обещать путь «первая запись → первая оплата»: два денежных дефекта имеют приоритет P0, а local demo и creator publish-flow имеют P1-блокеры.

Главная UX-проблема — не внешний вид, а разрыв между обещанием интерфейса и конечным состоянием:

- запись может подтвердиться без перехода к оплате;
- платный блок может показать разовую цену, а создать monthly-заказ;
- физический товар нельзя оплатить из UI, потому что нет адреса доставки;
- публикация не связана с readiness-чеклистом;
- в live demo показываются smoke-данные и локальный вход не завершается во встроенном браузере.

До исправления P0 и повторной проверки ключевых путей это не release-ready состояние.

## Объём и метод (baseline до remediation)

Аудит выполнен по текущему checkout read-only, без изменения продуктового кода, с использованием:

- `product-design:audit` и его design/accessibility framework;
- browser-проверки через Codex in-app browser;
- трёх независимых read-only агентских проходов: visitor/buyer, creator/workspace, accessibility/design system;
- `docs/SPEC.md`, `design.md`, `docs/DEMO-SCRIPT.md`, `docs/APPEARANCE.md` и текущего кода.

Live-поверхности: `/`, `/anna`, item detail, login/auth modal, FAQ, platform appearance sheet. Проверены размеры 320×844, 390×844, 1440×900 и desktop viewport. Скриншоты текущего запуска показаны inline в треде; CUA-провайдер не отдаёт локальные пути для сохранения raster-файлов.

Creator inner workspace не был открыт live: `/api/demo/session` отклоняет loopback-запрос из in-app browser. Поэтому визуальная оценка editor canvas ограничена статическим кодом и не заменяет authenticated browser pass.

## Путь пользователя

| Шаг | Результат | Оценка |
|---|---|---|
| Home → local demo | CTA виден и хорошо reflows на 390 px, но вход заканчивается `Same-origin request required` / 403 | P1 blocker для demo |
| Public page `/anna` | Hero, booking CTA, demo notice, blocks, FAQ и sticky action понятны; нет горизонтального overflow на 320/390 | Хорошо с оговорками |
| Catalog на desktop | У первой service-карточки actions сжимаются до узкой колонки, `Подробнее` и `Записаться` становятся вертикальными | P1 |
| Item detail → login | `returnTo` сохраняет исходный item URL; это хороший recovery-паттерн | Хорошо |
| Auth/demo buyer | Demo-кнопка приводит к той же same-origin ошибке, текст остаётся на английском | P1 |
| Booking → payment | API создаёт `orderId`, но `BookingPicker` его не передаёт дальше | P0 |
| Appearance/preferences | Radix bottom sheet с фокусом, radios, motion setting и понятным Done | Хорошо |
| Creator publish/catalog | Статически найдены риски readiness, Stripe и неполного каталога; live подтверждение заблокировано | P1 |

## P0 — исправить до любого коммерческого теста

### 1. Booking подтверждается без обязательного checkout

`POST /api/bookings` создаёт order и возвращает `orderId` (`src/app/api/bookings/route.ts:19-24`), но `BookingPicker` типизирует результат только как `{ booking?: Booking }` и вызывает `onBooked(result.booking)` (`src/app/ui/booking-picker.tsx:7,11`). `PublicPageScreen` ведёт в checkout только если получил `orderId` (`src/app/ui/public-page.tsx:38-40,112`).

**Риск:** клиент видит подтверждённое время, но обязательная оплата услуги не завершается. Это ломает core journey и может создать неподтверждённые коммерческие обязательства.

**Решение:** передавать единый result contract `{ booking, orderId, paymentError, bookingUrl }`; если услуга платная и order создан, переходить в checkout до показа финального success-state. Если payment setup не готов, показывать явный recovery state, а не сообщение «запись подтверждена».

### 2. Цена в UI может не совпасть с режимом списания

Locked block показывает `oneTime`, если он задан, и только иначе monthly (`src/app/ui/block-renderer.tsx:102`). При клике обработчик выбирает monthly при наличии monthly-цены (`src/app/ui/public-page.tsx:102`), а `prepareOrder` считает сумму по переданному mode (`src/lib/integrations/checkout.ts:30-36`).

**Риск:** пользователь видит разовую цену, но получает ежемесячный заказ — критический риск доверия, charge dispute и неправильной аналитики.

**Решение:** передавать выбранный `mode` из того же price option, который отображён; явно показывать оба варианта, если доступны; сервер должен возвращать canonical display price/mode для подтверждения перед оплатой.

## P1 — закрыть следующим слоем

### Conversion, demo и data trust

1. **Local demo не завершается в поддержанном live-пути.** При клике Home/dashboard demo CTA в in-app browser получен 403/`Same-origin request required`; ошибка показывается на английском. Для локального демонстрационного режима это блокирует сценарий из `docs/DEMO-SCRIPT.md`. Нужно либо явно поддержать этот browser path, либо дать согласованный fallback и локализованный error/retry state.

2. **Demo sign-in виден в real mode.** `AuthModal` всегда рендерит demo buyer action (`src/app/ui/public-page.tsx:28-29`), хотя demo endpoint в real mode отклоняет запрос (`src/app/api/demo/session/route.ts:10-12`). Demo controls должны приходить из capability state и отсутствовать вне demo.

3. **Live fixture загрязнён smoke-данными.** Текущий `/anna` показывает `Unpublished API smoke draft` и `Future resource`; `.env.local` указывает на `.data/browser-check-20260903`. Это снижает доверие к продукту и делает текущие screenshots непригодными как release baseline. Нужен чистый, воспроизводимый seed и отдельный data directory для browser verification.

4. **Физический товар нельзя довести до оплаты.** UI отправляет checkout без `shippingAddress` (`src/app/ui/public-page.tsx:103,125`), а backend требует адрес и разрешённую страну (`src/lib/integrations/checkout.ts:45-49`). Нужен shipping step до создания order, включая страну, стоимость доставки и состояние недоступной страны.

5. **Desktop service card ломает читаемость действий.** Live computed layout для первой карточки каталога дал action-column около 64 px; `Подробнее` и `Записаться` визуально выводятся вертикально. Причина — `ItemCard` (`src/app/ui/block-renderer.tsx:43-55`) и конфликт desktop/mobile grid rules. Нужны минимальная ширина/nowrap для action controls и отдельная проверка 768/1024/1440.

### Creator workflow

6. **Readiness не встроен в publish-flow.** Чеклист показывается в Settings (`src/app/ui/pager-shell.tsx:212-216`), publish CTA находится отдельно (`src/app/ui/page-editor.tsx:121`), а серверная публикация не проверяет readiness (`src/lib/server/pages.ts:41-50`). Автор может увидеть важную проверку слишком поздно. Readiness должен быть рядом с publish CTA и блокировать только действительно обязательные условия.

7. **Верхний статус может показывать «Опубликовано» для unpublished page.** `TopBar` в real mode использует `t(locale, "published")` без проверки `data.page.publishedAt` (`src/app/ui/pager-shell.tsx:71-73`), хотя editor heading различает draft/published (`src/app/ui/page-editor.tsx:95`). Нужен один источник истины для статуса.

8. **Stripe setup — dead end.** Settings показывает статус Stripe, но не даёт CTA подключения (`src/app/ui/pager-shell.tsx:105`), тогда как OAuth route существует (`src/app/api/integrations/stripe/connect/route.ts:5-10`). Paid controls могут быть доступны до готовности account, а checkout позже возвращает ошибку (`src/lib/integrations/checkout.ts:70-71`). Нужны connect/setup CTA, disabled paid controls с объяснением и readiness state.

9. **Каталог нельзя полноценно настроить после создания.** Create modal собирает только title/type/price и создаёт пустые description, shipping и file-related поля (`src/app/ui/pager-shell.tsx:94-97`); edit API/action отсутствует. Нельзя добавить digital file, описание, delivery или shipping policy.

10. **Dashboard error маскируется под onboarding.** Ошибка `/api/dashboard` превращает `data` в `null`, после чего показывается `DemoGate` (`src/app/ui/pager-shell.tsx:120-131,200-201`). 401, 503 и network failure должны иметь разные recovery states и retry.

### Buyer/accessibility

11. **Checkout UI не учитывает expired state.** Он показывает Pay/Cancel для всего, что не `paid` (`src/app/ui/buyer-pages.tsx:23-27`), хотя backend отклоняет оплату expired order (`src/lib/integrations/checkout.ts:96-100`). Нужен terminal state с понятной кнопкой «Вернуться к странице»/«Создать новый заказ».

12. **Digital purchase не получает obvious delivery/open action.** API возвращает `fileId`, но catalog card всегда показывает Buy (`src/app/ui/block-renderer.tsx:43-54`), а library не передаёт purchase handlers (`src/app/ui/buyer-pages.tsx:41`). После оплаты пользователь должен видеть «Открыть материал» или безопасный download state.

13. **Checkout и library частично hardcode RU.** Checkout задаёт `locale = "ru"`, а recovery ведёт на `/anna` независимо от исходной страницы (`src/app/ui/buyer-pages.tsx:23-26`). Booking time в library форматируется в timezone устройства без явного timezone записи (`src/app/ui/buyer-pages.tsx:15,41`).

14. **Dialogs и announcements требуют accessibility pass.** Public/catalog modals не имеют полного focus trap/Escape/restore и в catalog close button без accessible name (`src/app/ui/public-page.tsx:20-21`, `src/app/ui/pager-shell.tsx:97`). Loading/errors в нескольких branches не объявлены как status/alert (`src/app/ui/pager-shell.tsx:30,42`, `src/app/ui/public-page.tsx:18,29,35,121`, `src/app/ui/buyer-pages.tsx:23-24,37-38`). Buyer routes также не имеют `main` landmark (`src/app/ui/buyer-pages.tsx:23-27,37-41`).

15. **Информативные gallery/before-after изображения имеют `alt=""`.** (`src/app/ui/block-renderer.tsx:78-84`). Нужен author-facing alt workflow и доступное описание текущего изображения/сравнения.

## P2 — улучшения качества системы и их текущий статус

Локальный remediation закрыл конкретные P2-дефекты, отмеченные выше:

- Editor/preview и buyer library tabs теперь используют связанные `tablist`/`tab`/`aria-selected`/`tabpanel`.
- Block picker показывает описание каждого типа, сохраняя все 25 блоков и RU/EN.
- Video, map и shoutout при отсутствии usable media/link теперь являются честными status-состояниями, а не мёртвыми ссылками `#`; `Clock3` зарегистрирован.
- Визуальный слой выровнял основные public/workspace controls по touch-ритму; в свежем browser-pass видимые public actions имели высоту 44–57 px, а mobile navigation сохраняет отдельную touch-sized компоновку.

Осознанно оставленные non-blocking design decisions:

- Hero CTA и fixed action dock повторяют одно главное действие. Hero остаётся первым экраном, dock — persistent recovery на длинной странице; это проверяемая конверсионная гипотеза, а не сломанный state.
- `publicAction` предпочитает booking block. Для consultants-first MVP это согласовано с воронкой «первый разговор → запись → оплата»; при появлении разных creator-сегментов приоритет можно сделать настройкой.
- В `globals.css` остаётся технический долг по консолидации старых token-слоёв/raw overrides; рабочий visual layer не меняет серверные границы и не является причиной release block.

## Что уже хорошо

- На 320/390 px в live public page не обнаружен горизонтальный overflow; карточки и CTA reflow-ятся, основные controls имеют комфортный touch size.
- Public page сразу объясняет value через один hero action, цену и demo boundary; sticky dock помогает на длинной странице.
- FAQ действительно раскрывается, а item detail сохраняет `returnTo` при login.
- Appearance sheet использует Radix dialog: labels, radios, focus и reduced-motion setting читаются последовательно.
- Paid content защищён серверной projection/entitlement logic; приватные `data` и assets не должны открываться только за счёт CSS-скрытия (`src/lib/server/access.ts`, public item route).
- Draft save flow сериализует изменения, учитывает revision conflict и предупреждает перед уходом с несохранённым draft (`src/lib/server/editor-draft.ts`, `src/app/ui/pager-shell.tsx:132-167`).
- Keyboard DnD instructions, reduced motion и safe-area для mobile уже предусмотрены.

## Приоритетный план (baseline до remediation)

1. Исправить booking result contract и price/mode source-of-truth; добавить тесты на confirmed booking → checkout и one-time/monthly display.
2. Добавить shipping UX для physical items или временно убрать физический тип из доступного коммерческого потока.
3. Починить local demo capability/error path и очистить browser seed/data directory.
4. Связать readiness с publish CTA, синхронизировать published status и довести Stripe setup до одного завершённого creator flow.
5. Исправить desktop item-card layout и повторить 320/375/390/414/768/1024/1440 проверки.
6. Закрыть buyer delivery/expired/timezone/locale states.
7. Провести keyboard-only, NVDA/VoiceOver, 200/400% zoom, forced colors, contrast и reduced-motion pass.
8. Затем унифицировать tokens, tabs, CTA selection и media interaction.

## Verification status (baseline до remediation)

- `pnpm test`: **256 тестов passed** в 30 файлах.
- `pnpm lint`: **exit 0**.
- Source-only TypeScript с временным audit config без `.next`: **exit 0**.
- `git diff --check`: **pass**.
- `pnpm typecheck`: **не подтверждён зелёным** — общий tsconfig включает stale/corrupt `.next/dev/types`; после пересборки остаются generated route-inventory errors, не ошибки source-only проверки.
- `pnpm build`: компиляция production bundle прошла, но общий build завершился **exit 1** на том же generated TypeScript gate.
- Реальные Supabase/Stripe/Cal.com OAuth, внешние уведомления и production secrets в этом аудите не подтверждены.
- NVDA/VoiceOver, forced colors и 200/400% zoom не выполнялись; authenticated creator canvas требует отдельного browser run после устранения demo/loopback blocker.

## Результат remediation — 2026-09-04

Критические UX-разрывы из этого аудита закрыты в рабочем дереве:

- booking result теперь сохраняет `orderId` и ведёт в checkout до финального success-state;
- access-блоки показывают и передают согласованный `one-time`/`monthly` mode;
- physical checkout собирает адрес, страну, количество и стоимость доставки;
- demo guard принимает только same-origin loopback browser path и отклоняет внешний `Origin`;
- publish CTA связан с readiness и серверной проверкой; whole-page paid flow требует содержательный preview;
- catalog получил edit/setup flow, Stripe получил явный connect CTA, dashboard различает 401 и реальные ошибки;
- buyer checkout/library получили locale, terminal states, timezone и более безопасные delivery actions;
- dialogs получили focus/ Escape/restore semantics, loading/error/status states — объявления, а media — описательные `alt`;
- старый smoke-data directory убран из default `.env.local`; demo по умолчанию использует отдельный `.data/pager-demo`.

Свежая проверка после remediation:

- `pnpm test`: **270 тестов passed** в **32 файлах**;
- `pnpm lint`: **exit 0**;
- `pnpm typecheck`: **exit 0**;
- `pnpm build`: **exit 0**;
- `git diff --check`: **pass**;
- изолированный `pnpm test:discovery`: **43 проверки**;
- изолированный `pnpm test:api`: **69 успешных HTTP assertions** плюс проверки confidentiality/publication/independent grants/subscription cancellation/concurrent stock/booking-rescheduling/hidden-archived states;
- свежий CUA-pass на чистом `.data/pager-demo-final-20260904`: `/anna`, auth dialog, Home → creator workspace, Page/Preview, picker всех 25 блоков, Catalog и Settings;
- в публичном preview: `scrollWidth === clientWidth` (1265 px при viewport 1280×720), `overflow-x: clip`, `overflow-wrap: anywhere`; видимые primary actions имеют 44–57 px высоты;
- в creator workspace: семантические tabs с корректным selected state, связанный panel, локализованный demo notice, action controls и accessible picker descriptions.

Browser evidence подтверждает чистое локальное demo-состояние и UI-связность. Старый `.data/pager-demo` намеренно сохранён и не используется этим preview: smoke-прогоны должны всегда выполняться на новой изолированной папке.

Production/pilot sign-off всё ещё не следует объявлять подтверждённым без реальных Supabase/Stripe/Cal.com credentials, deployment/secret gates, внешних webhook checks и отдельного NVDA/VoiceOver/forced-colors/200–400% zoom pass. Для локального demo платежи, бронирования и внешние уведомления не выполняются.

Финальный вывод: PAGER замыкает проверенные локальные UX-коммерческие пути и сохраняет warm editorial mobile-first направление. Локальный audit/remediation завершён; release sign-off возможен только после внешних инфраструктурных и accessibility gate-проверок.
