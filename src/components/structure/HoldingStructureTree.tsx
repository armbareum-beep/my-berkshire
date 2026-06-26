import Link from "next/link";
import { Building2 } from "lucide-react";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { money, type Currency } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "@/lib/config/tax";
import { qtyUnit } from "@/lib/securities";
import type { AccountGroup } from "@/lib/accounts";
import type { Holding } from "@/lib/holdings";

/**
 * 지배구조도 — 지주회사 → 계좌 → 자회사(종목) 계통도.
 * 등급·순위·판단 없는 순수 구조 시각화(⑦ 로망). 모바일 480px 정석인 세로 들여쓰기 트리.
 * 데이터는 loadAccountGroups(AccountGroup[]) 재사용, 새 쿼리 없음.
 */
export function HoldingStructureTree({
  holding,
  groups,
  currency,
  active = false,
}: {
  holding: Holding;
  groups: AccountGroup[];
  currency: Currency;
  active?: boolean;
}) {
  const total = groups.reduce((s, g) => s + g.value, 0);

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">지배구조</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            지주회사 → 계좌 → 자회사
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

      {/* 2층 — 계좌(가지) */}
      <div className="mt-1 ml-4 flex flex-col border-l border-border pl-4">
        {groups.map((g) => (
          <details key={g.id} open className="group py-1">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                {ACCOUNT_TYPE_LABEL[g.accountType]}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{g.name}</span>
                <span className="text-xs text-muted-foreground">
                  자회사 {g.holdings.length}개
                </span>
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="text-sm font-medium tabular-nums">
                  {money(g.value, currency)}
                </span>
                <span className="text-muted-foreground transition group-open:rotate-90">
                  ›
                </span>
              </span>
            </summary>

            {/* 3층 — 자회사(종목, 잎) */}
            <ul className="ml-3.5 flex flex-col border-l border-border pl-3">
              {g.holdings.length === 0 ? (
                <li className="py-1.5 text-xs text-muted-foreground">
                  보유 종목 없음
                </li>
              ) : (
                g.holdings.map((h) => (
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
        ))}
      </div>
    </section>
  );
}
