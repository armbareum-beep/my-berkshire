"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BuyWizard } from "@/components/transactions/wizard/BuyWizard";
import {
  Award,
  Building2,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  foundCompany,
  type CreatedAccount,
  type FoundingAccount,
} from "./actions";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  type AccountType,
} from "@/lib/config/tax";

type Step = "J1" | "J2" | "J2_5" | "J3" | "J4";

export function OnboardingRail({
  today,
  prices,
  fxRates = {},
}: {
  today: string;
  prices: Record<string, number>;
  fxRates?: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("J1");
  const [name, setName] = useState("");
  const [accounts, setAccounts] = useState<FoundingAccount[]>([
    { name: "", accountType: "GENERAL" },
  ]);
  const [createdAccounts, setCreatedAccounts] = useState<CreatedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  function updateAccount(index: number, patch: Partial<FoundingAccount>) {
    setAccounts((prev) =>
      prev.map((account, i) => (i === index ? { ...account, ...patch } : account)),
    );
  }

  function removeAccount(index: number) {
    if (accounts.length === 1) return;
    setAccounts((prev) => prev.filter((_, i) => i !== index));
  }

  function accountLabel(index: number) {
    return (
      accounts[index]?.name.trim() ||
      (index === 0 ? "기본 계좌" : `계좌 ${index + 1}`)
    );
  }

  function found() {
    setError(null);
    startTransition(async () => {
      const res = await foundCompany({
        name,
        foundedAt: today,
        stocks: [],
        cash: 0,
        accounts,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreatedAccounts(res.accounts ?? []);
      setStep("J2_5");
    });
  }

  // ── J1: 회사명 ──
  if (step === "J1") {
    return (
      <Shell
        title="회사의 이름을 새기세요"
        onBack={undefined}
        progress={{ current: 1, total: 3 }}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          워런 버핏에게 버크셔가 있었듯, 당신의 지주회사에도 이름이 필요합니다.
        </p>
        <div className="my-10 text-center">
          <span className="text-3xl font-extrabold tracking-tight">
            {name || <span className="text-muted-foreground/40">바름캐피탈</span>}
          </span>
        </div>
        <Input
          autoFocus
          placeholder="회사명"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 text-center text-lg"
        />
        <Button
          onClick={() => setStep("J2")}
          disabled={!name.trim()}
          className="mt-6 h-13 w-full bg-primary py-4 text-base font-semibold text-primary-foreground"
        >
          회사 설립하기
        </Button>
      </Shell>
    );
  }

  // ── J2: 계좌 등기 ──
  if (step === "J2") {
    return (
      <Shell
        title="계좌를 등기합니다"
        onBack={() => setStep("J1")}
        progress={{ current: 2, total: 3 }}
      >
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          보유한 증권사·연금·ISA 계좌를 등기하세요. 종목은 설립 후에 추가할 수 있어요.
        </p>

        <div className="flex flex-col gap-3">
          {accounts.map((account, index) => (
            <div key={index} className="rounded-2xl bg-card p-4 shadow-card-sm">
              <div className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <Building2 size={18} strokeWidth={1.75} />
                </span>
                <Input
                  value={account.name}
                  onChange={(e) => updateAccount(index, { name: e.target.value })}
                  placeholder={index === 0 ? "기본 계좌" : `계좌 ${index + 1}`}
                  aria-label={`${index + 1}번째 계좌 이름`}
                  className="h-10 min-w-0 flex-1 border-0 bg-secondary"
                />
                {accounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAccount(index)}
                    aria-label={`${index + 1}번째 계좌 삭제`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition active:scale-95"
                  >
                    <Trash2 size={17} strokeWidth={1.75} />
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ACCOUNT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateAccount(index, { accountType: type as AccountType })}
                    className={
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                      (account.accountType === type
                        ? "bg-foreground text-background"
                        : "bg-secondary text-secondary-foreground")
                    }
                  >
                    {ACCOUNT_TYPE_LABEL[type]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAccounts((prev) => [...prev, { name: "", accountType: "GENERAL" }])}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-semibold transition active:scale-[0.98]"
        >
          <Plus size={17} strokeWidth={1.75} /> 계좌 추가
        </button>

        {error && <p className="mt-4 text-sm text-rise">{error}</p>}

        <Button
          onClick={found}
          disabled={pending}
          className="mt-6 h-13 w-full bg-primary py-4 text-base font-semibold text-primary-foreground"
        >
          {pending ? "등기 중…" : "설립 등기 완료"}
        </Button>
      </Shell>
    );
  }

  // ── J2.5: 설립 의식 ──
  if (step === "J2_5") return (
    <Shell>
      <div className="animate-fade-in overflow-hidden rounded-3xl bg-card shadow-card-md">
        <div className="relative flex h-56 items-center justify-center overflow-hidden bg-accent">
          <span className="absolute left-5 top-5 rounded-full bg-card/80 px-3 py-1 text-[11px] font-bold tracking-wide text-primary shadow-card-sm">
            COMPANY FOUNDED
          </span>
          <Image
            src="/images/founding-charter.png"
            alt="등기증서와 인가 도장 3D 일러스트"
            width={260}
            height={260}
            priority
            className="mt-6 h-52 w-52 object-contain drop-shadow-[0_14px_24px_rgba(49,130,246,0.18)]"
          />
          <span className="absolute bottom-4 right-5 inline-flex animate-stamp rotate-[-7deg] items-center border-2 border-primary bg-card/90 px-3 py-1.5 text-xs font-extrabold tracking-wider text-primary shadow-card-sm">
            설립 인가
          </span>
        </div>

        <div className="relative p-6 pt-7 text-center">
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-primary">
            <Award size={15} strokeWidth={1.75} /> 첫 업적 · 투자회사 설립
          </div>
          <p className="mt-5 text-xs font-semibold tracking-[0.18em] text-muted-foreground">
            법인 등기증서
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight">{name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            개인 투자 지주회사의 설립을 정식으로 인가합니다.
          </p>

          <div className="my-6 h-px bg-border" />
          <dl className="space-y-2 text-left text-sm">
            <Row k="설립일" v={today} />
            <Row k="등기 계좌" v={`${accounts.length}개`} />
            <Row k="대표이사" v="나" />
          </dl>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {accounts.map((account, index) => (
              <span
                key={index}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold"
              >
                {accountLabel(index)} · {ACCOUNT_TYPE_LABEL[account.accountType]}
              </span>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-secondary p-4">
            <p className="font-bold">{name}이(가) 설립되었습니다.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              오늘부터 당신은 이 회사의 CEO입니다.
            </p>
          </div>
        </div>
      </div>
      <Button
        onClick={() => setStep("J3")}
        className="mt-6 h-13 w-full bg-primary py-4 text-base font-semibold text-primary-foreground"
      >
        CEO로 취임하기
      </Button>
    </Shell>
  );

  // ── J3: 보유 종목 등기 제안 ──
  if (step === "J3") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center p-8 text-center">
        {/* 아이콘 */}
        <span className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-accent text-primary">
          <TrendingUp size={40} strokeWidth={1.5} />
        </span>

        <h1 className="text-2xl font-extrabold tracking-tight">
          보유 종목을 등기할까요?
        </h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
          지금 가진 종목을 추가하면 오늘부터 수익률 추적이 시작돼요. 나중에도 언제든 추가할 수 있어요.
        </p>

        <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
          <Button
            onClick={() => setStep("J4")}
            className="h-13 w-full bg-primary py-4 text-base font-semibold text-primary-foreground"
          >
            지금 등기하기
          </Button>
          <button
            type="button"
            onClick={() => router.push("/dashboard?welcome=1")}
            className="h-11 w-full rounded-xl text-sm font-medium text-muted-foreground transition active:opacity-60"
          >
            나중에 하기
          </button>
        </div>
      </main>
    );
  }

  // ── J4: BuyWizard ──
  if (step === "J4") {
    return (
      <BuyWizard
        mode="ledger"
        today={today}
        accounts={createdAccounts}
        pools={{ KRW: 0 }}
        fxRates={fxRates}
        prices={prices}
        names={{}}
        defaultFundingSource="deposit"
        returnTo="/dashboard?welcome=1"
        onExit={() => setStep("J3")}
      />
    );
  }
}

/* ── 보조 컴포넌트 ── */

function Shell({
  title,
  onBack,
  progress,
  children,
}: {
  title?: string;
  onBack?: () => void;
  progress?: { current: number; total: number };
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col p-6">
      {(onBack || progress) && (
        <div className="mb-2 flex items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 text-2xl leading-none text-muted-foreground"
              aria-label="이전"
            >
              ‹
            </button>
          ) : (
            <span className="w-2" />
          )}
          {progress && (
            <div className="flex flex-1 justify-center gap-1.5">
              {Array.from({ length: progress.total }).map((_, i) => (
                <span
                  key={i}
                  className={
                    "h-2 rounded-full transition-all " +
                    (i === progress.current ? "w-5 bg-foreground" : "w-2 bg-border")
                  }
                />
              ))}
            </div>
          )}
          {progress && <span className="w-2" />}
        </div>
      )}
      {title && (
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight">{title}</h1>
      )}
      <div className="flex-1">{children}</div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border pb-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}
