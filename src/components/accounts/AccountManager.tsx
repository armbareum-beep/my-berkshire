"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAccount } from "@/app/accounts/actions";
import { type AccountType } from "@/lib/config/tax";
import { AccountTypePicker } from "@/components/accounts/AccountTypePicker";
import { BrokerSelect } from "@/components/accounts/BrokerSelect";

export interface MemberOption {
  id: string;
  name: string;
  emoji: string | null;
}

/** 계좌 추가 폼 — 이름 + 유형 + 증권사 + (컴퍼니 2개 이상이면) 주인 컴퍼니. */
export function AccountManager({
  members = [],
  onAdded,
}: {
  members?: MemberOption[];
  /** 추가 성공 시 호출(예: 생성 섹션 접기). 없으면 폼을 그대로 유지. */
  onAdded?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("GENERAL");
  const [broker, setBroker] = useState<string | null>(null);
  const [pct, setPct] = useState("0.015"); // 위탁수수료율 % (기본 0.015%)
  const [memberId, setMemberId] = useState<string>(members[0]?.id ?? "");

  function add() {
    startTransition(async () => {
      const res = await createAccount(
        name,
        type,
        pct.trim() === "" ? undefined : Number(pct) / 100,
        broker,
        memberId || null,
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("계좌가 추가되었습니다");
      setName("");
      setType("GENERAL");
      setBroker(null);
      setPct("0.015");
      router.refresh();
      onAdded?.();
    });
  }

  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <p className="text-sm font-semibold">계좌 추가</p>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="예: 삼성증권 ISA"
        className="mt-3 h-12"
      />
      <AccountTypePicker value={type} onChange={setType} className="mt-3" />
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
          <label className="text-sm font-medium">주인 컴퍼니</label>
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
      <Button
        onClick={add}
        disabled={pending || !name.trim()}
        className="mt-4 h-12 w-full bg-primary font-semibold text-primary-foreground"
      >
        {pending ? "추가 중…" : "계좌 추가"}
      </Button>
    </div>
  );
}
