import { AuthScreen } from "@/features/identity/auth-screen";
import { DocumentTitle } from "@/features/platform/document-title";

export default function RegisterPage() { return <><DocumentTitle /><AuthScreen mode="register" /></>; }