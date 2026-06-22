"use client";

interface Brokerage {
  id: string;
  name: string;
  steps: string[];
  url: string;
}

const BROKERAGES: Brokerage[] = [
  {
    id: "toss",
    name: "토스증권",
    steps: [
      "토스 앱 → 주식 탭",
      "내 주식 → 계좌 선택",
      "거래내역에서 매수·매도 확인",
    ],
    url: "https://www.tossinvest.com",
  },
  {
    id: "kiwoom",
    name: "키움증권",
    steps: [
      "영웅문 실행 또는 키움 앱 접속",
      "계좌 → 거래내역조회",
      "조회기간 설정 후 매수·매도 확인",
    ],
    url: "https://www.kiwoom.com",
  },
  {
    id: "kb",
    name: "KB증권",
    steps: [
      "로그인 → 계좌관리",
      "거래내역조회 선택",
      "기간 설정 후 매수·매도 확인",
    ],
    url: "https://www.kbsec.com",
  },
  {
    id: "miraeasset",
    name: "미래에셋",
    steps: [
      "로그인 → MY",
      "거래내역 조회",
      "기간 설정 후 매수·매도 확인",
    ],
    url: "https://securities.miraeasset.com",
  },
  {
    id: "samsung",
    name: "삼성증권",
    steps: [
      "로그인 → 계좌",
      "거래내역조회",
      "기간 설정 후 매수·매도 확인",
    ],
    url: "https://www.samsungpop.com",
  },
  {
    id: "hankinvest",
    name: "한국투자",
    steps: [
      "로그인 → 나의 계좌",
      "거래내역 조회",
      "기간 설정 후 매수·매도 확인",
    ],
    url: "https://www.truefriend.com",
  },
  {
    id: "other",
    name: "기타",
    steps: [
      "증권사 앱 또는 HTS 로그인",
      "계좌 → 거래내역(거래내역조회) 메뉴",
      "기간 설정 후 매수·매도 확인",
    ],
    url: "",
  },
];

interface Props {
  selected: string | null;
  onSelect: (id: string) => void;
}

export function BrokerageGuide({ selected, onSelect }: Props) {
  const active = BROKERAGES.find((b) => b.id === selected);

  return (
    <div>
      <p className="mb-3 text-sm font-semibold">어느 증권사인가요?</p>
      <div className="flex flex-wrap gap-2">
        {BROKERAGES.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            className="rounded-full border px-3 py-1.5 text-sm font-medium transition"
            style={{
              background: selected === b.id ? "var(--primary)" : "var(--card)",
              color: selected === b.id ? "var(--primary-foreground)" : "var(--foreground)",
              borderColor: selected === b.id ? "var(--primary)" : "var(--border)",
            }}
          >
            {b.name}
          </button>
        ))}
      </div>

      {active && active.steps.length > 0 && (
        <div className="mt-4 rounded-xl bg-accent p-4">
          <p className="mb-2 text-xs font-semibold text-accent-foreground">{active.name} 거래내역 보는 방법</p>
          <ol className="flex flex-col gap-1">
            {active.steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm text-accent-foreground">
                <span className="shrink-0 font-bold">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {active.url && (
            <a
              href={active.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              {active.name} 바로가기 →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
