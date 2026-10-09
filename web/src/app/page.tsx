import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingScreen } from "@/features/platform/about-screen";
import { DocumentTitle } from "@/features/platform/document-title";

// Visitors see what the product is and how it treats their data; a browser with a session goes straight to the app.
export default async function Home() {
  if ((await cookies()).has("cp_session")) redirect("/app");
  return <><DocumentTitle /><LandingScreen /></>;
}
