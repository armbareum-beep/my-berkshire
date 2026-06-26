"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMember } from "@/app/company/actions";

/**
 * 컴퍼니 추가·계좌 배정 액션 — 토스 "내 신용점수" 하단처럼 구분선으로 나뉜 인라인 행.
 * '컴퍼니 추가'는 탭하면 폼이 카드 안에서 펼쳐지고, '계좌 추가·배정'은 /accounts 로 이동.
 */
export function MemberManager() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");

  function add() {
    startTransition(async () => {
      const res = await createMember(name, emoji);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("컴퍼니가 추가되었습니다");
      setName("");
      setEmoji("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      {/* 액션 행 — 구분선으로 나뉜 두 텍스트 버튼(토스풍) */}
      <div className="flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={
            "flex-1 py-4 text-center text-sm font-semibold transition active:scale-[0.98] " +
            (open ? "text-primary" : "")
          }
        >
          ＋ 컴퍼니 추가
        </button>
        <Link
          href="/accounts"
          className="flex-1 border-l border-border py-4 text-center text-sm font-semibold transition active:scale-[0.98]"
        >
          계좌 추가·배정 ›
        </Link>
      </div>

      {/* 컴퍼니 추가 폼 — 탭하면 카드 안에서 펼쳐짐 */}
      {open && (
        <div className="border-t border-border p-5">
          <p className="text-xs text-muted-foreground">
            가족 한 사람의 계좌 묶음 = 하나의 컴퍼니(그 사람이 CEO).
          </p>
          <div className="mt-3 flex gap-2">
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
              placeholder="예: 민준"
              aria-label="CEO 이름"
              className="h-12 flex-1"
              autoFocus
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              onClick={add}
              disabled={pending || !name.trim()}
              className="h-12 flex-1 bg-primary font-semibold text-primary-foreground"
            >
              {pending ? "추가 중…" : "컴퍼니 추가"}
            </Button>
            <Button
              onClick={() => setOpen(false)}
              disabled={pending}
              className="h-12 flex-1 bg-secondary font-semibold text-secondary-foreground"
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
