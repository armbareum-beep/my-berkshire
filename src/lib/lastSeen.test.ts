import { describe, expect, it } from "vitest";
import { parseLastSeenCookie, pickBaseline, type LastSeenSnapshot } from "./lastSeen";

/**
 * "지난 접속" 쿠키의 승격 모델 검증 — 기준점(prev)이 하루 안 새로고침에 흔들리지 않는지가 핵심.
 * 실제 승격(쿠키 쓰기)은 route.ts POST 가 담당하므로, 여긴 파싱·기준점 선택만 검증한다.
 */

const snap = (date: string, profit = 100, value = 1000): LastSeenSnapshot => ({
  date,
  profit,
  value,
});

describe("parseLastSeenCookie", () => {
  it("쿠키 없음 → null", () => {
    expect(parseLastSeenCookie(undefined)).toBeNull();
  });

  it("손상된 JSON → null", () => {
    expect(parseLastSeenCookie("{not-json")).toBeNull();
  });

  it("레거시 평면형({date,profit,value}) → { prev: null, latest: 그 값 }으로 정규화", () => {
    const raw = JSON.stringify(snap("2026-07-01", 500, 5000));
    expect(parseLastSeenCookie(raw)).toEqual({
      prev: null,
      latest: snap("2026-07-01", 500, 5000),
    });
  });

  it("2단 스키마({prev,latest})는 그대로 통과", () => {
    const raw = JSON.stringify({
      prev: snap("2026-07-01"),
      latest: snap("2026-07-02"),
    });
    expect(parseLastSeenCookie(raw)).toEqual({
      prev: snap("2026-07-01"),
      latest: snap("2026-07-02"),
    });
  });

  it("prev: null 인 2단 스키마도 통과", () => {
    const raw = JSON.stringify({ prev: null, latest: snap("2026-07-02") });
    expect(parseLastSeenCookie(raw)).toEqual({
      prev: null,
      latest: snap("2026-07-02"),
    });
  });

  it("latest 필드 형식이 깨지면 null", () => {
    const raw = JSON.stringify({ prev: null, latest: { date: "2026-07-02" } });
    expect(parseLastSeenCookie(raw)).toBeNull();
  });
});

describe("pickBaseline", () => {
  it("parsed 가 null 이면 null", () => {
    expect(pickBaseline(null, "2026-07-03")).toBeNull();
  });

  it("latest.date !== today → latest 가 곧 기준점(날짜 바뀐 뒤 첫 렌더, 승격 전)", () => {
    const parsed = { prev: null, latest: snap("2026-07-02", 100, 1000) };
    expect(pickBaseline(parsed, "2026-07-03")).toEqual(
      snap("2026-07-02", 100, 1000),
    );
  });

  it("latest.date === today → prev 가 하루 종일 고정되는 기준점", () => {
    const parsed = {
      prev: snap("2026-07-01", 50, 500),
      latest: snap("2026-07-03", 200, 2000),
    };
    expect(pickBaseline(parsed, "2026-07-03")).toEqual(snap("2026-07-01", 50, 500));
  });

  it("latest.date === today 인데 prev 가 null → null(마이그레이션 공백, 어제 대비로 폴백)", () => {
    const parsed = { prev: null, latest: snap("2026-07-03", 200, 2000) };
    expect(pickBaseline(parsed, "2026-07-03")).toBeNull();
  });
});
