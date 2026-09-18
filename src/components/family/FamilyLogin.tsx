"use client";
import { useState, type FormEvent } from "react";
import { House, LockKeyhole } from "lucide-react";

export default function FamilyLogin() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") || "");
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/family-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "로그인하지 못했어요.");
      form.reset(); window.location.replace("/");
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해 주세요."); setBusy(false); }
  }
  return <main className="login-page"><section className="login-card"><span className="brand-symbol"><House size={28}/></span><p className="eyebrow">OUR FAMILY, OUR FUTURE</p><h1>엘린하우스</h1><p className="subtitle">가족 비밀번호로 자산 보관함을 열어보세요.</p><form onSubmit={login} className="entry-form"><label>비밀번호<input name="password" type="password" inputMode="numeric" autoComplete="current-password" required maxLength={128} autoFocus disabled={busy}/></label>{error&&<p className="negative" role="alert">{error}</p>}<button type="submit" className="button primary full" disabled={busy}><LockKeyhole size={17}/>{busy?"확인 중…":"자산 보기"}</button></form><p className="fine">어느 기기에서든 같은 가족 자료를 확인해요. 자료는 ChatGPT 대화에서 반영합니다.</p></section></main>;
}
