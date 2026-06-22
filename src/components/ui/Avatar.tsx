"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { brandLogoLabel } from "@/lib/finance/brandColor";

const SIZE = {
  sm: "h-7 w-7 text-[9px]",
  md: "h-9 w-9 text-[10px]",
  lg: "h-10 w-10 text-[11px]",
} as const;

function gfavicon(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/** 한국 대형주 코드 → 공식 도메인. 확실한 것만 등록(없으면 텍스트 아바타). */
const KR_DOMAINS: Record<string, string> = {
  "005930": "samsung.com",
  "000660": "skhynix.com",
  "005380": "hyundai.com",
  "000270": "kia.com",
  "035420": "navercorp.com",
  "035720": "kakao.com",
  "066570": "lg.com",
  "051910": "lgchem.com",
  "105560": "kbfg.com",
  "055550": "shinhangroup.com",
  "068270": "celltrion.com",
  "207940": "samsungbiologics.com",
  "005490": "posco.com",
  "003550": "lggroup.com",
};

/** 미국 주요 종목 티커 → 도메인. */
const US_DOMAINS: Record<string, string> = {
  AAPL: "apple.com", MSFT: "microsoft.com", GOOGL: "google.com",
  GOOG: "google.com", AMZN: "amazon.com", TSLA: "tesla.com",
  NVDA: "nvidia.com", META: "meta.com", NFLX: "netflix.com",
  KO: "coca-cola.com", V: "visa.com", JPM: "jpmorganchase.com",
  BRKB: "berkshirehathaway.com", "BRK-B": "berkshirehathaway.com",
  SPY: "ssga.com", QQQ: "invesco.com", IVV: "blackrock.com",
  VOO: "vanguard.com", VTI: "vanguard.com",
};

/** 심볼 → 로고 이미지 URL. Google Favicon 기반, 없으면 null (텍스트 아바타 폴백). */
function logoUrl(symbol?: string): string | null {
  if (!symbol) return null;
  if (symbol.endsWith("-USD")) return null;
  if (/^\d{6}$/.test(symbol)) {
    const d = KR_DOMAINS[symbol];
    return d ? gfavicon(d) : null;
  }
  const d = US_DOMAINS[symbol.toUpperCase()];
  return d ? gfavicon(d) : null;
}

export function Avatar({
  name,
  symbol,
  size = "lg",
  className,
}: {
  name: string;
  symbol?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = logoUrl(symbol);
  const { bg, fg, label } = brandLogoLabel(symbol, name);
  const textClass = label.length === 1 ? "text-base font-bold" : "font-bold leading-none";

  if (url && !imgFailed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary",
          SIZE[size],
          className,
        )}
      >
        <img
          src={url}
          alt={name}
          className="h-full w-full object-contain"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
    >
      <span className={textClass}>{label}</span>
    </span>
  );
}
