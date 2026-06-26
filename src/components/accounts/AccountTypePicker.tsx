"use client";

import { CardPicker } from "@/components/ui/CardPicker";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPE_DESCRIPTION,
  ACCOUNT_TYPE_EMOJI,
  type AccountType,
} from "@/lib/config/tax";

/**
 * 계좌 종류 선택 — 토스식 "어떤 계좌를 만들까요?" 카드 목록.
 * 범용 CardPicker에 계좌 종류 도메인(라벨·절세설명·아이콘)을 주입한 얇은 래퍼.
 */
export function AccountTypePicker({
  value,
  onChange,
  className,
}: {
  value: AccountType;
  onChange: (t: AccountType) => void;
  className?: string;
}) {
  return (
    <CardPicker
      value={value}
      onChange={onChange}
      items={ACCOUNT_TYPES}
      getLabel={(t) => ACCOUNT_TYPE_LABEL[t]}
      getDescription={(t) => ACCOUNT_TYPE_DESCRIPTION[t]}
      getEmoji={(t) => ACCOUNT_TYPE_EMOJI[t]}
      ariaLabel="계좌 종류"
      className={className}
    />
  );
}
