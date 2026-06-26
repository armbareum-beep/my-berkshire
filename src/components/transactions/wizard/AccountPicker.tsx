"use client";

import { Avatar } from "@/components/ui/Avatar";
import { BrokerChip } from "@/components/accounts/BrokerSelect";
import { ACCOUNT_TYPE_LABEL } from "@/lib/config/tax";
import type { AccountOption } from "@/components/transactions/TransactionFlow";

/**
 * 거래 위저드의 "어느 계좌인가요?" 선택 — 알약 대신 카드식 세로 리스트.
 * 증권사 로고(미지정 시 이름 아바타) + 이름 + 분류 배지로 어떤 계좌인지 한눈에.
 * accounts 페이지(AccountRow) 행과 같은 톤. 선택은 호출측이 onSelect 안에서 처리(부수효과 유지).
 */
export function AccountPicker({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: AccountOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {accounts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onSelect(a.id)}
          className={
            "flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card transition active:scale-[0.99] " +
            (a.id === selectedId ? "ring-2 ring-primary" : "")
          }
        >
          {a.broker ? (
            <BrokerChip id={a.broker} />
          ) : (
            <Avatar name={a.name} size="lg" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bold">{a.name}</span>
            <span className="truncate text-sm text-muted-foreground">
              {ACCOUNT_TYPE_LABEL[a.accountType]}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
