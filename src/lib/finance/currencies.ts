/**
 * 외화 금고에서 다루는 통화 목록 — 증자·환전·현금 풀 표시 공용.
 * 기능통화는 항상 KRW. 그 외는 야후 `{CCY}KRW=X` 환율로 ₩ 환산해 장부에 기록.
 * 토스 등 소스 교체 시에도 이 목록은 그대로 쓸 수 있다.
 */
export interface CurrencyMeta {
  code: string;
  /** 통화 기호(표시용). */
  symbol: string;
  /** 한글 라벨(칩 표시용). */
  label: string;
  /** 정식 한글명(리스트 행 표시용, 토스식). */
  name: string;
  /** 국기 이모지(폴백용 — Windows 등에선 글자로 깨질 수 있어 보통 Flag 컴포넌트 사용). */
  flag: string;
  /** 국기 이미지 코드(public/flags/{cc}.svg). Flag 컴포넌트가 사용. */
  cc: string;
  /** 소수 자릿수(KRW=0, 그 외=2). */
  digits: number;
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: "KRW", symbol: "₩", label: "원", name: "원화", flag: "🇰🇷", cc: "kr", digits: 0 },
  { code: "USD", symbol: "$", label: "달러", name: "미국 달러", flag: "🇺🇸", cc: "us", digits: 2 },
  { code: "JPY", symbol: "¥", label: "엔", name: "일본 엔", flag: "🇯🇵", cc: "jp", digits: 0 },
  { code: "EUR", symbol: "€", label: "유로", name: "유럽 유로", flag: "🇪🇺", cc: "eu", digits: 2 },
];

const BY_CODE: Record<string, CurrencyMeta> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c]),
);

export function currencyMeta(code: string): CurrencyMeta {
  return (
    BY_CODE[code] ?? {
      code,
      symbol: code + " ",
      label: code,
      name: code,
      flag: "🏳️",
      cc: "",
      digits: 2,
    }
  );
}

/** 통화 인식 네이티브 금액 포맷(₩는 정수, 외화는 기호+소수). */
export function nativeMoney(amount: number, code: string): string {
  const m = currencyMeta(code);
  return `${m.symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: m.digits,
    maximumFractionDigits: m.digits,
  })}`;
}
