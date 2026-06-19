"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  QuickAdd,
  WON_STEPS,
  QTY_STEPS,
  wonStepLabel,
  priceStepsFor,
} from "@/components/ui/QuickAdd";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { SymbolSearch } from "@/components/onboarding/SymbolSearch";
import { BuyWizard } from "@/components/transactions/wizard/BuyWizard";
import { NumberPadField } from "@/components/ui/NumberPad";
import { IconChip } from "@/components/transactions/eventIcons";
import { CountUp } from "@/components/ui/CountUp";
import {
  Award,
  BookText,
  Building2,
  Link2,
  Plus,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  foundCompany,
  type CreatedAccount,
  type FoundingAccount,
  type FoundingStock,
} from "./actions";
import { useMarketPrice } from "@/lib/finance/useMarketPrice";
import type { CatalogItem } from "@/lib/finance/catalog";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  type AccountType,
} from "@/lib/config/tax";

type Step = "J0" | "J1" | "J2" | "J2_5" | "J3" | "J4";
type Mode = "challenge" | "ledger";

/**
 * 첫 5분 강제 여정 — /docs/user-rails-v1.md 1번 J0~J5.
 * 끊김 없는 단방향 레일. 온보딩엔 하단 탭바 없음(이탈 방지).
 */
export function OnboardingRail({
  today,
  prices,
  additionalCompany = false,
}: {
  today: string;
  /** 카탈로그 종목 현재가(서버 조회 전달). 챌린지 가격 고정용. */
  prices: Record<string, number>;
  /** 기존 사용자가 추가 회사를 설립하는 흐름. 첫 단계 뒤로가기는 회사 관리로 복귀한다. */
  additionalCompany?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("J0");
  const [mode, setMode] = useState<Mode | null>(null);
  const [name, setName] = useState("");
  const [foundedAt, setFoundedAt] = useState(today);
  const [hasStocks, setHasStocks] = useState<boolean | null>(null);
  const [stocks, setStocks] = useState<FoundingStock[]>([]);
  const [cash, setCash] = useState("");
  const [accounts, setAccounts] = useState<FoundingAccount[]>([
    { name: "", accountType: "GENERAL" },
  ]);
  const [createdAccounts, setCreatedAccounts] = useState<CreatedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 종목 추가 임시 상태
  const [adding, setAdding] = useState<CatalogItem | null>(null);
  const [addQty, setAddQty] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addDate, setAddDate] = useState(today);
  const [addAccountIndex, setAddAccountIndex] = useState(0);

  // 검색으로 고른 종목 포함 — 카탈로그에 없으면 즉시 시세 조회(챌린지 평단 고정용).
  const addMarket = useMarketPrice(adding?.symbol ?? null, prices);

  function addStock() {
    if (!adding) return;
    const q = Number(addQty);
    // 챌린지는 평단을 현재 시세로 고정. 장부는 입력값.
    const p = mode === "challenge" ? (addMarket ?? 0) : Number(addPrice);
    if (q <= 0 || p <= 0) return;
    setStocks((prev) => [
      ...prev,
      {
        symbol: adding.symbol,
        name: adding.name,
        quantity: q,
        avgPrice: p,
        buyDate: mode === "ledger" ? addDate : undefined,
        accountIndex: addAccountIndex,
      },
    ]);
    setAdding(null);
    setAddQty("");
      setAddPrice("");
      setAddDate(today);
    setAddAccountIndex(0);
  }

  function updateAccount(index: number, patch: Partial<FoundingAccount>) {
    setAccounts((prev) =>
      prev.map((account, i) => (i === index ? { ...account, ...patch } : account)),
    );
  }

  function removeAccount(index: number) {
    if (accounts.length === 1) return;
    setAccounts((prev) => prev.filter((_, i) => i !== index));
    setStocks((prev) =>
      prev.map((stock) => {
        const current = stock.accountIndex ?? 0;
        if (current === index) return { ...stock, accountIndex: 0 };
        if (current > index) return { ...stock, accountIndex: current - 1 };
        return stock;
      }),
    );
    setAddAccountIndex(0);
  }

  function accountLabel(index: number) {
    return (
      accounts[index]?.name.trim() ||
      (index === 0 ? "기본 계좌" : `계좌 ${index + 1}`)
    );
  }

  function found() {
    if (!mode) return;
    setError(null);
    startTransition(async () => {
      const res = await foundCompany({
        mode,
        name,
        foundedAt: mode === "challenge" ? today : foundedAt,
        stocks: hasStocks ? stocks : [],
        cash: hasStocks ? Number(cash) || 0 : 0,
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

  // ── J0: 모드 선택 ──
  if (step === "J0") {
    return (
      <Shell
        title="어떻게 시작할까요?"
        onBack={additionalCompany ? () => router.push("/company") : undefined}
        progress={{ current: 0, total: 3 }}
      >
        <div className="flex flex-col gap-3">
          <ModeCard
            icon={TrendingUp}
            label="챌린지로 시작"
            desc="돈 없이 오늘부터 가상 투자. 남과 경쟁할 수 있어요."
            onClick={() => {
              setMode("challenge");
              setFoundedAt(today);
              setStep("J1");
            }}
          />
          <ModeCard
            icon={BookText}
            label="장부로 시작"
            desc="지금 보유 종목·평단을 넣어 과거 수익률 확인. 나·시장과 경쟁."
            onClick={() => {
              setMode("ledger");
              setStep("J1");
            }}
          />
          <div className="mt-1 flex items-center gap-3 rounded-2xl bg-card p-4 opacity-50 shadow-card">
            <IconChip icon={Link2} size="lg" />
            <div>
              <p className="font-bold">라이브 (연동)</p>
              <p className="text-sm text-muted-foreground">준비 중</p>
            </div>
          </div>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            나중에 다른 회사도 설립할 수 있어요.
          </p>
        </div>
      </Shell>
    );
  }

  // ── J1: 회사명 ──
  if (step === "J1") {
    return (
      <Shell
        title="회사의 이름을 새기세요"
        onBack={() => setStep("J0")}
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

  // ── J2: 설립 등기 ──
  if (step === "J2") {
    // 종목 추가 화면
    if (hasStocks && adding) {
      return (
        <Shell title="보유 종목 등기" onBack={() => setAdding(null)}>
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-secondary p-3">
            <SymbolAvatar name={adding.name} />
            <span className="flex flex-col">
              <span className="font-bold">{adding.name}</span>
              <span className="text-sm text-muted-foreground">{adding.symbol}</span>
            </span>
          </div>
          {mode === "challenge" ? (
            <div className="mb-4">
              <label className="text-sm font-medium">현재가 (원)</label>
              <p className="mt-2 flex h-12 items-center rounded-xl bg-secondary px-3 text-lg font-bold tabular-nums">
                {addMarket != null
                  ? `₩${addMarket.toLocaleString()}`
                  : "시세 불러오는 중"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                챌린지는 오늘 시세로 등기합니다.
              </p>
            </div>
          ) : (
            <div className="mb-4">
              <NumberPadField
                label="평균단가 (원)"
                value={addPrice}
                onChange={setAddPrice}
                prefix="₩"
                decimal
                placeholder="탭해서 평단 입력"
              />
              {adding && (
                <QuickAdd
                  value={addPrice}
                  onChange={setAddPrice}
                  {...priceStepsFor(adding.symbol)}
                />
              )}
            </div>
          )}
          <NumberPadField
            label="수량 (주)"
            value={addQty}
            onChange={setAddQty}
            suffix="주"
            placeholder="탭해서 수량 입력"
          />
          <QuickAdd value={addQty} onChange={setAddQty} steps={QTY_STEPS} />
          {accounts.length > 1 && (
            <div className="mt-4">
              <p className="text-sm font-medium">어느 계좌에 등기할까요?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {accounts.map((account, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setAddAccountIndex(index)}
                    className={
                      "rounded-full px-3 py-1.5 text-sm font-semibold transition " +
                      (addAccountIndex === index
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground")
                    }
                  >
                    {accountLabel(index)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === "ledger" && (
            <>
              <label className="mt-4 block text-sm font-medium">
                매수일 <span className="text-muted-foreground">(선택)</span>
              </label>
              <Input
                type="date"
                max={today}
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                className="mt-2 h-12"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                실제 매수일을 넣으면 그 시점부터 굴린 걸로 잡혀 수익률(XIRR)이 더
                정확해져요. 비우면 설립일로 기록돼요.
              </p>
            </>
          )}
          <Button
            onClick={addStock}
            disabled={
              Number(addQty) <= 0 ||
              (mode === "ledger" && Number(addPrice) <= 0)
            }
            className="mt-6 h-12 w-full bg-primary font-semibold text-primary-foreground"
          >
            등기에 추가
          </Button>
        </Shell>
      );
    }

    // 종목 선택 화면
    if (hasStocks && stocks.length === 0 && !adding) {
      // 첫 종목 고르기
    }

    return (
      <Shell
        title="설립을 등기합니다"
        onBack={() => setStep("J1")}
        progress={{ current: 2, total: 3 }}
      >
        {/* 장부 모드 안내 — 무엇을 넣으면 과거 수익률이 보이는지 */}
        {mode === "ledger" && (
          <div className="mb-6 rounded-xl bg-accent p-4 text-sm leading-relaxed text-accent-foreground">
            <p className="font-semibold">장부는 내 실제 기록이에요</p>
            <p className="mt-1">
              지금 보유한 종목·평단·매수일을 넣으면 과거 수익률이 바로 계산돼요.
              설립일은 <b>투자를 시작한 날</b>로 잡으세요.
            </p>
          </div>
        )}

        {/* 설립일 */}
        <div className="mb-6">
          <p className="text-sm font-medium">설립일</p>
          {mode === "challenge" ? (
            <p className="mt-2 rounded-xl bg-secondary p-3 text-lg font-bold">오늘 ({today})</p>
          ) : (
            <>
              <Input
                type="date"
                max={today}
                value={foundedAt}
                onChange={(e) => setFoundedAt(e.target.value)}
                className="mt-2 h-12"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                투자를 시작한 날. 종목 매수일이 더 이르면 그 날로 자동 보정돼요.
              </p>
            </>
          )}
        </div>

        {/* 계좌 등기 — 자회사(종목)를 담는 그릇 */}
        <div className="mb-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium">계좌</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                증권사·연금·ISA 계좌를 설립과 함께 등기하세요.
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-primary">
              {accounts.length}개
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {accounts.map((account, index) => (
              <div
                key={index}
                className="rounded-2xl bg-card p-4 shadow-card-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                    <Building2 size={18} strokeWidth={1.75} />
                  </span>
                  <Input
                    value={account.name}
                    onChange={(event) =>
                      updateAccount(index, { name: event.target.value })
                    }
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
                      onClick={() =>
                        updateAccount(index, { accountType: type as AccountType })
                      }
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
            onClick={() =>
              setAccounts((prev) => [
                ...prev,
                { name: "", accountType: "GENERAL" },
              ])
            }
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-semibold transition active:scale-[0.98]"
          >
            <Plus size={17} strokeWidth={1.75} /> 계좌 추가
          </button>
        </div>

        {/* 보유 종목 등기 */}
        <p className="text-sm font-medium">지금 갖고 계신 종목이 있나요?</p>
        {hasStocks === null && (
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="secondary"
              onClick={() => setHasStocks(true)}
              className="h-12 w-full font-semibold"
            >
              있음 — 등기하기
            </Button>
            <Button
              variant="secondary"
              onClick={() => setHasStocks(false)}
              className="h-12 w-full font-semibold"
            >
              보유 종목 없음
            </Button>
          </div>
        )}

        {hasStocks && (
          <div className="mt-3">
            {stocks.length > 0 && (
              <ul className="mb-3 flex flex-col gap-2">
                {stocks.map((s, i) => (
                  <li
                    key={`${s.symbol}-${i}`}
                    className="flex items-center gap-3 rounded-xl bg-secondary p-3"
                  >
                    <SymbolAvatar name={s.name} />
                    <span className="flex flex-col">
                      <span className="font-bold">{s.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {s.quantity}주 · 평단 {s.avgPrice.toLocaleString()} ·{" "}
                        {accountLabel(s.accountIndex ?? 0)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setStocks((p) => p.filter((_, j) => j !== i))}
                      className="ml-auto text-sm text-muted-foreground underline"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-xl border border-border p-2">
              <SymbolSearch onSelect={(item) => setAdding(item)} />
            </div>
            <div className="mt-4">
              <NumberPadField
                label="현금 보유 (선택, 원)"
                value={cash}
                onChange={setCash}
                prefix="₩"
                placeholder="0"
              />
            </div>
            <QuickAdd
              value={cash}
              onChange={setCash}
              steps={WON_STEPS}
              label={wonStepLabel}
            />
          </div>
        )}

        {error && <p className="mt-4 text-sm text-rise">{error}</p>}

        {hasStocks !== null && (
          <Button
            onClick={found}
            disabled={pending}
            className="mt-6 h-13 w-full bg-primary py-4 text-base font-semibold text-primary-foreground"
          >
            {pending
              ? "등기 중…"
              : hasStocks
                ? "설립 등기 완료"
                : "보유 종목 없이 설립"}
          </Button>
        )}
      </Shell>
    );
  }

  // ── J2.5: 설립 의식 ──
  if (step === "J2_5") {
    const stockCost = stocks.reduce((s, x) => s + x.quantity * x.avgPrice, 0);
    const capital = (hasStocks ? stockCost + (Number(cash) || 0) : 0);
    return (
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
              <Row k="설립일" v={mode === "challenge" ? today : foundedAt} />
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">설립 자본</dt>
                <dd>
                  <CountUp
                    value={capital}
                    format="money"
                    currency="KRW"
                    className="font-semibold"
                  />
                </dd>
              </div>
              <Row k="등기 계좌" v={`${accounts.length}개`} />
              <Row k="자회사 수" v={`${hasStocks ? stocks.length : 0}개`} />
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
          onClick={() => {
            // 등기에서 이미 자회사를 넣었으면 첫 인수는 끝난 것 → 바로 대시보드.
            // 종목 없이 설립한 경우만 첫 인수(J3) 제안.
            if (hasStocks && stocks.length > 0)
              router.push("/dashboard?welcome=1");
            else setStep("J3");
          }}
          className="mt-6 h-13 w-full bg-primary py-4 text-base font-semibold text-primary-foreground"
        >
          CEO로 취임하기
        </Button>
      </Shell>
    );
  }

  // ── J3: 첫 인수 제안 ──
  if (step === "J3") {
    return (
      <Shell title="첫 자산을 매수할까요?">
        <p className="text-sm leading-relaxed text-muted-foreground">
          회사가 세워졌습니다. 이제 첫 자산(주식·ETF·코인)을 매수해 포트폴리오를 시작하세요.
        </p>
        <Button
          onClick={() => setStep("J4")}
          className="mt-8 h-13 w-full bg-primary py-4 text-base font-semibold text-primary-foreground"
        >
          첫 매수 기록하기
        </Button>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-4 w-full text-center text-sm text-muted-foreground underline"
        >
          나중에 하기
        </button>
      </Shell>
    );
  }

  // ── J4: 실제 거래 화면과 같은 단계형 매수 위저드 ──
  return (
    <BuyWizard
      mode={mode ?? "challenge"}
      today={today}
      accounts={createdAccounts}
      pools={{ KRW: Number(cash) || 0 }}
      fxRates={{}}
      prices={prices}
      names={{}}
      defaultFundingSource="deposit"
      returnTo="/dashboard?welcome=1"
      onExit={() => setStep("J3")}
    />
  );
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
  /** 설립 레일 진행 점(J0~J2). 없으면 숨김. */
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

function ModeCard({
  icon,
  label,
  desc,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <IconChip icon={icon} size="lg" />
      <div>
        <p className="font-bold">{label}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </button>
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
