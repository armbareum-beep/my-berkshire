import { describe, it, expect } from "vitest";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPE_DESCRIPTION,
  ACCOUNT_TYPE_EMOJI,
} from "./tax";

// EmojiIcon(MAP)이 라인 아이콘으로 교체하는 키 집합. 여기 없으면 화면에서 원본 이모지로 폴백된다.
// (src/components/ui/EmojiIcon.tsx 의 MAP 키와 동기화 — 종류 아이콘이 폴백으로 떨어지지 않게 보증.)
const EMOJI_ICON_KEYS = new Set([
  "🎩", "🌳", "🌱", "🌿", "🏢", "🚀", "🛡️", "🛡", "🌍", "💵", "🔄",
  "⚠️", "⚠", "💰", "🧾", "⭐", "🏛️", "🏛", "🏦", "✅", "📈", "📒",
  "💸", "👍", "🔗", "🔍", "📊", "💡",
]);

describe("계좌 종류 표시 메타데이터", () => {
  it("모든 AccountType이 라벨·설명·아이콘을 갖는다", () => {
    for (const t of ACCOUNT_TYPES) {
      expect(ACCOUNT_TYPE_LABEL[t], `${t} 라벨`).toBeTruthy();
      expect(ACCOUNT_TYPE_DESCRIPTION[t], `${t} 설명`).toBeTruthy();
      expect(ACCOUNT_TYPE_EMOJI[t], `${t} 아이콘`).toBeTruthy();
    }
  });

  it("각 종류 아이콘은 EmojiIcon MAP에 존재한다(폴백 텍스트 금지)", () => {
    for (const t of ACCOUNT_TYPES) {
      expect(
        EMOJI_ICON_KEYS.has(ACCOUNT_TYPE_EMOJI[t].trim()),
        `${t}: ${ACCOUNT_TYPE_EMOJI[t]} 가 EmojiIcon MAP에 없음`,
      ).toBe(true);
    }
  });
});
