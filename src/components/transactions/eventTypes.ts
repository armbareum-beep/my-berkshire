import { type LucideIcon } from "lucide-react";
import { EVENT_ICON } from "@/components/transactions/eventIcons";
import type { EventType } from "@/lib/finance/valuation";

/** 거래 유형 구성 — 허브·입력화면·위저드 공용. */
export interface TypeCfg {
  key: EventType;
  Icon: LucideIcon;
  label: string;
  sub: string; // 쉬운 설명(브랜드 용어 보조)
  verb: string; // 버튼/완료 동사
  toast: string;
  needsSymbol: boolean;
  needsQty: boolean;
  amountLabel: string; // 현금흐름/배당 금액 라벨
}

export const TYPES: TypeCfg[] = [
  { key: "BUY", Icon: EVENT_ICON.BUY, label: "매수", sub: "주식·ETF·코인 사기", verb: "매수", toast: "매수되었습니다", needsSymbol: true, needsQty: true, amountLabel: "" },
  { key: "SELL", Icon: EVENT_ICON.SELL, label: "매도", sub: "자산 팔기", verb: "매도", toast: "매도되었습니다", needsSymbol: true, needsQty: true, amountLabel: "" },
  { key: "DIVIDEND", Icon: EVENT_ICON.DIVIDEND, label: "배당", sub: "배당 받기", verb: "배당 기록", toast: "배당이 기록되었습니다", needsSymbol: true, needsQty: false, amountLabel: "배당액 (원)" },
  { key: "DEPOSIT", Icon: EVENT_ICON.DEPOSIT, label: "증자", sub: "회사에 현금 넣기", verb: "증자", toast: "증자되었습니다", needsSymbol: false, needsQty: false, amountLabel: "증자액" },
  { key: "WITHDRAWAL", Icon: EVENT_ICON.WITHDRAWAL, label: "인출", sub: "회사에서 현금 빼기", verb: "인출", toast: "인출되었습니다", needsSymbol: false, needsQty: false, amountLabel: "인출액" },
  { key: "EXCHANGE", Icon: EVENT_ICON.EXCHANGE, label: "환전", sub: "통화 바꾸기", verb: "환전", toast: "환전되었습니다", needsSymbol: false, needsQty: false, amountLabel: "환전 금액" },
];

// 허브(무엇을 기록할까요?)에 노출할 종류. 배당은 자동 기록이라 손으로 누를 일이 없어 제외 —
// 자동 누락 종목은 종목 상세의 "배당 직접 추가"(딥링크)로 진입.
export const HUB_TYPES = TYPES.filter((t) => t.key !== "DIVIDEND");
