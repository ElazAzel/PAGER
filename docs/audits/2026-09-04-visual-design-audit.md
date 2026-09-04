# Visual UI audit — 2026-09-04

## Scope

Проверены публичная страница автора, creator workspace, Catalog, Settings и карточка товара после функционального UX/UI remediation-пасса. Фокус: визуальная иерархия, связность surfaces, responsive-композиция, touch-эргономика и соответствие направлению PAGER.

## User goal and accessibility target

Пользователь должен быстро понять ценность страницы автора, открыть нужный платный блок или действие, а создатель — без лишней визуальной навигации собрать страницу и управлять её содержимым. Целевой интерфейс — mobile-first, keyboard-friendly, с читаемой иерархией, touch-targets и сохранением контраста существующей темы.

## Strengths

- Тёплая editorial/bento-основа уже отличает PAGER от типового blue SaaS.
- Публичная страница ясно ведёт к основному действию через sticky CTA dock.
- В workspace сохранены понятные режимы: редактор, Catalog и Settings.
- Публичный контент и состояния доступа визуально отделены от creator-инструментов.

## UX risks found

- На широком экране публичная колонка была слишком узкой, из-за чего hero и карточки теряли ритм.
- Workspace выглядел как несвязанные тёмная рабочая область и светлый редактор.
- В creator workspace заголовок, tabs и actions конкурировали за первый экран.
- Catalog и Settings имели рабочую структуру, но недостаточно выраженную card/data hierarchy.

## Accessibility and responsive risks

- Fixed CTA/mobile navigation должны учитывать нижний safe area и не закрывать последний интерактивный элемент.
- Для узких экранов нужно сохранять читаемость длинных заголовков и не допускать горизонтального скролла.
- Полный WCAG sign-off невозможен без отдельного keyboard, screen-reader и contrast sweep на всех пользовательских темах.

## Implemented visual pass

- Вынесен единый visual layer в `src/app/ui/pager-visual-system.css`, подключённый последним, чтобы не менять продуктовую логику и существующие appearance-настройки.
- Public page расширена до editorial-колонки 760 px; выровнены hero, блоки, footer и CTA dock; усилены typography scale, spacing и profile signal.
- Creator workspace получил единую иерархию sidebar/topbar/notice/heading/actions, более цельные canvas и style panel, а также согласованные Catalog/Settings cards и rows.
- Для mobile сохранены bottom navigation и touch-sized controls; data rows складываются без overflow.
- `layout.tsx` получил тёплый theme color, согласованный с paper-направлением PAGER.

## Evidence and limits

- Свежий CUA browser review выполнен 2026-09-04 на чистом `.data/pager-demo-final-20260904`: public page `/anna`, auth dialog, creator `/dashboard`, Page/Preview, block picker, Catalog и Settings.
- В текущем desktop viewport 1280×720 публичная поверхность дала `scrollWidth === clientWidth` (1265 px у document), `overflow-x: clip` и `overflow-wrap: anywhere`; видимые public actions имели высоту 44–57 px. Исторический responsive-pass на 320/390/768 px также не обнаружил горизонтального overflow; sidebar/mobile navigation переключаются ожидаемо.
- Creator browser evidence подтверждает цельную dark workspace/light canvas композицию, корректное состояние выбранной вкладки Preview, touch-sized navigation и объяснение demo boundary.
- Проверка подтверждает локальную визуальную целостность, но не подтверждает production deployment, live providers или реальное пользовательское поведение.

## Follow-up accessibility sweep

- Public page: tab order проходит основные CTA, каталог, FAQ, форму и footer; focus ring различим на интерактивных элементах.
- FAQ раскрывается клавиатурой через `Enter`; auth-модалка имеет `role="dialog"`, `aria-modal`, локализованный `Закрыть`, `aria-describedby`, keyboard trap и закрывается по `Escape`.
- Найденная регрессия при закрытии модалки исправлена: trigger сохраняется на `pointerdown/focus` capture, а после `Escape` фокус возвращается на исходную кнопку. Проверено в CUA на top sign-in trigger.
- Anonymous public response по-прежнему отдаёт для платного блока только teaser и варианты доступа; приватное содержимое в browser-состоянии посетителя не появляется.
- Editor tabs, buyer library tabs и block picker имеют programmatic relationships; picker объясняет назначение всех 25 типов блоков.
- Отдельный screen-reader review, forced colors, 200–400% zoom и проверка длинного кастомного контента в реальном author theme остаются pilot-проверкой; текущий sweep не является полным WCAG sign-off.

## Priority next step

Перед pilot sign-off выполнить внешний accessibility pass (NVDA/VoiceOver, forced colors, 200–400% zoom) и проверить один реальный author theme с длинным кастомным контентом. Локальный visual/remediation хвост закрыт; это уже внешний gate, а не незавершённая правка в рабочем дереве.
