import { getCapabilities } from "@/lib/server/capabilities";
import { legalConfig, paymentTerms } from "@/lib/legal";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  const capabilities = getCapabilities();
  const legal = legalConfig();

  return <main className="legal-page">
    <h1>Условия / Terms</h1>
    <section lang="ru">
      <h2>Русский</h2>
      <p>PAGER предоставляет страницы создателей, формы заявок и координацию бронирований. Создатель отвечает за точность и законность контента, предложений, доступности, исполнения и возвратов.</p>
      <p>{paymentTerms("ru", capabilities.payments && !capabilities.demo)}</p>
    </section>
    <section lang="en">
      <h2>English</h2>
      <p>PAGER provides creator pages, enquiry forms, and booking coordination. Creators are responsible for the accuracy and legality of their content, offers, availability, fulfilment, and refunds.</p>
      <p>{paymentTerms("en", capabilities.payments && !capabilities.demo)}</p>
    </section>
    {legal.configured ? <address>
      <strong>{legal.operatorName}</strong><br />
      <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>
    </address> : <p role="alert">Реквизиты оператора не настроены; публичный запуск заблокирован. / Operator details are not configured; public release is blocked.</p>}
  </main>;
}
