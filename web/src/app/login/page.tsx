import { AuthScreen } from "@/features/identity/auth-screen";
import { DocumentTitle } from "@/features/platform/document-title";

export default function LoginPage() { return <><DocumentTitle /><AuthScreen mode="login" /></>; }