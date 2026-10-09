import { AuthScreen } from "@/features/identity/auth-screen";
import { DocumentTitle } from "@/features/platform/document-title";

export default function RecoverPage() { return <><DocumentTitle /><AuthScreen mode="recover" /></>; }