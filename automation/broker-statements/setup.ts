/**
 * 네이버 메일 IMAP 연결 설치 — 이것 하나만 돌리면 된다.
 *
 *   npx tsx automation/broker-statements/setup.ts
 *
 * 이메일·앱 비밀번호를 물어보고 → .env.local 에 저장 → 실제 접속을 시험하고
 * → 성공하면 그 기간 발신자를 훑어(--discover) 보여준다.
 *
 * 비밀번호는 화면에 찍지 않고, 저장 파일은 소유자만 읽도록(0600) 만든다.
 */
import { ImapFlow } from "imapflow";
import { readFile, writeFile, chmod, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const HOST = "imap.naver.com";
const PORT = 993;
const ENV_FILE = ".env.local";
const USER_KEY = "NAVER_MAIL_USER";
const PASS_KEY = "NAVER_MAIL_APP_PASSWORD";

function ask(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("터미널에서 직접 실행해 주세요."));
      return;
    }
    process.stdout.write(query);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      resolve(chunk.replace(/[\r\n]+$/, "").trim());
    };
    process.stdin.on("data", onData);
  });
}

/** 입력을 화면에 찍지 않는 프롬프트. 비밀번호가 터미널·스크롤백에 남지 않는다. */
function askHidden(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("터미널에서 직접 실행해 주세요."));
      return;
    }
    process.stdout.write(query);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(value.trim());
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n취소했습니다.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/**
 * 기존 .env 내용을 보존하면서 우리 키 두 개만 갈아끼운다.
 * 다른 줄(주석·빈 줄·남의 변수)은 순서까지 그대로 남긴다.
 */
export function mergeEnv(existing: string, user: string, pass: string): string {
  const lines = existing ? existing.split(/\r?\n/) : [];
  const kept = lines.filter((line) => {
    const key = line.split("=")[0]?.trim();
    return key !== USER_KEY && key !== PASS_KEY;
  });
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  kept.push(`${USER_KEY}=${user}`, `${PASS_KEY}=${pass}`, "");
  return kept.join("\n");
}

async function saveEnv(user: string, pass: string): Promise<string> {
  const file = path.resolve(ENV_FILE);
  let existing = "";
  try {
    await access(file);
    existing = await readFile(file, "utf8");
  } catch {
    existing = "";
  }
  await writeFile(file, mergeEnv(existing, user, pass), { mode: 0o600 });
  await chmod(file, 0o600);
  return file;
}

/**
 * ImapFlow 는 쓸 만한 정보를 message 가 아니라 responseText·serverResponseCode·
 * authenticationFailed 에 담는다. message 만 보면 "Command failed" 밖에 안 나온다.
 */
function detailsOf(error: unknown): { text: string; authFailed: boolean } {
  const parts: string[] = [];
  let authFailed = false;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (e.authenticationFailed === true) authFailed = true;
    for (const key of ["responseText", "serverResponseCode", "response", "code"]) {
      const value = e[key];
      if (value !== undefined && value !== null && value !== "") {
        parts.push(`${key}: ${String(value)}`);
      }
    }
  }
  return { text: parts.join(" / "), authFailed };
}

/** 자격증명 문제인가(= 다른 사용자명으로 재시도할 가치가 있는가). */
export function isAuthFailure(error: unknown): boolean {
  const { text, authFailed } = detailsOf(error);
  const message = error instanceof Error ? error.message : String(error);
  return (
    authFailed ||
    /AUTHENTICATIONFAILED|Authentication failed|LOGIN failed|Invalid credentials|\[AUTH\]|Command failed/i.test(
      message + " " + text,
    )
  );
}

/**
 * 네이버 메일의 IMAP 안내 화면은 사용자명으로 '아이디'(coach0179)를 쓰라고 적는다.
 * 전체 주소가 통하는 계정도 있어 어느 쪽이 맞는지 미리 알 수 없으므로, 입력한 형태를
 * 먼저 시도하고 실패하면 다른 형태로 한 번 더 시도한다.
 */
export function usernameCandidates(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const out: string[] = [];
  const add = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };
  add(trimmed);
  if (trimmed.includes("@")) add(trimmed.split("@")[0]);
  else add(`${trimmed}@naver.com`);
  return out;
}

export function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const { text: detail, authFailed } = detailsOf(error);
  const withDetail = (lines: string[]) =>
    (detail ? [...lines, "", `서버 응답 — ${detail}`] : lines).join("\n");
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH/i.test(message)) {
    return withDetail([
      `${HOST}:${PORT} 에 닿지 못했습니다 (${message}).`,
      "",
      "이 스크립트는 993 포트가 열린 곳에서 돌아야 합니다.",
      "Claude Code 클라우드 세션은 HTTPS 만 나가므로 여기서는 실행되지 않습니다 —",
      "본인 컴퓨터 터미널에서 돌려 주세요.",
    ]);
  }
  if (authFailed || isAuthFailure(error)) {
    return withDetail([
      "네이버가 로그인을 거부했습니다. 아이디·비밀번호 두 형태를 모두 시도했습니다.",
      "",
      "  1. 일반 로그인 비밀번호를 넣었다 → 2단계 인증의 '애플리케이션 비밀번호'(12자리, 대문자+숫자)가 필요",
      "  2. 앱 비밀번호를 새로 발급하고 예전 것을 넣었다 → 가장 최근 것으로",
      "  3. 붙여넣을 때 앞뒤 공백이나 줄바꿈이 섞였다 → 12자만 정확히",
      "  4. 메일 환경설정 → POP3/IMAP 설정에서 'IMAP 사용'을 켜고 저장했는지 확인",
      "     (ID 설정이 아니라 '메일' 쪽 환경설정입니다.)",
    ]);
  }
  return withDetail([message]);
}

async function testConnection(user: string, pass: string): Promise<void> {
  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  await client.connect();
  const mailbox = await client.getMailboxLock("INBOX");
  try {
    // 연결과 권한만 확인한다. 메일 내용은 읽지 않는다.
  } finally {
    mailbox.release();
    await client.logout();
  }
}

function runDiscover(user: string, pass: string, from: string, to: string): Promise<number> {
  const script = path.join("automation", "broker-statements", "fetch.ts");
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", script, "--from", from, "--to", to, "--discover"], {
      stdio: "inherit",
      env: { ...process.env, [USER_KEY]: user, [PASS_KEY]: pass },
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  console.log("네이버 메일 IMAP 연결 설치\n");
  console.log("먼저 네이버에서 아래 두 가지가 되어 있어야 합니다:");
  console.log("  · 2단계 인증 → 애플리케이션 비밀번호 발급 (12자리, 대문자+숫자)");
  console.log("  · 메일 환경설정 → POP3/IMAP 설정 → IMAP 사용 ON\n");

  let user = process.env[USER_KEY] ?? "";
  for (let attempt = 0; !user && attempt < 3; attempt++) {
    user = await ask("네이버 아이디 또는 메일 주소 (예: coach0179): ");
  }
  if (!user) {
    console.error("\n아이디를 받지 못했습니다. 다시 돌려 주세요.");
    process.exit(1);
  }
  const pass = process.env[PASS_KEY] ?? (await askHidden("애플리케이션 비밀번호 (화면에 안 보입니다): "));
  if (!pass) {
    console.error("\n비밀번호가 비어 있습니다.");
    process.exit(1);
  }

  const candidates = usernameCandidates(user);
  let working = "";
  let lastError: unknown;
  for (const candidate of candidates) {
    process.stdout.write(`\n접속 확인 중 (${candidate})... `);
    try {
      await testConnection(candidate, pass);
      working = candidate;
      console.log("성공");
      break;
    } catch (error) {
      lastError = error;
      console.log("실패");
      // 자격증명 문제가 아니면(네트워크 등) 다른 아이디 형태로 바꿔도 소용없다.
      if (!isAuthFailure(error)) break;
    }
  }
  if (!working) {
    console.log("");
    console.error(explain(lastError));
    console.error("\n고친 뒤 다시 돌려 주세요. 저장된 건 없습니다.");
    process.exit(1);
  }
  if (working !== user.trim()) {
    console.log(`→ '${working}' 형태로 로그인됐습니다. 이 값으로 저장합니다.`);
  }
  user = working;
  console.log("");

  const file = await saveEnv(user, pass);
  console.log(`저장: ${file} (소유자만 읽기, git 에는 올라가지 않습니다)\n`);

  const from = (await ask("훑어볼 시작 월 [2026-09]: ")) || "2026-09";
  const to = (await ask("끝 월 [2026-10]: ")) || "2026-10";

  console.log("");
  const code = await runDiscover(user, pass, from, to);
  if (code !== 0) {
    console.error("\n훑어보기가 실패했습니다. 위 메시지를 확인해 주세요.");
    process.exit(code);
  }

  console.log("\n설치 끝입니다.");
  console.log("위 목록에서 KB증권·키움증권 발신 주소를 확인해 Claude 에게 알려 주시면");
  console.log("규칙을 맞춰 넣겠습니다. 그 뒤로는 아래 한 줄이면 첨부가 내려받아집니다:\n");
  console.log(`  npx tsx automation/broker-statements/fetch.ts --from ${from} --to ${to}`);
}

const invokedDirectly = process.argv[1]?.includes("setup.ts");
if (invokedDirectly) {
  main().catch((error) => {
    console.error("\n실패:", explain(error));
    process.exit(1);
  });
}
