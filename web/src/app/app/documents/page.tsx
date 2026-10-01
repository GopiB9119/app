import { DocumentsScreen } from "@/features/files/documents-screen";

type Query = { space_id?: string | string[]; id?: string | string[]; line?: string | string[]; end?: string | string[] };

const uuid = (value: string | string[] | undefined) => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value) ? value : "";
const digits = (value: string | string[] | undefined) => typeof value === "string" && /^\d{1,7}$/.test(value) ? value : "";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { space_id, id, line, end } = await searchParams;
  return <DocumentsScreen initialSpaceId={uuid(space_id)} initialDocumentId={uuid(id)} initialLine={digits(line)} initialEnd={digits(end)} />;
}
