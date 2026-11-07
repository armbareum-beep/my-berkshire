/**
 * 복호화된 증권사 월간 거래내역(표 행)을 구조화한다.
 *
 * 입력은 브라우저에서 뽑은 leaf 표의 행들(string[][])이다. DOM 작업은 복호화 단계에서
 * 끝내고, 여기서는 순수 함수만 둬서 브라우저 없이 테스트할 수 있게 한다.
 *
 * 양식은 2026-11 기준 실제 메일로 확인했다. 증권사가 양식을 바꾸면 여기가 깨지므로
 * 숫자가 안 맞으면 조용히 넘기지 말고 오류를 낸다.
 */

export type EventType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "INTEREST"
  | "UNKNOWN";

export interface ParsedHolding {
  name: string;
  quantity: number;
  /** 평가단가. KB 월간내역에는 없다. */
  price: number | null;
  /** 평가금액. KB 월간내역에는 없다. */
  value: number | null;
}

export interface ParsedEvent {
  date: string; // YYYY-MM-DD
  type: EventType;
  /** 증권사가 쓴 원래 거래구분. 분류가 틀렸을 때 추적용. */
  label: string;
  name?: string;
  quantity?: number;
  price?: number;
  /** 거래금액(양수). 입출금·배당은 금액 그대로. */
  amount: number;
  /** 그 금액의 통화. 해외 계좌는 한 명세서 안에서도 원화와 달러가 섞인다. */
  currency: string;
  fee: number;
  tax: number;
}

export interface ParsedStatement {
  broker: "KB증권" | "키움증권";
  accountNo: string;
  accountName: string;
  /** KB 의 "01 신연금저축" 같은 계좌 구분. 키움에는 없다. */
  accountLabel?: string;
  asOf: string; // YYYY-MM-DD
  periodFrom: string;
  periodTo: string;
  cash: number;
  /** 예수금 칸이 통화를 밝힌 경우(해외주식 계좌의 "USD ..."). 없으면 원화로 본다. */
  currency: string;
  holdings: ParsedHolding[];
  events: ParsedEvent[];
}

/**
 * 금액 칸을 숫자와 통화로 나눈다. 해외주식 계좌는 "USD 7,092.22" 처럼 통화를 붙여 쓴다.
 * 통화를 버리고 숫자만 쓰면 달러를 원화로 더해버리므로 함께 돌려준다.
 */
export function parseAmount(raw: string | undefined): { value: number; currency: string | null } {
  if (raw === undefined) return { value: 0, currency: null };
  const text = raw.trim();
  const code = /(?:^|\s)([A-Z]{3})(?=\s|$|[\d-])|([A-Z]{3})\s*$/.exec(text);
  const currency = code ? (code[1] ?? code[2]) : null;
  const cleaned = text
    .replace(/[A-Z]{3}/g, "")
    .replace(/[,\s원주$]/g, "")
    .trim();
  if (!cleaned || cleaned === "-") return { value: 0, currency };
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`숫자로 읽을 수 없습니다: ${raw}`);
  return { value: n, currency };
}

export function toNumber(raw: string | undefined): number {
  return parseAmount(raw).value;
}

/** 2026/10/31 · 20261031 · 2026-10-31 을 모두 YYYY-MM-DD 로. */
export function toDate(raw: string): string {
  const s = raw.trim();
  let m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(s);
  if (!m) m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!m) throw new Error(`날짜 형식을 알 수 없습니다: ${raw}`);
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** 거래구분 문자열 → events.type. 모르면 UNKNOWN 으로 두고 버리지 않는다. */
export function classifyEvent(label: string): EventType {
  const s = label.replace(/\s/g, "");
  if (/매수/.test(s)) return "BUY";
  if (/매도/.test(s)) return "SELL";
  if (/배당|수익분배금|분배금/.test(s)) return "DIVIDEND";
  if (/이용료|이자/.test(s)) return "INTEREST";
  if (/출금|출고|이체출/.test(s)) return "WITHDRAWAL";
  if (/입금|입고|이체입/.test(s)) return "DEPOSIT";
  return "UNKNOWN";
}

const isDateCell = (cell: string | undefined) =>
  !!cell && (/^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/.test(cell.trim()) || /^\d{8}$/.test(cell.trim()));

/** 라벨이 들어 있는 행에서 그 다음 칸 값을 꺼낸다. */
function labelled(rows: string[][], label: string): string | undefined {
  for (const row of rows) {
    const i = row.findIndex((c) => c.replace(/\s/g, "") === label.replace(/\s/g, ""));
    if (i >= 0 && row[i + 1] !== undefined) return row[i + 1].trim();
  }
  return undefined;
}

function need(value: string | undefined, what: string): string {
  if (value === undefined || value === "") throw new Error(`${what}을(를) 찾지 못했습니다.`);
  return value;
}

// ───────────────────────────── 키움증권 ─────────────────────────────

/**
 * 키움 월간거래내역. 거래 한 건이 두 행으로 나뉜다:
 *   [일자, 거래구분, 종목명, 수수료, 제세금]
 *   [수량, 가격, 거래금액, 예수금잔액]
 */
export function parseKiwoom(rows: string[][]): ParsedStatement {
  const period = need(labelled(rows, "대상기간"), "대상기간");
  const [from, to] = period.split(/[-~∼]/).map((s) => s.trim());

  const holdings: ParsedHolding[] = [];
  const headerAt = rows.findIndex(
    (r) => r[0]?.trim() === "종류" && r.some((c) => c.trim() === "평가금액"),
  );
  if (headerAt >= 0) {
    for (const row of rows.slice(headerAt + 1)) {
      if (row[0]?.trim() === "합계" || !row[2]?.trim()) break;
      holdings.push({
        name: row[2].trim(),
        quantity: toNumber(row[3]),
        price: row[4]?.trim() ? toNumber(row[4]) : null,
        value: row[7]?.trim() ? toNumber(row[7]) : null,
      });
    }
  }

  const cash = parseAmount(labelled(rows, "예수금"));

  const events: ParsedEvent[] = [];
  for (let i = 0; i < rows.length; i++) {
    const head = rows[i];
    if (!isDateCell(head[0])) continue;
    const tail = rows[i + 1];
    if (!tail || isDateCell(tail[0])) {
      throw new Error(`키움 거래 행의 둘째 줄이 없습니다: ${head.join(" | ")}`);
    }
    const label = (head[1] ?? "").trim();
    const quantity = toNumber(tail[0]);
    const price = toNumber(tail[1]);
    const amount = parseAmount(tail[2]);
    events.push({
      date: toDate(head[0]),
      type: classifyEvent(label),
      label,
      ...(head[2]?.trim() ? { name: head[2].trim() } : {}),
      ...(quantity ? { quantity } : {}),
      ...(price ? { price } : {}),
      amount: amount.value,
      currency: amount.currency ?? "KRW",
      fee: toNumber(head[3]),
      tax: toNumber(head[4]),
    });
    i += 1;
  }

  return {
    broker: "키움증권",
    accountNo: need(labelled(rows, "계좌번호"), "계좌번호"),
    accountName: need(labelled(rows, "계좌명"), "계좌명"),
    asOf: toDate(need(labelled(rows, "잔고기준일"), "잔고기준일")),
    periodFrom: toDate(from),
    periodTo: toDate(to),
    cash: cash.value,
    currency: cash.currency ?? "KRW",
    holdings,
    events,
  };
}

// ────────────────────────────── KB증권 ──────────────────────────────

/**
 * KB 거래내역의 '거래내역' 칸은 한 덩어리 문장이다.
 *   "TIGER 차이나항셍테크 80주 X 6,005원 = 480,400원 매수입고 80주 잔고 4,084주 수수료 950원"
 *   "KODEX 코리아밸류업 44,760원"
 */
export function parseKbDetail(detail: string): {
  name?: string;
  quantity?: number;
  price?: number;
  fee: number;
} {
  const text = detail.replace(/\s+/g, " ").trim();
  const fee = /수수료\s*([\d,]+)\s*원/.exec(text);
  const trade = /^(.*?)\s+([\d,]+)주\s*X\s*([\d,]+)원/.exec(text);
  if (trade) {
    return {
      name: trade[1].trim(),
      quantity: toNumber(trade[2]),
      price: toNumber(trade[3]),
      fee: fee ? toNumber(fee[1]) : 0,
    };
  }
  // 배당처럼 "<종목명> <금액>원" 한 줄인 경우
  const simple = /^(.*?)\s+[\d,]+원$/.exec(text);
  return {
    ...(simple && simple[1].trim() ? { name: simple[1].trim() } : {}),
    fee: fee ? toNumber(fee[1]) : 0,
  };
}

export function parseKb(rows: string[][]): ParsedStatement {
  const period = need(labelled(rows, "거래기간"), "거래기간");
  const [from, to] = period.split(/[~∼]/).map((s) => s.trim());

  const holdings: ParsedHolding[] = [];
  const headerAt = rows.findIndex(
    (r) => r[0]?.trim() === "구분" && r[1]?.trim() === "종목명" && r[2]?.trim() === "수량",
  );
  if (headerAt >= 0) {
    for (const row of rows.slice(headerAt + 1)) {
      if (!row[1]?.trim() || row[0]?.startsWith("※")) break;
      holdings.push({
        name: row[1].trim(),
        quantity: toNumber(row[2]),
        price: row[3]?.trim() ? toNumber(row[3]) : null,
        value: null,
      });
    }
  }

  const events: ParsedEvent[] = [];
  const txAt = rows.findIndex((r) => r[0]?.trim() === "거래일자" && r[3]?.trim() === "정산금액");
  if (txAt >= 0) {
    for (const row of rows.slice(txAt + 1)) {
      if (!isDateCell(row[0])) break;
      const label = (row[1] ?? "").trim();
      const detail = parseKbDetail(row[2] ?? "");
      const settled = parseAmount(row[3]);
      events.push({
        date: toDate(row[0]),
        type: classifyEvent(label),
        label,
        ...(detail.name ? { name: detail.name } : {}),
        ...(detail.quantity ? { quantity: detail.quantity } : {}),
        ...(detail.price ? { price: detail.price } : {}),
        // KB 의 정산금액은 수수료를 포함한다(매수 -481,350 = 거래대금 480,400 + 수수료 950).
        // 키움은 거래금액(수수료 제외)을 준다. 두 증권사를 같은 의미로 맞추기 위해
        // 수량·가격을 읽어낸 거래는 거래대금으로 환산하고 수수료는 따로 둔다.
        amount:
          detail.quantity && detail.price
            ? detail.quantity * detail.price
            : Math.abs(settled.value),
        currency: settled.currency ?? "KRW",
        fee: detail.fee,
        tax: 0,
      });
    }
  }

  const label = rows.find((r) => /^\d{2}\s+\S/.test(r[0]?.trim() ?? ""))?.[0]?.trim();
  // 해외주식 계좌는 "예수금(외화)" 처럼 다른 이름을 쓴다.
  const cash = parseAmount(
    labelled(rows, "예수금(원화)") ?? labelled(rows, "예수금(외화)") ?? labelled(rows, "예수금"),
  );

  return {
    broker: "KB증권",
    accountNo: need(labelled(rows, "계좌번호"), "계좌번호"),
    accountName: need(labelled(rows, "계좌명"), "계좌명"),
    ...(label ? { accountLabel: label } : {}),
    asOf: toDate(need(labelled(rows, "작성기준일"), "작성기준일")),
    periodFrom: toDate(from),
    periodTo: toDate(to),
    cash: cash.value,
    currency: cash.currency ?? "KRW",
    holdings,
    events,
  };
}
