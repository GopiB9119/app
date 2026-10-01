"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { api, authSchema, challengeSchema, doneSchema } from "./client";
import { Shell } from "./shell";

const inputSchema = z.object({
  email: z.string().email("Enter a valid email address.").refine(value => value.endsWith(".test"), "Use a synthetic .test address in this local build."),
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
  // False in the server HTML, true once React runs: input before that would be submitted natively or overwritten.
  const interactive = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [challenge, setChallenge] = useState<z.infer<typeof challengeSchema> | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [visible, setVisible] = useState(false);
  const [timezones, setTimezones] = useState<string[]>(startingTimezones);
  const [initialZone] = useState(() => signUpTimezone(startingTimezones));
  const [requestIntent, setRequestIntent] = useState<{ email: string; key: string } | null>(null);
  const form = useForm<Fields>({ resolver: zodResolver(inputSchema), defaultValues: { email: "", password: "", code: "", display_name: "", timezone: initialZone } });

  useEffect(() => {
    const controller = new AbortController();
    api("timezones", z.array(z.string()), { signal: controller.signal }).then(result => {
      setTimezones(result.data);
      if (form.getValues("timezone") === initialZone) form.setValue("timezone", signUpTimezone(result.data));
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  async function submit(fields: Fields) {
    setMessage("");
    setNotice("");
    if (mode === "login") {
      if (!fields.password) { form.setError("password", { message: "Enter your password." }); return; }
      try {
        await api("auth/login", authSchema, { method: "POST", body: { email: fields.email, password: fields.password } });
        window.location.assign("/app/settings/account");
      } catch (error) { setMessage((error as Error).message); }
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
    if (!/^\d{6}$/.test(fields.code)) { form.setError("code", { message: "Enter the six-digit code." }); return; }
    if (fields.password.length < 12 || fields.password.length > 128) { form.setError("password", { message: "Use 12 to 128 characters." }); return; }
    if (mode === "register" && !fields.display_name.trim()) { form.setError("display_name", { message: "Enter a display name." }); return; }
    const proof = { challenge_id: challenge.challenge_id, code: fields.code, password: fields.password };
    try {
      if (mode === "register") {
        await api("auth/verify-email", authSchema, { method: "POST", body: { ...proof, display_name: fields.display_name.trim(), timezone: fields.timezone } });
        window.location.assign("/app/settings/account");
      } else {
        await api("auth/reset-password", doneSchema, { method: "POST", body: proof });
        form.resetField("password"); form.resetField("code");
        setChallenge(null); setRequestIntent(null);
        setNotice("Password changed. All previous sessions are signed out.");
      }
    } catch (error) { setMessage((error as Error).message); }
  }

  function restart() {
    setChallenge(null); setRequestIntent(null); setMessage("");
    form.resetField("password"); form.resetField("code");
  }

  const passwordShown = mode === "login" || challenge !== null;
  const title = challenge ? (mode === "register" ? "Complete your account" : "Choose a new password") : mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Recover your account";
  return <Shell>
    <main className="auth-main">
      <div className="auth-heading"><span className="section-kicker">YOUR ACCOUNT</span><h1>{title}</h1><p>{challenge ? form.getValues("email") : mode === "login" ? "Sign in to Community Platform." : "Synthetic .test accounts only."}</p></div>
      {mode !== "recover" && !challenge && <nav className="auth-tabs" aria-label="Account access"><Link href="/login" aria-current={mode === "login" ? "page" : undefined}>Sign in</Link><Link href="/register" aria-current={mode === "register" ? "page" : undefined}>Create account</Link></nav>}
      <form className="auth-form" method="post" onSubmit={form.handleSubmit(submit)} noValidate>
        {!challenge && <label>Email address<div className="input-with-icon"><Mail size={18} aria-hidden /><input type="email" autoComplete="email" placeholder="alex@example.test" disabled={!interactive} {...form.register("email")} aria-invalid={!!form.formState.errors.email} aria-describedby="email-error" /></div><FieldError id="email-error" message={form.formState.errors.email?.message} /></label>}
        {challenge && <>
          <div className="verification-summary"><Mail size={20} aria-hidden /><span>Email verification <strong>Code requested</strong></span><span className="step-label">02 / 02</span></div>
          <label>Verification code<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="code-input" placeholder="000000" {...form.register("code")} aria-invalid={!!form.formState.errors.code} aria-describedby="code-error" /><FieldError id="code-error" message={form.formState.errors.code?.message} /></label>
          {mode === "register" && <label>Display name<input autoComplete="name" maxLength={80} {...form.register("display_name")} aria-invalid={!!form.formState.errors.display_name} aria-describedby="name-error" /><FieldError id="name-error" message={form.formState.errors.display_name?.message} /></label>}
        </>}
        {passwordShown && <label><span id="password-label">{mode === "login" ? "Password" : "New password"}</span><div className="password-field"><input type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength={128} disabled={!interactive} {...form.register("password")} aria-labelledby="password-label" aria-invalid={!!form.formState.errors.password} aria-describedby="password-hint password-error" /><button className="icon-button" type="button" disabled={!interactive} onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} title={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div><span id="password-hint" className="field-hint">{mode !== "login" ? "12 to 128 characters" : ""}</span><FieldError id="password-error" message={form.formState.errors.password?.message} /></label>}
        {challenge && mode === "register" && <label><span id="signup-timezone-label">Timezone</span><select aria-labelledby="signup-timezone-label" {...form.register("timezone")}>{timezones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>}
        {message && <div role="alert" className="message error">{message}</div>}
        {notice && <div role="status" className="message success"><Check size={18} />{notice}<Link href="/login">Sign in</Link></div>}
        <button className="primary-button" type="submit" disabled={!interactive || form.formState.isSubmitting}>{form.formState.isSubmitting ? <LoaderCircle size={19} className="spin" aria-hidden /> : mode === "recover" ? <KeyRound size={19} aria-hidden /> : <ArrowRight size={19} aria-hidden />}<span>{form.formState.isSubmitting ? "Please wait" : mode === "login" ? "Sign in" : challenge ? mode === "register" ? "Verify and create account" : "Change password" : "Send verification code"}</span></button>
        {mode === "login" && <Link className="form-link" href="/recover">Forgot your password?</Link>}
        {challenge && <button className="text-button" type="button" onClick={restart} disabled={form.formState.isSubmitting}><ArrowLeft size={16} />Request a new code</button>}
        {mode === "recover" && <Link className="form-link" href="/login">Back to sign in</Link>}
      </form>
    </main>
  </Shell>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return <span id={id} className="field-error">{message}</span>;
}