import { ItemDetailScreen } from "../../../ui/public-page";

export default async function PublicItem({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return <ItemDetailScreen slug={slug} itemId={id} />;
}
