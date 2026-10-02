import type { Metadata } from "next";
import { cookies } from "next/headers";
import { isLanguage } from "@/features/i18n/messages";
import { Providers } from "./providers";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account | Community Platform",
  description: "Community Platform account access and personal settings.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const preference = (await cookies()).get("cp_lang")?.value;
  const language = isLanguage(preference) ? preference : "en";
  return (
    <html lang={language}>
      <body><Providers language={language}>{children}</Providers></body>
    </html>
  );
}
