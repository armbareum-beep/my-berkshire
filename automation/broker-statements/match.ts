/**
 * 증권사 거래내역 메일 식별 — 순수 함수만. 네트워크·파일시스템 접근 없음.
 *
 * 메일 발신 주소·제목은 증권사가 언제든 바꿀 수 있으므로 규칙은 데이터로 둔다.
 * 실제 발신자를 모를 때는 fetch.ts 의 `--discover` 로 먼저 훑어보고 규칙을 채운다.
 */

export type Broker = "KB증권" | "키움증권";

export interface BrokerRule {
  broker: Broker;
  /** 발신 주소(소문자)에 이 중 하나라도 들어가면 후보 */
  fromContains: string[];
  /** 제목에 이 중 하나라도 들어가면 거래내역 메일로 본다 */
  subjectContains: string[];
}

/**
 * 기본 규칙. 도메인은 공개된 증권사 도메인 기준의 '출발점'이며 검증된 값이 아니다.
 * 첫 실행에서 맞지 않으면 `--discover` 결과로 교정한다(README 참고).
 */
export const DEFAULT_RULES: BrokerRule[] = [
  {
    broker: "KB증권",
    // 2026-11 --discover 로 확인: "KB증권" <mailmaster@kbsec.com>
    // kbstar.com 은 국민은행 쪽이라 뺐다(증권 거래내역이 오지 않는다).
    fromContains: ["mailmaster@kbsec.com", "kbsec.com"],
    subjectContains: ["거래내역", "매매내역", "거래명세", "월간거래", "잔고"],
  },
  {
    broker: "키움증권",
    // 2026-11 --discover 로 확인: "키움증권" <kiwoomiservice@kiwoom.com>
    fromContains: ["kiwoomiservice@kiwoom.com", "kiwoom.com"],
    subjectContains: ["거래내역", "매매내역", "거래명세", "월간거래", "잔고"],
  },
];

/** 발신자/제목으로 증권사를 판별한다. 규칙에 안 걸리면 null. */
export function identifyBroker(
  from: string,
  subject: string,
  rules: BrokerRule[] = DEFAULT_RULES,
): Broker | null {
  const f = from.toLowerCase();
  const s = subject ?? "";
  for (const rule of rules) {
    if (!rule.fromContains.some((d) => f.includes(d.toLowerCase()))) continue;
    if (rule.subjectContains.length && !rule.subjectContains.some((k) => s.includes(k))) continue;
    return rule.broker;
  }
  return null;
}

export type AttachmentKind = "html" | "xlsx" | "xls" | "csv" | "pdf" | "zip" | "other";

/** 확장자로 첨부 종류를 가른다. 내용 검증은 하지 않는다. */
export function classifyAttachment(filename: string): AttachmentKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  // KB(KBSC_*.html)·키움(kiwoom_month.html)은 월간 거래내역을 html 로 보낸다.
  // PDF 와 달리 암호가 걸려 있지 않아 파싱하기 쉽다 — 반드시 받아야 한다.
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  if (ext === "csv") return "csv";
  if (ext === "pdf") return "pdf";
  if (ext === "zip") return "zip";
  return "other";
}

/** 거래내역서로 쓸 만한 첨부인지. 이미지·서명 등은 걸러낸다. */
export function isStatementAttachment(filename: string): boolean {
  return classifyAttachment(filename) !== "other";
}

/**
 * 첨부 파일명은 외부 입력이다. 경로 탈출·숨김파일·제어문자를 제거해
 * 저장 디렉터리를 벗어날 수 없는 평범한 파일명 하나로 만든다.
 */
export function safeFilename(raw: string, fallback = "attachment.bin"): string {
  // 경로 구분자 기준 마지막 조각만 쓴다 (../../etc/passwd -> passwd)
  const base = raw.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > 150 ? cleaned.slice(0, 150) : cleaned;
}

/** YYYY-MM 두 개를 IMAP 검색에 쓸 [since, before) 로 바꾼다. before 는 미포함. */
export function monthRange(fromMonth: string, toMonth: string): { since: Date; before: Date } {
  const parse = (m: string) => {
    const match = /^(\d{4})-(\d{2})$/.exec(m);
    if (!match) throw new Error(`월 형식은 YYYY-MM 이어야 합니다: ${m}`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) throw new Error(`월이 범위를 벗어났습니다: ${m}`);
    return { year, month };
  };
  const a = parse(fromMonth);
  const b = parse(toMonth);
  const since = new Date(Date.UTC(a.year, a.month - 1, 1));
  const before = new Date(Date.UTC(b.year, b.month, 1));
  if (before <= since) throw new Error("끝 월이 시작 월보다 앞섭니다.");
  return { since, before };
}
