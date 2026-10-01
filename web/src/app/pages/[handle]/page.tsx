import { notFound } from "next/navigation";
import { PublicPageScreen } from "@/features/community/page-screen";

export default async function PublicPageRoute({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const reference = decodeURIComponent(handle).toLowerCase();
  if (!/^[a-z0-9-]{3,36}$/.test(reference)) notFound();
  return <PublicPageScreen reference={reference} />;
}
