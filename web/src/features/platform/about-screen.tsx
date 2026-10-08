"use client";

import Link from "next/link";
import { CalendarHeart, Compass, MessagesSquare, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell } from "@/features/identity/shell";
import { formatDateTime, useLanguage, useText } from "@/features/i18n/i18n";
import { LEGAL_DRAFT_DATE, PrivacyNoticeDraft, TermsDraft } from "./legal-drafts";
import styles from "./about.module.css";

function LegalLinks() {
  const t = useText();
  return <nav className={styles.legal} aria-label={`${t("about.privacyLink")}, ${t("about.termsLink")}`}>
    <Link href="/privacy">{t("about.privacyLink")}</Link>
    <Link href="/terms">{t("about.termsLink")}</Link>
  </nav>;
}

export function LandingScreen() {
  const t = useText();
  const uses = [
    { icon: CalendarHeart, title: "about.familyTitle", text: "about.familyText" },
    { icon: MessagesSquare, title: "about.groupsTitle", text: "about.groupsText" },
    { icon: Compass, title: "about.communityTitle", text: "about.communityText" },
    { icon: Sparkles, title: "about.assistantTitle", text: "about.assistantText" },
  ] as const;
  return <Shell><main className={styles.main}>
    <header className={styles.hero}>
      <h1>{t("about.title")}</h1>
      <p className={styles.lead}>{t("about.lead")}</p>
      <div className={styles.actions}>
        <Button asChild size="lg"><Link href="/register">{t("about.start")}</Link></Button>
        <Button asChild size="lg" variant="secondary"><Link href="/login">{t("about.signIn")}</Link></Button>
        <Button asChild size="lg" variant="ghost"><Link href="/app/discover">{t("about.explore")}</Link></Button>
      </div>
    </header>
    <section aria-labelledby="about-uses">
      <h2 id="about-uses">{t("about.uses")}</h2>
      <ul className={styles.uses}>
        {uses.map(({ icon: Icon, title, text }) => <li key={title}>
          <Icon size={24} aria-hidden />
          <h3>{t(title)}</h3>
          <p>{t(text)}</p>
        </li>)}
      </ul>
    </section>
    <section className={styles.promises} aria-labelledby="about-promises">
      <h2 id="about-promises"><ShieldCheck size={22} aria-hidden />{t("about.promisesTitle")}</h2>
      <ul>
        {(["about.promiseAds", "about.promisePrivate", "about.promiseLeave", "about.promiseHonest"] as const).map(id => <li key={id}>{t(id)}</li>)}
      </ul>
    </section>
    <p className={styles.note}>{t("about.testVersion")}</p>
    <LegalLinks />
  </main></Shell>;
}

function LegalScreen({ title, children }: { title: "about.privacyTitle" | "about.termsTitle"; children: React.ReactNode }) {
  const t = useText();
  const { language } = useLanguage();
  return <Shell><main className={styles.main}>
    <header className={styles.legalHeading}>
      <h1>{t(title)}</h1>
      <p className="message warning" role="note">{t("about.draft")}</p>
      {language !== "en" && <p className={styles.note}>{t("about.englishOnly")}</p>}
      <p className={styles.note}>{t("about.updated", { date: formatDateTime(language, `${LEGAL_DRAFT_DATE}T12:00:00Z`, { dateStyle: "long", timeZone: "UTC" }) })}</p>
    </header>
    <article className={styles.document} lang="en">{children}</article>
    <nav className={styles.legal} aria-label={t("about.home")}>
      <Link href="/">{t("about.home")}</Link>
      <Link href={title === "about.privacyTitle" ? "/terms" : "/privacy"}>{t(title === "about.privacyTitle" ? "about.termsLink" : "about.privacyLink")}</Link>
    </nav>
  </main></Shell>;
}

export function PrivacyNoticeScreen() {
  return <LegalScreen title="about.privacyTitle"><PrivacyNoticeDraft /></LegalScreen>;
}

export function TermsScreen() {
  return <LegalScreen title="about.termsTitle"><TermsDraft /></LegalScreen>;
}
