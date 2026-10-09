import { AgentScreen } from "@/features/agents/agent-screen";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ space_id?: string | string[] }> }) {
  const { space_id } = await searchParams;
  const spaceId = typeof space_id === "string" && /^[0-9a-f-]{36}$/.test(space_id) ? space_id : "";
  return <AgentScreen initialSpaceId={spaceId} />;
}
