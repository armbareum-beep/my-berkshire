/**
 * 받아둔 보안메일 첨부를 전부 풀어 읽고, 계좌별 요약을 찍는다.
 *
 *   npx tsx automation/broker-statements/extract.ts --since 2026-09-18
 *
 * 비밀번호는 STATEMENT_PASSWORDS(쉼표 구분) 환경변수나 .env.local 에서 읽고,
 * 없으면 한 번 물어본다(화면에 찍지 않는다). 값은 어디에도 기록하지 않는다.
 *
 * DB 는 건드리지 않는다. 읽은 결과를 사람이 확인할 수 있게 내놓기만 한다.
 */
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptStatement, detectBroker } from "./decrypt";
import { parseKb, parseKiwoom, type ParsedStatement } from "./parse";
import { monthlyIncome } from "./reconcile";
import { loadEnvLocal, saveEnv } from "./env";

const PASSWORD_KEY = "STATEMENT_PASSWORDS";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function askHidden(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error(`${PASSWORD_KEY} 환경변수를 설정하거나 터미널에서 실행해 주세요.`));
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
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** downloads 아래의 .html 첨부를 모두 찾는다(증권사/날짜 두 단계). */
async function findStatements(root: string): Promise<{ file: string; mailDate: string }[]> {
  const out: { file: string; mailDate: string }[] = [];
  for (const broker of await readdir(root).catch(() => [])) {
    const brokerDir = path.join(root, broker);
    for (const day of await readdir(brokerDir).catch(() => [])) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const dayDir = path.join(brokerDir, day);
      for (const name of await readdir(dayDir).catch(() => [])) {
        if (name.toLowerCase().endsWith(".html")) {
          out.push({ file: path.join(dayDir, name), mailDate: day });
        }
      }
    }
  }
  return out.sort((a, b) => a.mailDate.localeCompare(b.mailDate) || a.file.localeCompare(b.file));
}

async function main() {
  const root = path.resolve(
    arg("dir") ?? path.join("automation", "broker-statements", "downloads"),
  );
  const since = arg("since") ?? "";
  const outPath = arg("out") ?? path.join(root, "statements.json");

  const files = await findStatements(root);
  if (!files.length) {
    console.error(`${root} 아래에 .html 첨부가 없습니다. 먼저 fetch.ts 로 받아 주세요.`);
    process.exit(1);
  }

  loadEnvLocal();
  let raw = process.env[PASSWORD_KEY] ?? "";
  const asked = !raw;
  if (!raw) {
    console.log("보안메일 해제값(개인은 주민등록번호 앞 6자리)을 쉼표로 구분해 넣어 주세요.");
    console.log("가족 계좌가 섞여 있으면 사람마다 다르니 전부 넣으면 알아서 맞춰 씁니다.\n");
    raw = await askHidden("비밀번호 (화면에 안 보입니다): ");
  }
  const passwords = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!passwords.length) {
    console.error("비밀번호가 비어 있습니다.");
    process.exit(1);
  }

  if (asked) {
    const file = await saveEnv({ [PASSWORD_KEY]: passwords.join(",") });
    console.log(`\n${file} 에 저장했습니다. 다음부터는 묻지 않습니다.`);
    console.log(`(지우고 싶으면 그 파일에서 ${PASSWORD_KEY} 줄을 삭제하세요.)`);
  }

  console.log(`\n${files.length}개 파일을 풉니다...\n`);
  const parsed: (ParsedStatement & { file: string; mailDate: string })[] = [];
  const failed: { file: string; reason: string }[] = [];

  for (const { file, mailDate } of files) {
    const name = path.basename(file);
    try {
      const { rows } = await decryptStatement(file, passwords);
      const broker = detectBroker(rows);
      if (!broker) {
        failed.push({ file: name, reason: "KB·키움 양식이 아닙니다" });
        continue;
      }
      const statement = broker === "KB증권" ? parseKb(rows) : parseKiwoom(rows);
      parsed.push({ ...statement, file: name, mailDate });
      const income = monthlyIncome(statement);
      const skip = since && statement.periodTo < since;
      console.log(
        `${skip ? "건너뜀" : "읽음  "} ${mailDate} ${name}\n` +
          `        ${statement.broker} · ${statement.accountName}` +
          `${statement.accountLabel ? " · " + statement.accountLabel : ""} · ${statement.accountNo}\n` +
          `        기간 ${statement.periodFrom}~${statement.periodTo} · 예수금 ${statement.cash.toLocaleString()}` +
          ` · 보유 ${statement.holdings.length}종목 · 거래 ${statement.events.length}건` +
          ` · 배당 ${income.dividend.toLocaleString()} · 이자 ${income.interest.toLocaleString()}`,
      );
    } catch (error) {
      failed.push({ file: name, reason: error instanceof Error ? error.message : String(error) });
      console.log(`실패   ${mailDate} ${name}`);
    }
  }

  const kept = since ? parsed.filter((s) => s.periodTo >= since) : parsed;
  await writeFile(outPath, JSON.stringify(kept, null, 2));

  console.log(`\n읽기 성공 ${parsed.length} / 실패 ${failed.length}`);
  if (since) console.log(`${since} 이후로 추린 명세서 ${kept.length}건`);
  for (const f of failed) console.log(`  실패: ${f.file} — ${f.reason}`);
  console.log(`\n결과: ${outPath}`);
  console.log("이 파일에는 계좌번호(가림)·잔고·거래가 들어 있습니다. 비밀번호는 들어가지 않습니다.");
}

main().catch((error) => {
  console.error("실패:", error instanceof Error ? error.message : error);
  process.exit(1);
});
