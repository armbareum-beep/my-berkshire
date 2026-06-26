"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/components/structure/HoldingStructureTree";
import {
  deleteMember,
  updateMember,
  setMemberIncluded,
} from "@/app/company/actions";
import {
  money,
  signedMoneyShort,
  pct,
  changeColor,
  type Currency,
} from "@/lib/format";

export interface MemberRowData {
  id: string;
  name: string;
  emoji: string | null;
  included: boolean;
  /** 보유 평가액(표시통화). */
  value: number;
  /** 평단 대비 등락(소수). null = 평단확인 보유 없음. */
  changeRate: number | null;
  /** 평가차익(표시통화). */
  gain: number | null;
  accountCount: number;
}

/**
 * 컴퍼니 1행 — CEO 아바타·이름, 보유 평가액, 평단 대비 수익률(중립 표기 — 순위·점수 없음),
 * 합산 포함 토글. '수정' 누르면 이름·이모지 인라인 편집. AccountRow 패턴 차용.
 * showToggle: 컴퍼니 2개 이상일 때만 토글·삭제 노출(1개면 의미 없음).
 */
export function MemberRow({
  member,
  currency = "KRW",
  showToggle = true,
}: {
  member: MemberRowData;
  currency?: Currency;
  showToggle?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [emoji, setEmoji] = useState(member.emoji ?? "");

  function reset() {
    setName(member.name);
    setEmoji(member.emoji ?? "");
  }

  function save() {
    startTransition(async () => {
      const res = await updateMember(member.id, name, emoji);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("컴퍼니가 수정되었습니다");
      setEditing(false);
      router.refresh();
    });
  }

  function toggle() {
    startTransition(async () => {
      const res = await setMemberIncluded(member.id, !member.included);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteMember(member.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("컴퍼니가 삭제되었습니다");
      router.refresh();
    });
  }

  if (editing) {
    return (
      <li className="rounded-2xl bg-card p-4 shadow-card">
        <label className="text-sm font-medium">컴퍼니(CEO) 이름</label>
        <div className="mt-2 flex gap-2">
          <Input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
            placeholder="🙂"
            aria-label="이모지"
            className="h-12 w-16 text-center text-xl"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 flex-1"
          />
        </div>
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
          {showToggle && (
            <Button
              onClick={remove}
              disabled={pending}
              className="h-11 bg-secondary px-4 font-semibold text-destructive"
            >
              삭제
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <li
      className={
        "flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card " +
        (member.included ? "" : "opacity-60")
      }
    >
      <MemberAvatar name={member.name} emoji={member.emoji} />
      <span className="flex min-w-0 flex-col">
        <span className="font-bold">{member.name} 컴퍼니</span>
        <span className="truncate text-sm text-muted-foreground">
          CEO {member.name} · 계좌 {member.accountCount}개
        </span>
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="flex flex-col items-end">
          <span className="font-semibold tabular-nums">
            {money(member.value, currency)}
          </span>
          {member.changeRate !== null ? (
            <span
              className="text-sm font-medium tabular-nums"
              style={{ color: changeColor(member.changeRate) }}
            >
              {signedMoneyShort(member.gain ?? 0, currency)} (
              {pct(Math.abs(member.changeRate))})
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">보유 없음</span>
          )}
        </span>
        {showToggle && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={member.included}
            aria-label={member.included ? "합산에서 제외" : "합산에 포함"}
            className={
              "relative h-6 w-11 shrink-0 rounded-full transition " +
              (member.included ? "bg-primary" : "bg-secondary")
            }
          >
            <span
              className={
                "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition " +
                (member.included ? "left-[22px]" : "left-0.5")
              }
            />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            reset();
            setEditing(true);
          }}
          className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground"
        >
          수정
        </button>
      </span>
    </li>
  );
}
