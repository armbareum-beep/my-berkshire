import Link from "next/link";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { BrokerChip } from "@/components/accounts/BrokerSelect";
import {
  money,
  signedMoneyShort,
  pct,
  changeColor,
  type Currency,
} from "@/lib/format";
import { qtyUnit } from "@/lib/securities";
import { ACCOUNT_TYPE_LABEL } from "@/lib/config/tax";
import type { AccountGroup } from "@/lib/accounts";

/** 계좌별 접이식 보유목록 — 토스식 "이 계좌에 얼마". 네이티브 details 로 접기/펴기. */
export function AccountGroups({
  groups,
  currency,
  bare = false,
  singleOpen = false,
  memberNames,
}: {
  groups: AccountGroup[];
  currency: Currency;
  /** 다른 카드 안에 넣을 때(껍데기 제거·그룹 사이 구분선). */
  bare?: boolean;
  /**
   * 한 번에 한 계좌만 펼침(배타 아코디언) — 홈 카드용. JS 없이 HTML `<details name>`
   * 으로 라디오처럼 하나만 열림. 기본은 첫 계좌만 펼쳐 카드가 비어 보이지 않게.
   * false(기본)면 전부 펼침(전체 보기 — /networth).
   */
  singleOpen?: boolean;
  /** 계좌 주인(컴퍼니) 표시용 memberId→{name,emoji}. 컴퍼니 2개 이상일 때만 칩 노출. */
  memberNames?: Record<string, { name: string; emoji: string | null }>;
}) {
  // 컴퍼니가 2개 이상 표현될 때만 칩(1개면 노이즈).
  const showMemberChip =
    !!memberNames &&
    new Set(groups.map((g) => g.memberId).filter(Boolean)).size > 1;
  return (
    <div className={bare ? "flex flex-col" : "flex flex-col gap-2"}>
      {groups.map((g, i) => (
        <details
          key={g.id}
          name={singleOpen ? "dash-account" : undefined}
          open={singleOpen ? i === 0 : true}
          className={
            bare
              ? `group${i > 0 ? " border-t border-border" : ""}`
              : "group rounded-2xl bg-card shadow-card"
          }
        >
          <summary
            className={
              "flex cursor-pointer list-none items-center gap-3 " +
              (bare ? "py-3" : "p-4")
            }
          >
            {/* 계좌는 증권사 로고로(accounts 페이지와 동일), 미지정이면 이름 글자 폴백 */}
            {g.broker ? (
              <BrokerChip id={g.broker} />
            ) : (
              <SymbolAvatar name={g.name} />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-1.5 font-bold">
                <span className="truncate">{g.name}</span>
                {showMemberChip && g.memberId && memberNames?.[g.memberId] && (
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                    {memberNames[g.memberId].emoji
                      ? `${memberNames[g.memberId].emoji} `
                      : ""}
                    {memberNames[g.memberId].name}
                  </span>
                )}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {ACCOUNT_TYPE_LABEL[g.accountType]} · 자회사 {g.holdings.length}개
              </span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <span className="flex flex-col items-end">
                <span className="font-semibold tabular-nums">
                  {money(g.value, currency)}
                </span>
                {g.changeRate !== null && (
                  <span
                    className="text-sm font-medium tabular-nums"
                    style={{ color: changeColor(g.changeRate) }}
                  >
                    {signedMoneyShort(g.gain ?? 0, currency)} (
                    {pct(Math.abs(g.changeRate))})
                  </span>
                )}
              </span>
              <span className="text-muted-foreground transition group-open:rotate-90">
                ›
              </span>
            </span>
          </summary>

          {/* 종목 = 자회사(잎). 들여쓰기 + 좌측 세로선으로 계좌 아래 가지임을 시각화. */}
          <ul
            className={
              "flex flex-col gap-1 border-l border-border pb-3 " +
              (bare ? "ml-5 pl-3" : "ml-9 mr-4 pl-3")
            }
          >
            {g.holdings.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">보유 종목 없음</li>
            ) : (
              g.holdings.map((h) => (
                <li key={h.symbol}>
                  <Link
                    href={`/stocks/${h.symbol}`}
                    scroll={false}
                    className="flex items-center gap-3 rounded-xl py-2 transition active:scale-[0.99]"
                  >
                    <SymbolAvatar name={h.name} symbol={h.symbol} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{h.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {h.quantity.toLocaleString()}
                        {qtyUnit(h.symbol)}
                      </span>
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="flex flex-col items-end">
                        <span className="font-semibold tabular-nums">
                          {money(h.value, currency)}
                        </span>
                        {h.changeRate !== null && (
                          <span
                            className="text-sm font-medium tabular-nums"
                            style={{ color: changeColor(h.changeRate) }}
                          >
                            {signedMoneyShort(h.gain ?? 0, currency)} (
                            {pct(Math.abs(h.changeRate))})
                          </span>
                        )}
                      </span>
                      {/* 상세 진입 표식 — 작고 연하게(선주의 배경으로). 계좌 summary › 보다 약한 위계 */}
                      <span className="text-sm text-muted-foreground/50">›</span>
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </details>
      ))}
    </div>
  );
}
