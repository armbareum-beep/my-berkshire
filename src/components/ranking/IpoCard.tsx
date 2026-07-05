"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Landmark, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCompany } from "@/app/ranking/actions";

/** 상장명 최대 길이 — src/app/ranking/actions.ts의 LISTED_NAME_MAX와 동일(서버가 최종 재검증). */
const LISTED_NAME_MAX = 20;

/**
 * 미상장 유저의 /ranking 카드 — "시장에 상장"이라는 옵트인 CTA(036).
 * EmptyState 카드 셸 문법을 따르되 체크리스트·입력·고지가 더해져 독립 컴포넌트로 분리.
 */
export function IpoCard({
  companyName,
  foundingDeclared,
  hasTrades,
}: {
  companyName: string;
  foundingDeclared: boolean;
  hasTrades: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [listedName, setListedName] = useState(companyName);
  const eligible = foundingDeclared && hasTrades;

  function submit() {
    startTransition(async () => {
      const res = await listCompany(listedName);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("시장에 상장했어요");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl bg-card p-6 shadow-card">
      {/* ① 헤더 */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Landmark size={20} strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold">아직 시장에 상장하지 않았어요</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            심사 요건을 채우면 리더보드에 참가할 수 있어요
          </p>
        </div>
      </div>

      {/* ② 심사 요건 체크리스트 */}
      <ul className="mt-4 flex flex-col gap-2">
        <li className="flex items-center gap-2 text-sm">
          {foundingDeclared ? (
            <CheckCircle2 size={16} className="shrink-0 text-primary" aria-hidden />
          ) : (
            <Circle size={16} className="shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className={foundingDeclared ? "" : "text-muted-foreground"}>
            설립 확정
          </span>
          {!foundingDeclared && (
            <Link
              href="/company"
              className="ml-auto text-xs font-medium text-primary"
            >
              하러 가기 ›
            </Link>
          )}
        </li>
        <li className="flex items-center gap-2 text-sm">
          {hasTrades ? (
            <CheckCircle2 size={16} className="shrink-0 text-primary" aria-hidden />
          ) : (
            <Circle size={16} className="shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className={hasTrades ? "" : "text-muted-foreground"}>
            거래 기록
          </span>
          {!hasTrades && (
            <span className="ml-auto flex items-center gap-2">
              <Link
                href="/import"
                className="text-xs font-medium text-primary"
              >
                가져오기 ›
              </Link>
              <Link
                href="/transactions"
                className="text-xs font-medium text-primary"
              >
                기록하기 ›
              </Link>
            </span>
          )}
        </li>
      </ul>

      {/* ③ 상장명 입력 */}
      <div className="mt-5">
        <label htmlFor="ipo-listed-name" className="text-sm font-medium">
          상장명
        </label>
        <Input
          id="ipo-listed-name"
          value={listedName}
          onChange={(e) => setListedName(e.target.value.slice(0, LISTED_NAME_MAX))}
          placeholder="시장에 공개될 이름"
          maxLength={LISTED_NAME_MAX}
          className="mt-2 h-12"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          다른 이름으로 상장할 수 있어요
        </p>
      </div>

      {/* ④ 공개 항목 고지 */}
      <div className="mt-4 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
        <p>
          공개돼요: 점수·등급·자산 구간(정확한 금액 아님)·수익률(연환산)·구성 비중(%)·연혁(날짜만)
        </p>
        <p className="mt-1">정확한 금액·보유 종목명은 공개되지 않아요</p>
      </div>

      {/* ⑤ 상장 버튼 */}
      <Button
        onClick={submit}
        disabled={!eligible || pending}
        className="mt-5 h-12 w-full bg-primary font-semibold text-primary-foreground"
      >
        {pending ? "상장 중…" : "시장에 상장하기"}
      </Button>
    </div>
  );
}
