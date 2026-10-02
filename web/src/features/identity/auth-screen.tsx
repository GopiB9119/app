"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { ApiError, api, authSchema, challengeSchema, characters, doneSchema } from "./client";
import { Shell } from "./shell";
import { TimezoneListProblem } from "./timezone-list-problem";
import { formatDateTime, useLanguage, useText } from "@/features/i18n/i18n";
import type { MessageId, MessageValues } from "@/features/i18n/messages";

const inputSchema = z.object({
  email: z.string().email("auth.error.email").refine(value => value.endsWith(".test"), "auth.error.syntheticEmail"),
  password: z.string(), code: z.string(), display_name: z.string(), timezone: z.string(),
});
type Fields = z.infer<typeof inputSchema>;
type Mode = "login" | "register" | "recover";
const subscribeNothing = () => () => {};
const startingTimezones = ["UTC", "Asia/Kolkata", "Europe/London", "America/New_York"];

// Browsers name some zones by an older name (Asia/Calcutta for Asia/Kolkata) that the service refuses, so pick the listed name for the same zone.
function signUpTimezone(available: string[]) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (available.includes(zone)) return zone;
  return available.find(name => {
    try { return new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone === zone; } catch { return false; }
  }) ?? "UTC";
}

export function AuthScreen({ mode }: { mode: Mode }) {
  const t = useText();
  const { language } = useLanguage();
  // False in the server HTML, true once React runs: input before that would be submitted natively or overwritten.
  const interactive = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [challenge, setChallenge] = useState<z.infer<typeof challengeSchema> | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<MessageId | "">("");
  const [visible, setVisible] = useState(false);
  const [timezones, setTimezones] = useState<string[]>(startingTimezones);
  const [zoneLoad, setZoneLoad] = useState({ attempt: 0, failed: false });
  const [initialZone] = useState(() => signUpTimezone(startingTimezones));
  const [requestIntent, setRequestIntent] = useState<{ email: string; key: string } | null>(null);
  const form = useForm<Fields>({ resolver: zodResolver(inputSchema), defaultValues: { email: "", password: "", code: "", display_name: "", timezone: initialZone } });
  const [pendingDeletion, setPendingDeletion] = useState<string | null>(null);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);

  useEffect(() => {
    if (mode !== "login") return;
    const subscription = form.watch((_fields, { name }) => {
      if (name === "email" || name === "password") setPendingDeletion(null);
    });
    return () => subscription.unsubscribe();
  }, [mode, form.watch]);

  useEffect(() => {
    const controller = new AbortController();
    api("timezones", z.array(z.string()), { signal: controller.signal })
      .then(result => setTimezones(result.data))
      .catch(() => { if (!controller.signal.aborted) setZoneLoad(load => ({ ...load, failed: true })); });
    return () => controller.abort();
  }, [zoneLoad.attempt]);
  // After the new options render, so a select already on screen (as after Retry) can show the chosen zone.
  useEffect(() => {
    if (form.getValues("timezone") === initialZone) form.setValue("timezone", signUpTimezone(timezones));
  }, [timezones]);

  async function submit(fields: Fields) {
    setMessage("");
    setNotice("");
    if (mode === "login") {
      setPendingDeletion(null);
      if (!fields.password) { form.setError("password", { message: "auth.error.password" }); return; }
      try {
        await api("auth/login", authSchema, { method: "POST", body: { email: fields.email, password: fields.password } });
        window.location.assign("/app/settings/account");
      } catch (error) {
        if (error instanceof ApiError && error.code === "ACCOUNT_DELETION_PENDING" && error.details.purge_after && !Number.isNaN(Date.parse(error.details.purge_after))) {
          const current = form.getValues();
          if (current.email === fields.email && current.password === fields.password) setPendingDeletion(error.details.purge_after);
        } else setMessage((error as Error).message);
      }
      return;
    }
    if (!challenge) {
      try {
        await api("auth/bootstrap", doneSchema);
        const intent = requestIntent?.email === fields.email ? requestIntent : { email: fields.email, key: crypto.randomUUID() };
        setRequestIntent(intent);
        const response = await api(`auth/${mode === "register" ? "register" : "recover"}`, challengeSchema, {
          method: "POST", body: { email: intent.email }, headers: { "Idempotency-Key": intent.key },
        });
        setChallenge(response.data);
        form.setFocus("code");
      } catch (error) { setMessage((error as Error).message); }
      return;
    }
    if (!/^\d{6}$/.test(fields.code)) { form.setError("code", { message: "auth.error.code" }); return; }
    if (fields.password.length < 12 || fields.password.length > 128) { form.setError("password", { message: "auth.error.passwordLength" }); return; }
    if (mode === "register" && !fields.display_name.trim()) { form.setError("display_name", { message: "auth.error.displayName" }); return; }
    if (mode === "register" && characters(fields.display_name.trim()) > 80) { form.setError("display_name", { message: "auth.error.displayNameLength" }); return; }
    const proof = { challenge_id: challenge.challenge_id, code: fields.code, password: fields.password };
    try {
      if (mode === "register") {
        await api("auth/verify-email", authSchema, { method: "POST", body: { ...proof, display_name: fields.display_name.trim(), timezone: fields.timezone } });
        window.location.assign("/app/settings/account");
      } else {
        await api("auth/reset-password", doneSchema, { method: "POST", body: proof });
        form.resetField("password"); form.resetField("code");
        setChallenge(null); setRequestIntent(null);
        setNotice("auth.passwordChanged");
      }
    } catch (error) { setMessage((error as Error).message); }
  }

  async function cancelDeletion() {
    setCancellingDeletion(true); setMessage("");
    const { email, password } = form.getValues();
    try {
      await api("auth/cancel-deletion", authSchema, { method: "POST", body: { email, password } });
      window.location.assign("/app/settings/account");
    } catch (error) { setMessage((error as Error).message); }
    finally { setCancellingDeletion(false); }
  }

  function restart() {
    setChallenge(null); setRequestIntent(null); setMessage("");
    form.resetField("password"); form.resetField("code");
  }

  const passwordShown = mode === "login" || challenge !== null;
  const title = t(challenge ? (mode === "register" ? "auth.completeHeading" : "auth.choosePassword") : mode === "login" ? "auth.welcome" : mode === "register" ? "auth.createHeading" : "auth.recoverHeading");
  return <Shell>
    <main className="auth-main">
      <div className="auth-heading"><span className="section-kicker">{t("auth.yourAccount")}</span><h1>{title}</h1><p>{challenge ? form.getValues("email") : mode === "login" ? t("auth.signInHint") : t("auth.syntheticHint")}</p></div>
      {mode !== "recover" && !challenge && <nav className="auth-tabs" aria-label={t("shell.accountAccess")}><Link href="/login" aria-current={mode === "login" ? "page" : undefined}>{t("auth.signIn")}</Link><Link href="/register" aria-current={mode === "register" ? "page" : undefined}>{t("auth.createAccount")}</Link></nav>}
      <form className="auth-form" method="post" onSubmit={form.handleSubmit(submit)} noValidate>
        {!challenge && <label>{t("auth.email")}<div className="input-with-icon"><Mail size={18} aria-hidden /><input type="email" autoComplete="email" placeholder="alex@example.test" disabled={!interactive} {...form.register("email")} aria-invalid={!!form.formState.errors.email} aria-describedby="email-error" /></div><FieldError id="email-error" message={form.formState.errors.email?.message} /></label>}
        {challenge && <>
          <div className="verification-summary"><Mail size={20} aria-hidden /><span>{t("auth.emailVerification")} <strong>{t("auth.codeRequested")}</strong></span><span className="step-label">02 / 02</span></div>
          <label>{t("auth.code")}<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="code-input" placeholder="000000" {...form.register("code")} aria-invalid={!!form.formState.errors.code} aria-describedby="code-error" /><FieldError id="code-error" message={form.formState.errors.code?.message} /></label>
          {mode === "register" && <label>{t("auth.displayName")}<input autoComplete="name" maxLength={160} {...form.register("display_name")} aria-invalid={!!form.formState.errors.display_name} aria-describedby="name-error" /><FieldError id="name-error" message={form.formState.errors.display_name?.message} values={{ limit: 80 }} /></label>}
        </>}
        {passwordShown && <label><span id="password-label">{t(mode === "login" ? "auth.password" : "auth.newPassword")}</span><div className="password-field"><input type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength={128} disabled={!interactive} {...form.register("password")} aria-labelledby="password-label" aria-invalid={!!form.formState.errors.password} aria-describedby="password-hint password-error" /><button className="icon-button" type="button" disabled={!interactive} onClick={() => setVisible(!visible)} aria-label={t(visible ? "auth.hidePassword" : "auth.showPassword")} title={t(visible ? "auth.hidePassword" : "auth.showPassword")}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div><span id="password-hint" className="field-hint">{mode !== "login" ? t("auth.passwordHint") : ""}</span><FieldError id="password-error" message={form.formState.errors.password?.message} /></label>}
        {challenge && mode === "register" && <label><span id="signup-timezone-label">{t("auth.timezone")}</span><select aria-labelledby="signup-timezone-label" {...form.register("timezone")}>{timezones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>}
        {challenge && mode === "register" && zoneLoad.failed && <TimezoneListProblem message={t("auth.timezoneProblem")} retryLabel={t("auth.retry")} retry={() => setZoneLoad(load => ({ attempt: load.attempt + 1, failed: false }))} />}
        {message && <div role="alert" className="message error">{message}</div>}
        {mode === "login" && pendingDeletion && <div role="alert" className="message error"><div><p>{t("auth.deletionPending", { date: formatDateTime(language, pendingDeletion, { dateStyle: "long", timeStyle: "short" }) })}</p><button className="primary-button" type="button" disabled={cancellingDeletion || form.formState.isSubmitting} onClick={cancelDeletion}>{cancellingDeletion ? <LoaderCircle size={19} className="spin" aria-hidden /> : <ArrowRight size={19} aria-hidden />}{t("auth.cancelDeletion")}</button></div></div>}
        {notice && <div role="status" className="message success"><Check size={18} />{t(notice)}<Link href="/login">{t("auth.signIn")}</Link></div>}
        <button className="primary-button" type="submit" disabled={!interactive || form.formState.isSubmitting || (mode === "login" && cancellingDeletion)}>{form.formState.isSubmitting ? <LoaderCircle size={19} className="spin" aria-hidden /> : mode === "recover" ? <KeyRound size={19} aria-hidden /> : <ArrowRight size={19} aria-hidden />}<span>{t(form.formState.isSubmitting ? "auth.wait" : mode === "login" ? "auth.signIn" : challenge ? mode === "register" ? "auth.verifyCreate" : "auth.changePassword" : "auth.sendCode")}</span></button>
        {mode === "login" && <Link className="form-link" href="/recover">{t("auth.forgotPassword")}</Link>}
        {challenge && <button className="text-button" type="button" onClick={restart} disabled={form.formState.isSubmitting}><ArrowLeft size={16} />{t("auth.newCode")}</button>}
        {mode === "recover" && <Link className="form-link" href="/login">{t("auth.backSignIn")}</Link>}
      </form>
    </main>
  </Shell>;
}

function FieldError({ id, message, values }: { id: string; message?: string; values?: MessageValues }) {
  const t = useText();
  return <span id={id} className="field-error">{message ? t(message as MessageId, values) : undefined}</span>;
}