import { cookies } from "next/headers";
import { AppChrome } from "@/features/platform/app-chrome";

// A session cookie only picks the first paint (signed-in chrome or the public one); every page still checks the session itself.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const signedIn = (await cookies()).has("cp_session");
  return <AppChrome signedIn={signedIn}>{children}</AppChrome>;
}
