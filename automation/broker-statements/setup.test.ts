import { describe, it, expect } from "vitest";
import { mergeEnv, explain, usernameCandidates, isAuthFailure, isMonth } from "./setup";

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

describe("explain", () => {
  it("ImapFlow 의 'Command failed' 를 인증 실패로 읽고 서버 응답을 보여준다", () => {
    const error = Object.assign(new Error("Command failed"), {
      authenticationFailed: true,
      responseText: "Invalid credentials",
      serverResponseCode: "AUTHENTICATIONFAILED",
    });
    const out = explain(error);
    expect(out).toContain("네이버가 로그인을 거부했습니다");
    expect(out).toContain("IMAP 사용");
    // 핵심: 원인 추측만 하지 말고 서버가 실제로 뭐라 했는지 보여줄 것
    expect(out).toContain("Invalid credentials");
    expect(out).toContain("AUTHENTICATIONFAILED");
  });

  it("authenticationFailed 플래그만 있어도 인증 안내를 낸다", () => {
    const error = Object.assign(new Error("Command failed"), { authenticationFailed: true });
    expect(explain(error)).toContain("네이버가 로그인을 거부했습니다");
  });

  it("포트가 막히면 네트워크 안내를 낸다", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:993"), {
      code: "ECONNREFUSED",
    });
    const out = explain(error);
    expect(out).toContain("993 포트가 열린 곳에서 돌아야");
    expect(out).toContain("ECONNREFUSED");
  });

  it("모르는 오류는 메시지를 그대로 보여준다", () => {
    expect(explain(new Error("무슨 일인지 모를 오류"))).toContain("무슨 일인지 모를 오류");
  });

  it("객체가 아닌 값도 터지지 않는다", () => {
    expect(() => explain("문자열 오류")).not.toThrow();
    expect(() => explain(null)).not.toThrow();
  });
});

describe("usernameCandidates", () => {
  it("아이디만 주면 아이디 먼저, 전체 주소를 다음으로", () => {
    expect(usernameCandidates("coach0179")).toEqual(["coach0179", "coach0179@naver.com"]);
  });

  it("전체 주소를 주면 그걸 먼저, 아이디를 다음으로", () => {
    expect(usernameCandidates("coach0179@naver.com")).toEqual([
      "coach0179@naver.com",
      "coach0179",
    ]);
  });

  it("앞뒤 공백을 떼어낸다", () => {
    expect(usernameCandidates("  coach0179  ")[0]).toBe("coach0179");
  });

  it("빈 입력이면 후보가 없다", () => {
    expect(usernameCandidates("   ")).toEqual([]);
  });

  it("중복을 만들지 않는다", () => {
    const out = usernameCandidates("coach0179");
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("isAuthFailure", () => {
  it("네이버의 실제 거부 응답을 인증 실패로 읽는다", () => {
    const error = Object.assign(new Error("Command failed"), {
      responseText: '"coach0179@naver.com": Authentication failed. (Please check your username, password)',
      serverResponseCode: "AUTH",
    });
    expect(isAuthFailure(error)).toBe(true);
  });

  it("네트워크 오류는 인증 실패가 아니다 — 다른 아이디로 재시도해도 소용없다", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:993"), {
      code: "ECONNREFUSED",
    });
    expect(isAuthFailure(error)).toBe(false);
  });
});

describe("isMonth", () => {
  it("YYYY-MM 만 통과시킨다", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-12")).toBe(true);
    expect(isMonth("2026-01")).toBe(true);
  });

  it("월 범위를 벗어나면 거부한다", () => {
    expect(isMonth("2026-00")).toBe(false);
    expect(isMonth("2026-13")).toBe(false);
  });

  it("형식이 다르면 거부한다", () => {
    expect(isMonth("2026-9")).toBe(false);
    expect(isMonth("202609")).toBe(false);
    expect(isMonth("")).toBe(false);
  });

  it("셸 메타문자가 섞이면 거부한다 — shell:true 로 넘어가는 값이다", () => {
    expect(isMonth("2026-09 && calc")).toBe(false);
    expect(isMonth("2026-09; rm -rf /")).toBe(false);
    expect(isMonth("2026-09`whoami`")).toBe(false);
    expect(isMonth("$(whoami)")).toBe(false);
  });
});
