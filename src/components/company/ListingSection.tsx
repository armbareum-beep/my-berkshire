"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { delistCompany, updateListedName } from "@/app/ranking/actions";

/** 상장명 최대 길이 — src/app/ranking/actions.ts의 LISTED_NAME_MAX와 동일(서버가 최종 재검증). */
const LISTED_NAME_MAX = 20;

/**
 * /company 의 "상장" 섹션(036) — 상장 상태 조회 + 상장명 수정 + 상장폐지.
 * 상장 자체(신규 옵트인)는 /ranking(IpoCard)에서만 하고, 여기는 "관리"만 담당한다.
 */
export function ListingSection({
  listedAt,
  firstListedAt,
  listedName,
  companyName,
}: {
  /** 현재 상장 상태(null=미상장/폐지). */
  listedAt: string | null;
  /** 최초 상장일(불변, 연혁용). 재상장에도 유지. */
  firstListedAt: string | null;
  /** 리더보드 공개 이름(null이면 회사명 사용). */
  listedName: string | null;
  companyName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(listedName?.trim() || companyName);
  const [confirmingDelist, setConfirmingDelist] = useState(false);

  const listed = listedAt != null;
  const displayName = listedName?.trim() || companyName;

  function resetName() {
    setName(displayName);
  }

  function saveName() {
    startTransition(async () => {
      const res = await updateListedName(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("상장명이 수정되었어요");
      setEditing(false);
      router.refresh();
    });
  }

  function delist() {
    startTransition(async () => {
      const res = await delistCompany();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("상장폐지했어요");
      setConfirmingDelist(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <h2 className="text-lg font-extrabold tracking-tight">상장</h2>

      {listed ? (
        <>
          <p className="mt-2 text-sm font-semibold text-primary">상장 중</p>
          <p className="mt-1 text-sm text-muted-foreground">
            상장일 {listedAt}
            {firstListedAt && firstListedAt !== listedAt && (
              <span> · 최초 상장 {firstListedAt}</span>
            )}
          </p>

          {editing ? (
            <div className="mt-3 flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, LISTED_NAME_MAX))}
                maxLength={LISTED_NAME_MAX}
                aria-label="상장명"
                className="h-11 flex-1"
              />
              <Button
                onClick={saveName}
                disabled={pending || !name.trim()}
                className="h-11 shrink-0 bg-primary px-4 font-semibold text-primary-foreground"
              >
                {pending ? "저장 중…" : "저장"}
              </Button>
              <Button
                onClick={() => {
                  resetName();
                  setEditing(false);
                }}
                disabled={pending}
                className="h-11 shrink-0 bg-secondary px-4 font-semibold text-secondary-foreground"
              >
                취소
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-2.5">
              <span className="text-sm font-medium">{displayName}</span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="shrink-0 text-xs font-medium text-primary"
              >
                수정
              </button>
            </div>
          )}

          <div className="mt-4 border-t border-border pt-4">
            {confirmingDelist ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  리더보드에서 즉시 내려가요. 언제든 재상장할 수 있어요.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={delist}
                    disabled={pending}
                    variant="destructive"
                    className="h-10 flex-1 font-semibold"
                  >
                    {pending ? "폐지 중…" : "상장폐지 확인"}
                  </Button>
                  <Button
                    onClick={() => setConfirmingDelist(false)}
                    disabled={pending}
                    className="h-10 flex-1 bg-secondary font-semibold text-secondary-foreground"
                  >
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelist(true)}
                className="text-sm font-medium text-destructive"
              >
                상장폐지
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {firstListedAt ? "현재 상장폐지 상태예요" : "아직 시장에 상장하지 않았어요"}
          </p>
          <Link
            href="/ranking"
            className="mt-3 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            상장 심사 보러 가기
          </Link>
        </>
      )}
    </section>
  );
}
