import { describe, it, expect } from "vitest";
import {
  MANUAL_ASSET_KINDS,
  MANUAL_ASSET_KIND_LABEL,
  MANUAL_ASSET_KIND_DESC,
  MANUAL_ASSET_KIND_EMOJI,
} from "./realAssets";

// src/components/ui/EmojiIcon.tsx 의 MAP 키와 동기화 — 종류 아이콘이 폴백 텍스트로 떨어지지 않게 보증.
const EMOJI_ICON_KEYS = new Set([
  "🎩", "🌳", "🌱", "🌿", "🏢", "🚀", "🛡️", "🛡", "🌍", "💵", "🔄",
  "⚠️", "⚠", "💰", "🧾", "⭐", "🏛️", "🏛", "🏦", "✅", "📈", "📒",
  "💸", "👍", "🔗", "🔍", "📊", "💡",
]);

describe("수기 자산 종류 표시 메타데이터", () => {
  it("모든 ManualAssetKind가 라벨·설명·아이콘을 갖는다", () => {
    for (const k of MANUAL_ASSET_KINDS) {
      expect(MANUAL_ASSET_KIND_LABEL[k], `${k} 라벨`).toBeTruthy();
      expect(MANUAL_ASSET_KIND_DESC[k], `${k} 설명`).toBeTruthy();
      expect(MANUAL_ASSET_KIND_EMOJI[k], `${k} 아이콘`).toBeTruthy();
    }
  });

  it("각 종류 아이콘은 EmojiIcon MAP에 존재한다(폴백 텍스트 금지)", () => {
    for (const k of MANUAL_ASSET_KINDS) {
      expect(
        EMOJI_ICON_KEYS.has(MANUAL_ASSET_KIND_EMOJI[k].trim()),
        `${k}: ${MANUAL_ASSET_KIND_EMOJI[k]} 가 EmojiIcon MAP에 없음`,
      ).toBe(true);
    }
  });
});
