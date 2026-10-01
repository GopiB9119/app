import { notFound } from "next/navigation";
import { PostScreen } from "@/features/community/post-screen";

export default async function PublicPostRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) notFound();
  return <PostScreen postId={id} />;
}
