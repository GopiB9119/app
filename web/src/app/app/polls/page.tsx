import { PollsScreen } from "@/features/polls/polls-screen";

type Query = { space_id?: string | string[] };

const uuid = (value: string | string[] | undefined) => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value) ? value : "";

export default async function PollsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { space_id } = await searchParams;
  return <PollsScreen initialSpaceId={uuid(space_id)} />;
}
