import { describe, it, expect } from "vitest";
import { mergeEnv } from "./setup";

describe("mergeEnv", () => {
  it("빈 파일이면 두 줄만 쓴다", () => {
    expect(mergeEnv("", "me@naver.com", "pw")).toBe(
      "NAVER_MAIL_USER=me@naver.com\nNAVER_MAIL_APP_PASSWORD=pw\n",
    );
  });

  it("남의 변수를 지우지 않는다", () => {
    const existing = [
      "# 기존 설정",
      "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
      "SUPABASE_SERVICE_ROLE_KEY=secret",
      "",
    ].join("\n");
    const out = mergeEnv(existing, "me@naver.com", "pw");
    expect(out).toContain("# 기존 설정");
    expect(out).toContain("NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co");
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY=secret");
    expect(out).toContain("NAVER_MAIL_USER=me@naver.com");
    expect(out).toContain("NAVER_MAIL_APP_PASSWORD=pw");
  });

  it("기존 순서를 그대로 유지한다", () => {
    const out = mergeEnv("A=1\nB=2\n", "u", "p");
    expect(out.split("\n").slice(0, 2)).toEqual(["A=1", "B=2"]);
  });

  it("우리 키가 이미 있으면 중복 없이 갈아끼운다", () => {
    const existing = [
      "NAVER_MAIL_USER=old@naver.com",
      "OTHER=keep",
      "NAVER_MAIL_APP_PASSWORD=oldpw",
      "",
    ].join("\n");
    const out = mergeEnv(existing, "new@naver.com", "newpw");
    expect(out.match(/NAVER_MAIL_USER=/g)).toHaveLength(1);
    expect(out.match(/NAVER_MAIL_APP_PASSWORD=/g)).toHaveLength(1);
    expect(out).toContain("NAVER_MAIL_USER=new@naver.com");
    expect(out).toContain("NAVER_MAIL_APP_PASSWORD=newpw");
    expect(out).not.toContain("old@naver.com");
    expect(out).not.toContain("oldpw");
    expect(out).toContain("OTHER=keep");
  });

  it("앞에 공백이 붙은 키도 우리 것으로 알아본다", () => {
    const out = mergeEnv("  NAVER_MAIL_USER=old@naver.com\n", "new@naver.com", "pw");
    expect(out).not.toContain("old@naver.com");
    expect(out.match(/NAVER_MAIL_USER=/g)).toHaveLength(1);
  });

  it("CRLF 파일도 처리한다", () => {
    const out = mergeEnv("A=1\r\nNAVER_MAIL_USER=old\r\n", "u", "p");
    expect(out).toContain("A=1");
    expect(out).not.toContain("old");
  });

  it("끝에 빈 줄이 여러 개여도 하나로 정리한다", () => {
    const out = mergeEnv("A=1\n\n\n\n", "u", "p");
    expect(out).toBe("A=1\nNAVER_MAIL_USER=u\nNAVER_MAIL_APP_PASSWORD=p\n");
  });

  it("비밀번호 값에 = 가 있어도 그대로 보존한다", () => {
    const out = mergeEnv("", "u", "ab=cd==");
    expect(out).toContain("NAVER_MAIL_APP_PASSWORD=ab=cd==");
  });
});
