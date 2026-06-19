"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAccount } from "@/app/accounts/actions";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  type AccountType,
} from "@/lib/config/tax";
import { BrokerSelect } from "@/components/accounts/BrokerSelect";

/** 계좌 추가 폼 — 이름 + 유형 + 증권사. */
export function AccountManager() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("GENERAL");
  const [broker, setBroker] = useState<string | null>(null);
  const [pct, setPct] = useState("0.015"); // 위탁수수료율 % (기본 0.015%)

  function add() {
    startTransition(async () => {
      const res = await createAccount(
        name,
        type,
        pct.trim() === "" ? undefined : Number(pct) / 100,
        broker,
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
