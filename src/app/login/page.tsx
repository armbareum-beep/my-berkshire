"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "signup";

/**
 * 이메일+비밀번호 로그인/회원가입.
 * 인증 메일 없이 즉시 입장하려면 Supabase의 "Confirm email"을 꺼야 한다.
 * (Authentication → Providers → Email → Confirm email OFF)
 * 카카오 로그인은 비즈앱 전환 후 별도로 다시 붙인다.
 */
export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 로그인되면(이 탭/다른 탭 모두) 자동으로 홈으로.
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) window.location.href = "/";
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      // Confirm email 이 꺼져 있으면 session 이 바로 발급된다.
      if (data.session) {
        window.location.href = "/";
        return;
      }
      // 켜져 있으면 세션이 없다 → 메일 확인 안내.
      setNotice("가입 완료. 이메일 확인이 필요한 설정이면 메일함을 확인하세요. 아니면 바로 로그인하세요.");
      setMode("login");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    window.location.href = "/";
  }

  const isSignup = mode === "signup";

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 p-6">
      <div>
        <p className="text-sm text-muted-foreground">개인 투자 지주회사 운영 콘솔</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">ENUF</h1>
      </div>

      <form onSubmit={submit} className="rounded-2xl bg-card p-6 shadow-card">
        <label className="text-sm font-medium" htmlFor="email">
          이메일
        </label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 h-12"
        />

        <label className="mt-4 block text-sm font-medium" htmlFor="password">
          비밀번호
        </label>
        <Input
          id="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={6}
          placeholder="6자 이상"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 h-12"
        />

        {error && <p className="mt-3 text-sm text-rise">{error}</p>}
        {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}

        <Button
          type="submit"
          disabled={loading || !email || password.length < 6}
          className="mt-5 h-12 w-full bg-primary text-base font-semibold text-primary-foreground"
        >
          {loading ? "처리 중…" : isSignup ? "회원가입" : "로그인"}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(isSignup ? "login" : "signup");
            setError(null);
            setNotice(null);
          }}
          className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {isSignup ? "이미 계정이 있어요 — 로그인" : "처음이신가요? 회원가입"}
        </button>
      </form>
    </main>
  );
}
