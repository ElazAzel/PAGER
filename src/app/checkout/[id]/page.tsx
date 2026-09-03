import { CheckoutScreen } from "../../ui/buyer-pages";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CheckoutScreen id={id} />;
}
