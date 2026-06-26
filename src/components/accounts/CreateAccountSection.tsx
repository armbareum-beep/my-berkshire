"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AccountManager,
  type MemberOption,
} from "@/components/accounts/AccountManager";

/**
 * 계좌 생성 진입 — 토스식 "새 계좌 만들기" CTA.
 * 기본은 버튼만(폼 비노출). 누르면 폼을 펼치고, 추가 성공 또는 닫기 시 다시 접는다.
 */
export function CreateAccountSection({
  members = [],
}: {
  members?: MemberOption[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="h-12 w-full bg-primary font-semibold text-primary-foreground"
      >
        계좌 만들기
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <AccountManager members={members} onAdded={() => setOpen(false)} />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-11 w-full rounded-xl text-sm font-semibold text-muted-foreground active:scale-[0.99]"
      >
        닫기
      </button>
    </div>
  );
}
