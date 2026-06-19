"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다른 탭(매직링크)에서 로그인되면 이 탭도 감지해 자동 이동.
  // 매직링크는 새 탭에서 열리므로, 원래 탭이 죽은 화면으로 남지 않게 한다.
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) window.location.href = "/";
    });
    // 쿠키 기반 세션은 이벤트가 안 올 수 있어 폴링 폴백을 둔다.
    const poll = setInterval(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) window.location.href = "/";
    }, 2500);
    return () => {
      subscription.unsubscribe();
      clearInterval(poll);
    };
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 p-6">
      <div>
        <p className="text-sm text-muted-foreground">개인 투자 지주회사 운영 콘솔</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">ENUF</h1>
      </div>

      {sent ? (
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <p className="text-lg font-bold">메일함을 확인하세요</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {email} 으로 로그인 링크를 보냈습니다. 링크를 누르면 바로 입장합니다.
          </p>
        </div>
      ) : (
        <form onSubmit={sendLink} className="rounded-2xl bg-card p-6 shadow-card">
          <label className="text-sm font-medium" htmlFor="email">
            이메일로 시작하기
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
            className="mt-3 h-12"
          />
          {error && <p className="mt-2 text-sm text-rise">{error}</p>}
          <Button
            type="submit"
            disabled={loading || !email}
            className="mt-4 h-12 w-full bg-primary text-base font-semibold text-primary-foreground"
          >
            {loading ? "보내는 중…" : "로그인 링크 받기"}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            비밀번호 없이, 메일 링크로 입장합니다.
          </p>
        </form>
      )}
    </main>
  );
}
