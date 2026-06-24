import {
  Crown, TreePine, Rocket, Shield, Globe, Banknote, RefreshCw,
  AlertTriangle, Coins, ReceiptText, Star, Landmark, CircleCheck,
  TrendingUp, BookText, PiggyBank, ThumbsUp, Building2, Link2,
  Search, BarChart3, Lightbulb, Sprout, Leaf,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 데이터층에 남은 이모지(신호·스타일 아키타입·축하 등)를 lucide 라인 아이콘으로 렌더.
 * 프로듀서(lib/*)는 이모지 문자열을 그대로 두고, 표시 측에서 이 매핑으로 교체(이모지 박멸).
 * 매핑에 없으면 원본 이모지 텍스트로 폴백(깨짐 방지).
 */
const MAP: Record<string, LucideIcon> = {
  "🎩": Crown,
  "🌳": TreePine,
  "🌱": Sprout,
  "🌿": Leaf,
  "🏢": Building2,
  "🚀": Rocket,
  "🛡️": Shield,
  "🛡": Shield,
  "🌍": Globe,
  "💵": Banknote,
  "🔄": RefreshCw,
  "⚠️": AlertTriangle,
  "⚠": AlertTriangle,
  "💰": Coins,
  "🧾": ReceiptText,
  "⭐": Star,
  "🏛️": Landmark,
  "🏛": Landmark,
  "🏦": Building2,
  "✅": CircleCheck,
  "📈": TrendingUp,
  "📒": BookText,
  "💸": PiggyBank,
  "👍": ThumbsUp,
  "🔗": Link2,
  "🔍": Search,
  "📊": BarChart3,
  "💡": Lightbulb,
};

/** 심각도 색 점(🔴🟡🟢) — lucide 아닌 컬러 도트로 렌더. */
const DOT: Record<string, string> = {
  "🔴": "#f04452",
  "🟠": "#f59e0b",
  "🟡": "#f59e0b",
  "🟢": "#15b26b",
};

export function EmojiIcon({
  emoji,
  size = 18,
  className,
}: {
  emoji: string;
  size?: number;
  className?: string;
}) {
  const key = emoji.trim();
  const dot = DOT[key];
  if (dot) {
    const d = Math.round(size * 0.6);
    return (
      <span
        className={cn("inline-block shrink-0 rounded-full align-middle", className)}
        style={{ width: d, height: d, backgroundColor: dot }}
        aria-hidden
      />
    );
  }
  const Icon = MAP[key];
  if (!Icon) return <span className={className}>{emoji}</span>;
  return <Icon size={size} className={cn("inline-block shrink-0", className)} aria-hidden />;
}
