import { legalConfig } from "@/lib/legal";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const legal = legalConfig();

  return <main className="legal-page">
    <h1>Конфиденциальность / Privacy</h1>
    <section lang="ru">
      <h2>Русский</h2>
      <p>PAGER хранит данные аккаунта, страницы, заявок, бронирований и агрегированной аналитики, необходимые для работы сервиса. Закрытые блоки, учётные данные и данные клиентов доступны только авторизованным пользователям с соответствующими правами.</p>
      <p>Для запроса доступа, исправления или удаления данных свяжитесь с оператором сервиса.</p>
    </section>
    <section lang="en">
      <h2>English</h2>
      <p>PAGER stores account, page, enquiry, booking, and aggregate analytics data required to provide the service. Private blocks, credentials, and customer records are available only to authorised users with the required access.</p>
      <p>Contact the service operator to request access, correction, or deletion of personal data.</p>
    </section>
    {legal.configured ? <address>
      <strong>{legal.operatorName}</strong><br />
      <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>
    </address> : <p role="alert">Реквизиты оператора не настроены; публичный запуск заблокирован. / Operator details are not configured; public release is blocked.</p>}
  </main>;
}
