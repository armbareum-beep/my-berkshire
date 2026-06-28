"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/Avatar";
import { updateAccount } from "@/app/accounts/actions";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  type AccountType,
} from "@/lib/config/tax";
import { findBroker } from "@/lib/config/brokers";
import { money, type Currency } from "@/lib/format";
import { BrokerSelect, BrokerChip } from "@/components/accounts/BrokerSelect";
import type { MemberOption } from "@/components/accounts/AccountManager";

export interface AccountRowData {
  id: string;
  name: string;
  accountType: AccountType;
  /** 수수료율(소수, 0.00015 = 0.015%). */
  commissionRate: number;
  /** 증권사 id(lib/config/brokers). null = 직접 입력. */
  broker: string | null;
  /** 소속 컴퍼니 id. null = 미지정(기본 컴퍼니). */
  memberId: string | null;
}

/** % 표기(소수 rate → 퍼센트 문자열). 0.00015 → "0.015". */
function toPct(rate: number): string {
  return String(Math.round(rate * 100 * 1000) / 1000);
}

/**
 * 계좌 1행 — 평소엔 요약(평가액·종목 수), 탭하면 계좌 상세(/accounts/[id])로.
 * '수정' 누르면 이름·유형·수수료율 인라인 편집. 종목 수십 개여도 리스트는 상세 페이지로 분리.
 */
export function AccountRow({
  account,
  members = [],
  holdingsCount = 0,
  accountValue,
  currency = "KRW",
  deleteButton,
}: {
  account: AccountRowData;
  members?: MemberOption[];
  holdingsCount?: number;
  accountValue?: number;
  currency?: Currency;
  deleteButton?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<AccountType>(account.accountType);
  const [broker, setBroker] = useState<string | null>(account.broker);
  const [pct, setPct] = useState(toPct(account.commissionRate));
  const [memberId, setMemberId] = useState<string>(account.memberId ?? "");

  function reset() {
    setName(account.name);
    setType(account.accountType);
    setBroker(account.broker);
    setPct(toPct(account.commissionRate));
    setMemberId(account.memberId ?? "");
  }

  function save() {
    startTransition(async () => {
      const res = await updateAccount(
        account.id,
        name,
        type,
        Number(pct) / 100,
        broker,
        memberId || null,
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("계좌가 수정되었습니다");
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <li className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
        {/* 계좌 정보 영역 — 탭하면 계좌 상세(종목 목록)로. 수정 버튼은 링크 밖(중첩 방지). */}
        <Link
          href={`/accounts/${account.id}`}
          className="flex flex-1 items-center gap-3 transition active:scale-[0.99]"
        >
          {account.broker ? (
            <BrokerChip id={account.broker} />
          ) : (
            <Avatar name={account.name} size="lg" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bold">{account.name}</span>
            <span className="truncate text-sm text-muted-foreground">
              {findBroker(account.broker)?.name
                ? `${findBroker(account.broker)!.name} · `
                : ""}
              {ACCOUNT_TYPE_LABEL[account.accountType]} · 자회사 {holdingsCount}개
            </span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {accountValue != null && (
              <span className="font-semibold tabular-nums whitespace-nowrap">
                {money(accountValue, currency)}
              </span>
            )}
            <span className="shrink-0 text-muted-foreground">›</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => { reset(); setEditing(true); }}
          className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground"
        >
          수정
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-2xl bg-card p-4 shadow-card">
      <label className="text-sm font-medium">계좌 이름</label>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-2 h-12"
      />

      <p className="mt-3 text-sm font-medium">유형 (세금 자동)</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ACCOUNT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={
              "rounded-full px-3 py-1.5 text-sm font-semibold " +
              (type === t
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground")
            }
          >
            {ACCOUNT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <BrokerSelect
          broker={broker}
          pct={pct}
          onBroker={setBroker}
          onPct={setPct}
        />
      </div>

      {members.length > 1 && (
        <div className="mt-3">
          <p className="text-sm font-medium">주인 컴퍼니</p>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            aria-label="주인 컴퍼니"
            className="mt-2 h-12 w-full rounded-xl bg-secondary px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/30"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.emoji ? `${m.emoji} ` : ""}
                {m.name} 컴퍼니
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          onClick={save}
          disabled={pending || !name.trim()}
          className="h-11 flex-1 bg-primary font-semibold text-primary-foreground"
        >
          {pending ? "수정 중…" : "수정 완료"}
        </Button>
        <Button
          onClick={() => setEditing(false)}
          disabled={pending}
          className="h-11 flex-1 bg-secondary font-semibold text-secondary-foreground"
        >
          취소
        </Button>
        {deleteButton}
      </div>
    </li>
  );
}
