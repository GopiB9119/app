import { SearchScreen } from "@/features/discovery/search-screen";

type Query = { q?: string | string[]; space_id?: string | string[] };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { q, space_id } = await searchParams;
  const spaceId = typeof space_id === "string" && /^[0-9a-f-]{36}$/.test(space_id) ? space_id : "";
  return <SearchScreen initialQuery={typeof q === "string" ? q.slice(0, 400) : ""} initialSpaceId={spaceId} />;
}
