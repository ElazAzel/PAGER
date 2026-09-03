import "server-only";
import type { Block, DatabaseState, Page, User } from "../types";

export function emptyState(): DatabaseState {
  return { users: [], pages: [], publishedPages: [], items: [], contacts: [], opportunities: [], bookings: [], orders: [], subscriptions: [], entitlements: [], timeline: [], integrations: [], analytics: [], assets: [], webhooks: [], notifications: [] };
}
export const DEMO_IDENTITIES = { creator: { primary: "creator-anna", secondary: "creator-other" }, buyer: { primary: "buyer-primary", secondary: "buyer-secondary" } } as const;
export function starterPage(user: User): Page {
  const now = new Date().toISOString();
  return { id: `page-${user.id}`, ownerId: user.id, slug: `p-${user.id.slice(0, 12)}`, title: user.name || "Моя страница", description: "", locale: user.locale, accent: "#D56A4A", blocks: [], paid: false, teaser: "", pricing: { currency: "USD" }, publishedAt: null, updatedAt: now, revision: 1 };
}
export function createDemoState(): DatabaseState {
  const state = emptyState(); const now = new Date().toISOString();
  state.users = [
    { id: "creator-anna", email: "anna@example.test", name: "Анна Волкова", role: "creator", locale: "ru", createdAt: now },
    { id: "creator-other", email: "mikhail@example.test", name: "Михаил Орлов", role: "creator", locale: "ru", createdAt: now },
    { id: "buyer-primary", email: "elena@example.test", name: "Елена Смирнова", role: "buyer", locale: "ru", createdAt: now },
    { id: "buyer-secondary", email: "alex@example.test", name: "Alex Reed", role: "buyer", locale: "en", createdAt: now },
  ];
  const block = (id: string, type: Block["type"], data: Block["data"], width: Block["width"] = "full"): Block => ({ id, type, data, width, hidden: false, archived: false, paid: false, teaser: "", pricing: { currency: "USD" } });
  const page: Page = {
    id: "page-anna", ownerId: "creator-anna", slug: "anna", title: "Анна Волкова — ясность в карьере и бизнесе", description: "Карьерный консультант. Помогаю найти свой следующий шаг и превратить его в понятный план.", locale: "ru", accent: "#D56A4A", paid: false,
    teaser: "Все материалы Анны, включая будущие дополнения. Консультации и товары приобретаются отдельно.", pricing: { currency: "USD", oneTime: 12900, monthly: 1900 }, publishedAt: now, updatedAt: now, revision: 1,
    blocks: [
      block("anna-profile", "profile", { name: "Анна Волкова", profession: "Карьерный консультант · стратег", text: "<p>Спокойно разберёмся, что для вас важно, и найдём следующий шаг.</p>", subtitle: "Демонстрационный профиль вымышленного консультанта" }),
      block("anna-approach", "text", { title: "Когда хочется ясности", text: "<p>Смена роли, запуск своего дела или решение, которое давно откладывается. Работаем с вашей реальной ситуацией: от вопросов к конкретному плану на 30 дней.</p>" }),
      block("anna-booking", "booking", { title: "Начнём с разговора", text: "60 минут внимания к вашему запросу. Локальная демонстрация записи — без реального календаря.", itemIds: ["anna-session"] }),
      block("anna-catalog", "catalog", { title: "Ваш следующий шаг", itemIds: ["anna-session", "anna-workbook", "anna-notebook"] }),
      block("anna-testimonial", "testimonial", { title: "Отзывы клиентов", text: "Здесь будет отзыв вашего клиента. Добавьте его после встречи и с согласия автора.", name: "Место для отзыва", subtitle: "Демонстрационный блок — настоящий отзыв ещё не добавлен" }, "half"),
      block("anna-faq", "faq", { title: "До нашей встречи", items: [{ title: "Нужно ли готовиться?", text: "Достаточно одного вопроса, который сейчас важен. Можно прислать контекст заранее." }, { title: "Что я получу?", text: "Карту вариантов, приоритеты и план ближайших действий." }, { title: "Можно на английском?", text: "Да. Sessions are available in Russian and English." }] }, "half"),
      { ...block("anna-library", "text", { title: "Личная библиотека ясности", text: "<h2>Ваш план на 30 дней</h2><p>Неделя 1: определите три критерия хорошей работы. Неделя 2: проведите два коротких интервью. Неделя 3: проверьте одну гипотезу. Неделя 4: выберите следующий небольшой шаг.</p><p><strong>Практика:</strong> каждый вечер запишите одно действие, которое приблизило вас к выбранному направлению.</p>" }), paid: true, teaser: "Практикум: вопросы для решений и рабочий план на 30 дней.", pricing: { currency: "USD", oneTime: 4900, monthly: 900 } },
      block("anna-form", "form", { title: "Расскажите о вашем запросе", text: "Пара строк о ситуации — и мы поймём, с чего начать.", label: "Отправить запрос" }),
    ],
  };
  const second: Page = { ...starterPage(state.users[1]), id: "page-other", slug: "mikhail", title: "Михаил Орлов — консультант", publishedAt: now, blocks: [block("other-profile", "profile", { name: "Михаил Орлов", text: "Независимый демонстрационный аккаунт." }), block("other-catalog", "catalog", { title: "Материалы Михаила", itemIds: ["other-guide"] })] };
  state.pages = [page, second]; state.publishedPages = structuredClone(state.pages);
  state.items = [
    { id: "anna-session", ownerId: page.ownerId, pageId: page.id, title: "Сессия ясности · 60 минут", description: "Индивидуальная консультация и план следующих действий. Demo: реальная встреча не бронируется.", kind: "service", price: 15000, currency: "USD", stock: null, reserved: 0, shipping: [], createdAt: now },
    { id: "anna-workbook", ownerId: page.ownerId, pageId: page.id, title: "Рабочая тетрадь «Следующий шаг»", description: "Цифровой практикум для самостоятельной работы: ценности, гипотезы и план.", kind: "digital", price: 2900, currency: "USD", stock: null, reserved: 0, fileId: "anna-workbook-file", shipping: [], createdAt: now },
    { id: "anna-notebook", ownerId: page.ownerId, pageId: page.id, title: "Блокнот для важных решений", description: "Льняная обложка, 120 страниц для мыслей и планов. В demo товары не отправляются.", kind: "physical", price: 3900, currency: "USD", stock: 8, reserved: 0, shipping: [{ country: "KZ", amount: 1000 }, { country: "RU", amount: 800 }], createdAt: now },
    { id: "other-guide", ownerId: second.ownerId, pageId: second.id, title: "Independent guide", description: "Second tenant isolation fixture.", kind: "digital", price: 1900, currency: "USD", stock: null, reserved: 0, shipping: [], createdAt: now },
  ];
  state.assets.push({ id: "anna-workbook-file", ownerId: page.ownerId, pageId: page.id, filename: "next-step.txt", mime: "text/plain", path: "seed/anna-workbook.txt", size: Buffer.byteLength(DEMO_WORKBOOK), createdAt: now });
  for (const [i, owner] of [page.ownerId, second.ownerId].entries()) state.contacts.push({ id: `seed-contact-${i}`, ownerId: owner, email: "elena@example.test", name: "Елена Смирнова", notes: i === 0 ? "Демонстрационный контакт Анны" : "Приватные заметки другого консультанта", createdAt: now, updatedAt: now });
  return state;
}
export const DEMO_WORKBOOK = "PAGER · Демонстрационный цифровой материал\nАнна Волкова — Следующий шаг\n\n1. Что для меня важно?\n2. Какое небольшое действие я могу проверить за неделю?\n3. Что я узнал(а) из результата?\n\nFictional local demo. No real payment or service.\n";
