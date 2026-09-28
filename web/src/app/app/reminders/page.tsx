import { ReminderScreen } from "@/features/scheduling/reminder-screen";

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ task_id?: string | string[] }> }) {
  const { task_id } = await searchParams;
  return <ReminderScreen taskId={typeof task_id === "string" ? task_id : ""} />;
}