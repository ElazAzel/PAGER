import type { Block, BlockType, Locale, BlockData } from "./types";

export const BLOCK_META: Record<BlockType, { ru: string; en: string; descriptionRu: string; descriptionEn: string; group: number; icon: string }> = {
 profile: {ru:"Профиль",en:"Profile",descriptionRu:"Имя, фотография и ваше главное предложение",descriptionEn:"Your name, photo and main offer",group:0,icon:"UserRound"},
 text: {ru:"Текст",en:"Text",descriptionRu:"Заголовки, заметки и форматированный текст",descriptionEn:"Headings, notes and rich text",group:0,icon:"Type"},
 image: {ru:"Изображение",en:"Image",descriptionRu:"Фотография, баннер или GIF",descriptionEn:"A photo, banner or GIF",group:0,icon:"Image"},
 separator: {ru:"Разделитель",en:"Divider",descriptionRu:"Воздух между разделами",descriptionEn:"Space between sections",group:0,icon:"Minus"},
 link: {ru:"Ссылка",en:"Link",descriptionRu:"Карточка внешнего ресурса",descriptionEn:"A link to another resource",group:0,icon:"Link"},
 socials: {ru:"Социальные сети",en:"Social links",descriptionRu:"Ваши площадки в одном ряду",descriptionEn:"Your social profiles in a row",group:0,icon:"AtSign"},
 video: {ru:"Видео",en:"Video",descriptionRu:"Презентация, урок или демонстрация",descriptionEn:"A presentation, lesson or demo",group:1,icon:"Play"},
 carousel: {ru:"Галерея",en:"Gallery",descriptionRu:"Работы и фотографии с пролистыванием",descriptionEn:"Swipe through your portfolio",group:1,icon:"GalleryHorizontalEnd"},
 before_after: {ru:"До и после",en:"Before & after",descriptionRu:"Сравнение с интерактивным ползунком",descriptionEn:"An interactive comparison slider",group:1,icon:"Columns2"},
 testimonial: {ru:"Отзыв",en:"Testimonial",descriptionRu:"Слова ваших клиентов",descriptionEn:"Feedback from your clients",group:1,icon:"Quote"},
 faq: {ru:"Вопросы и ответы",en:"FAQ",descriptionRu:"Помогите клиенту принять решение",descriptionEn:"Help visitors decide",group:1,icon:"CircleHelp"},
 map: {ru:"Карта",en:"Map",descriptionRu:"Адрес и расположение",descriptionEn:"Your address and location",group:1,icon:"MapPin"},
 messenger: {ru:"Мессенджер",en:"Messenger",descriptionRu:"Telegram, WhatsApp и другие каналы",descriptionEn:"Telegram, WhatsApp and more",group:2,icon:"MessageCircle"},
 download: {ru:"Файл",en:"Download",descriptionRu:"Гайд, прайс или полезный материал",descriptionEn:"A guide, price list or resource",group:2,icon:"Download"},
 pricing: {ru:"Услуги и цены",en:"Services & pricing",descriptionRu:"Предложения с переходом к записи",descriptionEn:"Your services, ready to book",group:3,icon:"Tag"},
 catalog: {ru:"Каталог",en:"Catalog",descriptionRu:"Товары с категориями и ценами",descriptionEn:"Products, categories and prices",group:3,icon:"LayoutGrid"},
 product: {ru:"Товар",en:"Product",descriptionRu:"Один товар с подробной карточкой",descriptionEn:"One product with its own detail page",group:3,icon:"ShoppingBag"},
 countdown: {ru:"Обратный отсчёт",en:"Countdown",descriptionRu:"Время до важного события",descriptionEn:"Time until something important",group:4,icon:"Timer"},
 scratch: {ru:"Скретч-карта",en:"Scratch card",descriptionRu:"Спрячьте бонус под защитным слоем",descriptionEn:"Reveal a bonus under a scratch layer",group:4,icon:"Gift"},
 shoutout: {ru:"Рекомендация",en:"Shoutout",descriptionRu:"Порекомендуйте другого автора PAGER",descriptionEn:"Recommend another PAGER creator",group:4,icon:"HeartHandshake"},
 community: {ru:"Сообщество",en:"Community",descriptionRu:"Приглашение в ваш клуб",descriptionEn:"An invitation to your community",group:4,icon:"UsersRound"},
 event: {ru:"Мероприятие",en:"Event",descriptionRu:"Анонс, регистрация и билеты",descriptionEn:"An event, registration and tickets",group:4,icon:"CalendarDays"},
 custom_code: {ru:"Свой код",en:"Custom code",descriptionRu:"Изолированный HTML/JS-виджет",descriptionEn:"An isolated HTML/JS widget",group:5,icon:"Code2"},
 form: {ru:"Форма заявки",en:"Contact form",descriptionRu:"Обращения сразу попадают в CRM",descriptionEn:"Inquiries arrive directly in your CRM",group:2,icon:"Send"},
 booking: {ru:"Запись",en:"Booking",descriptionRu:"Выбор времени через Cal.com",descriptionEn:"Pick a time with Cal.com",group:3,icon:"CalendarClock"},
};

export const BLOCK_GROUPS = {ru:["Структура страницы","Контент и доверие","Связь с клиентами","Услуги и продажи","Вовлечение","Дополнительно"],en:["Page essentials","Content & trust","Stay in touch","Services & sales","Engagement","Advanced"]};

export function createBlock(type: BlockType, locale: Locale = "ru"): Block {
 const ru=locale==="ru";
 const base:BlockData={title:BLOCK_META[type][locale]};
 const data:Partial<Record<BlockType,BlockData>>={
  profile:{name:ru?"Ваше имя":"Your name",profession:ru?"Ваша специализация":"Your specialty",title:ru?"Помогаю сделать следующий шаг.":"Let's find your next step.",text:ru?"<p>Расскажите, кому и чем вы помогаете.</p>":"<p>Share who you help and how.</p>",label:ru?"Записаться на встречу":"Book a session",url:"#booking"},
  text:{title:ru?"Обо мне":"About me",text:ru?"<p>Здесь начинается ваша история.</p>":"<p>Your story starts here.</p>"},
  link:{title:ru?"Полезная ссылка":"A useful link",url:"https://example.com",text:ru?"Коротко о том, что ждёт по ссылке":"A little context for your link"},
  socials:{items:[{title:"Telegram",url:"https://t.me/",icon:"telegram"},{title:"Instagram",url:"https://instagram.com/",icon:"instagram"}]},
  testimonial:{text:ru?"Добавьте настоящий отзыв клиента.":"Add an actual client testimonial.",name:ru?"Имя клиента":"Client name",subtitle:ru?"Услуга или проект":"Service or project"},
  faq:{title:ru?"Частые вопросы":"Common questions",items:[{title:ru?"Как проходит встреча?":"How does a session work?",text:ru?"Расскажите о формате и подготовке.":"Describe the format and preparation."}]},
  messenger:{title:ru?"Давайте познакомимся":"Let's talk",text:ru?"Напишите о вашем запросе — выберем подходящий формат.":"Tell me what you need and we'll find the right format.",url:"https://t.me/",label:ru?"Написать мне":"Send a message"},
  download:{title:ru?"Полезный материал":"A useful resource",text:ru?"Что внутри и кому это пригодится.":"What's inside and who it's for.",label:ru?"Скачать файл":"Download file"},
  pricing:{title:ru?"Как мы можем поработать":"Ways to work together",itemIds:[]}, catalog:{title:ru?"Мой каталог":"My catalog",itemIds:[]},product:{title:ru?"Мой продукт":"My product",itemIds:[]},
  before_after:{title:ru?"До и после":"Before & after"},carousel:{title:ru?"Мои работы":"My work",items:[]},
  countdown:{title:ru?"Скоро начинаем":"Starting soon",endsAt:new Date(Date.now()+7*86400000).toISOString()},
  scratch:{title:ru?"Небольшой подарок":"A little gift",text:ru?"Сотрите слой, чтобы открыть бонус":"Scratch to reveal your bonus",code:"WELCOME"},
  community:{title:ru?"Присоединяйтесь к сообществу":"Join the community",text:ru?"Место для общения и обмена опытом.":"A place to connect and share ideas.",label:ru?"Вступить":"Join us",url:"https://t.me/"},
  shoutout:{title:ru?"Рекомендую коллегу":"Meet a colleague",name:ru?"Имя автора":"Creator name",url:"/alex",text:ru?"Расскажите, чем вам нравится этот специалист.":"Share why you recommend this person."},
  event:{title:ru?"Наша следующая встреча":"Our next event",endsAt:new Date(Date.now()+7*86400000).toISOString(),location:ru?"Онлайн":"Online",text:ru?"Добавьте программу мероприятия.":"Add the event agenda.",label:ru?"Зарегистрироваться":"Register",itemIds:[]},
  custom_code:{title:ru?"Ваш виджет":"Your widget",html:"<p style=\"font:16px system-ui;padding:16px\">Hello, PAGER.</p>"},
  form:{title:ru?"Расскажите о вашей задаче":"Tell me what you're working on",text:ru?"Я свяжусь с вами, чтобы обсудить детали.":"I'll get back to you to discuss the details.",label:ru?"Отправить заявку":"Send inquiry"},
  booking:{title:ru?"Выберите удобное время":"Find a time that works",text:ru?"Первый шаг к нашему знакомству.":"The first step towards working together.",label:ru?"Записаться":"Book a session",calLink:""},
  map:{title:ru?"Где мы встречаемся":"Where we meet",address:ru?"Добавьте адрес":"Add your address",url:""},
 };
 return {id:crypto.randomUUID(),type,width:["profile","text","separator","pricing","catalog","faq","booking","form","carousel"].includes(type)?"full":"half",hidden:false,paid:false,teaser:ru?"Материал доступен после оплаты.":"Unlock this resource with a purchase.",pricing:{currency:"USD",oneTime:1900},data:{...base,...data[type]}};
}

export function formatMoney(amount: number, currency="USD", locale:Locale="ru") {
 try {return new Intl.NumberFormat(locale==="ru"?"ru-RU":"en-US",{style:"currency",currency,maximumFractionDigits:amount%100===0?0:2}).format(amount/100);}catch{return `${(amount/100).toFixed(2)} ${currency}`;}
}
export function safeHref(value:string|undefined):string|undefined {
 if(!value)return undefined;
 if(value.startsWith("/")&&!value.startsWith("//"))return value;
 if(/^#[a-zA-Z0-9_-]+$/.test(value))return value;
 try{const url=new URL(value);return ["https:","http:","mailto:","tel:"].includes(url.protocol)?value:undefined;}catch{return undefined;}
}
