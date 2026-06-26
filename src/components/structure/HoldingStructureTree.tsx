import Link from "next/link";
import { Building2 } from "lucide-react";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { money, type Currency } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "@/lib/config/tax";
import { qtyUnit } from "@/lib/securities";
import type { AccountGroup } from "@/lib/accounts";
import type { MemberGroup } from "@/lib/members";
import type { Holding } from "@/lib/holdings";

/**
 * 지배구조도 — 지주회사 → 컴퍼니(CEO) → 계좌 → 자회사(종목) 계통도.
 * 등급·순위·판단 없는 순수 구조 시각화. 모바일 세로 들여쓰기 트리.
 * 컴퍼니가 1개뿐이면 컴퍼니 층을 생략해 기존(지주 → 계좌 → 자회사)과 동일하게 단순 표시.
 * 데이터는 loadMemberGroups(MemberGroup[]) 재사용, 새 쿼리 없음.
 */
export function HoldingStructureTree({
  holding,
  memberGroups,
  currency,
  active = false,
}: {
  holding: Holding;
  memberGroups: MemberGroup[];
  currency: Currency;
  active?: boolean;
}) {
  const total = memberGroups.reduce((s, m) => s + m.value, 0);
  // 컴퍼니 2개 이상일 때만 컴퍼니 층을 렌더(점진적 공개).
  const showMembers = memberGroups.length > 1;
  const allAccounts = memberGroups.flatMap((m) => m.accounts);

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">지배구조</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {showMembers
              ? "지주회사 → 컴퍼니 → 계좌 → 자회사"
              : "지주회사 → 계좌 → 자회사"}
          </p>
        </div>
        {active && (
          <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-primary">
            현재 운영 중
          </span>
        )}
      </div>

      {/* 루트 — 지주회사 */}
      <div className="mt-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Building2 size={18} />
        </span>
        <span className="flex flex-col">
          <span className="font-bold">{holding.name}</span>
          <span className="text-xs text-muted-foreground">지주회사</span>
        </span>
        <span className="ml-auto font-semibold tabular-nums">
          {money(total, currency)}
        </span>
      </div>

      {showMembers ? (
        // 2층 — 컴퍼니(CEO). 그 아래 3층 계좌, 4층 자회사.
        <div className="mt-1 ml-4 flex flex-col border-l border-border pl-4">
          {memberGroups.map((m) => (
            <details key={m.member.id} open className="group py-1">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5">
                <MemberAvatar name={m.member.name} emoji={m.member.emoji} />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">
                    {m.member.name} 컴퍼니
                  </span>
                  <span className="text-xs text-muted-foreground">
                    CEO {m.member.name} · 계좌 {m.accounts.length}개
                  </span>
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="text-sm font-medium tabular-nums">
                    {money(m.value, currency)}
                  </span>
                  <span className="text-muted-foreground transition group-open:rotate-90">
                    ›
                  </span>
                </span>
              </summary>
              <div className="ml-3.5 flex flex-col border-l border-border pl-3">
                {m.accounts.map((g) => (
                  <AccountBranch key={g.id} group={g} currency={currency} />
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : (
        // 컴퍼니 1개 — 컴퍼니 층 생략, 계좌부터(기존과 동일).
        <div className="mt-1 ml-4 flex flex-col border-l border-border pl-4">
          {allAccounts.map((g) => (
            <AccountBranch key={g.id} group={g} currency={currency} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 계좌(가지) + 자회사(잎) 한 가지. */
function AccountBranch({
  group,
  currency,
}: {
  group: AccountGroup;
  currency: Currency;
}) {
  return (
    <details open className="group py-1">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
          {ACCOUNT_TYPE_LABEL[group.accountType]}
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold">{group.name}</span>
          <span className="text-xs text-muted-foreground">
            자회사 {group.holdings.length}개
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-sm font-medium tabular-nums">
            {money(group.value, currency)}
          </span>
          <span className="text-muted-foreground transition group-open:rotate-90">
            ›
          </span>
        </span>
      </summary>

      <ul className="ml-3.5 flex flex-col border-l border-border pl-3">
        {group.holdings.length === 0 ? (
          <li className="py-1.5 text-xs text-muted-foreground">
            보유 종목 없음
          </li>
        ) : (
          group.holdings.map((h) => (
            <li key={h.symbol}>
              <Link
                href={`/stocks/${h.symbol}`}
                className="flex items-center gap-2 rounded-lg py-1.5 transition active:scale-[0.99]"
              >
                <SymbolAvatar name={h.name} symbol={h.symbol} />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{h.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {h.quantity.toLocaleString()}
                    {qtyUnit(h.symbol)}
                  </span>
                </span>
                <span className="ml-auto text-sm font-semibold tabular-nums">
                  {money(h.value, currency)}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </details>
  );
}

/** 컴퍼니 아바타 — 이모지 우선, 없으면 이름 글자. */
export function MemberAvatar({
  name,
  emoji,
}: {
  name: string;
  emoji: string | null;
}) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm text-accent-foreground">
      {emoji || name.trim().charAt(0) || "·"}
    </span>
  );
}
