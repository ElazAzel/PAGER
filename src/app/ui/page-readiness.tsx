import type { Page, Locale } from "@/lib/types";
import { Icon } from "./pager-icon";
import { pagePublishChecks } from "@/lib/page-readiness";
import styles from "./page-readiness.module.css";

export function PageReadiness({ page, locale }: { page: Page; locale: Locale }) {
  const ru = locale === "ru";
  const visible = page.paid ? [] : page.blocks.filter(block => !block.hidden && !block.archived && !block.paid);
  const publishChecks = Object.fromEntries(pagePublishChecks(page).map(check => [check.key, check.ok])) as Record<"identity" | "profile" | "nextStep", boolean>;
  const checks = [
    { ok: Boolean(page.publishedAt), label: ru ? "Страница опубликована" : "Page is published", help: ru ? "Сохранённые изменения появятся в поиске после публикации и следующего обхода." : "Saved changes become available to search after publication and the next crawl." },
    { ok: page.paid ? Boolean(page.teaser.trim()) : true, label: ru ? "Есть понятный способ познакомиться" : "There is a clear introduction", help: ru ? "Для платной страницы добавьте содержательный preview, чтобы посетитель понял ценность доступа." : "For a paid page, add a useful preview so visitors understand the value of access." },
    { ok: publishChecks.identity, label: ru ? "Понятно, кто вы и чем помогаете" : "Your expertise and value are clear", help: ru ? "Укажите имя, специализацию и результат для клиента. Описание должно иметь смысл само по себе." : "Include your name, specialty and the client outcome. Make the description understandable on its own." },
    { ok: publishChecks.profile, label: ru ? "У автора есть содержательное представление" : "The author has a useful introduction", help: ru ? "В блоке «Профиль» добавьте опыт и специализацию. Укажите город, если принимаете очно." : "Add your experience and specialty to the Profile block, and your city if you meet in person." },
    { ok: publishChecks.nextStep, label: ru ? "Есть следующий шаг для посетителя" : "Visitors have a clear next step", help: ru ? (page.paid ? "Сделайте preview достаточно подробным: он ведёт к покупке доступа." : "Добавьте запись, форму или мессенджер. Проверьте действие на опубликованной странице.") : (page.paid ? "Make the preview specific enough to lead to an access purchase." : "Add booking, a form or a messenger. Check the action on the published page.") },
    { ok: visible.some(block => block.type === "faq" && block.data.items?.some(item => item.title?.trim() && item.text?.trim())), label: ru ? "Есть прямые ответы на вопросы" : "Common questions have direct answers", help: ru ? "Расскажите о стоимости, формате, сроках и результате в блоке «Вопросы и ответы»." : "Explain pricing, format, timing and outcomes in the FAQ block." },
    { ok: visible.some(block => block.type === "testimonial" && Boolean(block.data.text?.trim())), label: ru ? "Есть подтверждение опыта" : "Your experience has supporting evidence", help: ru ? "Добавьте настоящий отзыв с разрешения клиента или публичный пример работы." : "Add a genuine testimonial with the client's permission or a public example of your work." },
  ];
  return <section className={styles.root} aria-labelledby="readiness-title">
    <div className={styles.heading}><Icon name="Search" size={19} /><h2 id="readiness-title">{ru ? "Как вас находят и выбирают" : "Help people find and choose you"}</h2></div>
    <p>{ru ? "Проверьте содержание черновика перед публикацией. Это подсказки по странице, а не проверка её позиций в поиске." : "Review your draft before publishing. These are content checks, not a search ranking audit."}</p>
    <div className={styles.preview} aria-label={ru ? "Пример поискового сниппета" : "Search snippet preview"}>
      <span>/{page.slug}</span><strong>{page.title || "PAGER"}</strong><p>{page.paid ? page.teaser || (ru ? "Материалы по подписке" : "Members-only content") : page.description}</p>
    </div>
    <ul className={styles.checks}>{checks.map(check => <li key={check.label}>
      <Icon name={check.ok ? "CircleCheck" : "Circle"} size={18} />
      <div><strong>{check.label}</strong><span>{check.ok ? (ru ? "Есть в черновике" : "Present in draft") : check.help}</span></div>
    </li>)}</ul>
    <p className={styles.note}>{ru ? "Поисковики и ИИ выбирают страницы самостоятельно. После запуска домена проверьте индексацию в Google Search Console и Bing Webmaster Tools. Изменения появятся не сразу." : "Search engines and AI services decide which pages to include. After launching your domain, check indexing in Google Search Console and Bing Webmaster Tools. Changes take time to appear."}</p>
  </section>;
}
