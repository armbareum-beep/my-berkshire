/**
 * 네이버 메일에서 KB증권·키움증권 거래내역 첨부를 IMAP 으로 받아온다.
 *
 * 쓰는 법은 README.md 참고. 자격증명은 환경변수로만 받고 어디에도 기록하지 않는다.
 *
 *   NAVER_MAIL_USER=me@naver.com NAVER_MAIL_APP_PASSWORD=... \
 *     npx tsx automation/broker-statements/fetch.ts --from 2026-09 --to 2026-10
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_RULES,
  identifyBroker,
  isStatementAttachment,
  classifyAttachment,
  safeFilename,
  monthRange,
  type BrokerRule,
} from "./match";

const HOST = "imap.naver.com";
const PORT = 993;

interface Args {
  from: string;
  to: string;
  out: string;
  mailbox: string;
  discover: boolean;
  rulesPath?: string;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const from = get("from");
  const to = get("to");
  if (!from || !to) {
    throw new Error("--from YYYY-MM 과 --to YYYY-MM 은 필수입니다. 예: --from 2026-09 --to 2026-10");
  }
  return {
    from,
    to,
    out: get("out") ?? path.join("automation", "broker-statements", "downloads"),
    mailbox: get("mailbox") ?? "INBOX",
    discover: argv.includes("--discover"),
    rulesPath: get("rules"),
  };
}

async function loadRules(rulesPath?: string): Promise<BrokerRule[]> {
  if (!rulesPath) return DEFAULT_RULES;
  const { readFile } = await import("node:fs/promises");
  const parsed = JSON.parse(await readFile(rulesPath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("규칙 파일은 BrokerRule 배열이어야 합니다.");
  return parsed as BrokerRule[];
}

interface SavedAttachment {
  broker: string;
  messageDate: string;
  subject: string;
  from: string;
  filename: string;
  kind: string;
  bytes: number;
  savedTo: string;
  /** 열어 보기 전까지는 암호 여부를 알 수 없다. zip/xlsx 는 받은 뒤 확인한다. */
  note?: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const user = process.env.NAVER_MAIL_USER;
  const pass = process.env.NAVER_MAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error(
      "NAVER_MAIL_USER 와 NAVER_MAIL_APP_PASSWORD 환경변수가 필요합니다.\n" +
        "네이버 2단계 인증의 '애플리케이션 비밀번호'(12자리, 대문자+숫자)를 쓰고, 메일 환경설정에서 IMAP 사용을 켜 두세요.",
    );
    process.exit(1);
  }

  const { since, before } = monthRange(args.from, args.to);
  const rules = await loadRules(args.rulesPath);

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  console.log(`${HOST}:${PORT} 접속 — ${args.from} ~ ${args.to} (${args.mailbox})`);
  await client.connect();

  const saved: SavedAttachment[] = [];
  const discovered: { date: string; from: string; subject: string; attachments: string[] }[] = [];
  let scanned = 0;

  const lock = await client.getMailboxLock(args.mailbox);
  try {
    // IMAP SINCE/BEFORE 는 날짜 단위이고 before 는 미포함이다.
    for await (const message of client.fetch({ since, before }, { source: true, envelope: true })) {
      scanned += 1;
      if (!message.source) continue;
      const parsed = await simpleParser(message.source);
      const fromText = parsed.from?.text ?? "";
      const subject = parsed.subject ?? "";
      const dateIso = (parsed.date ?? new Date(0)).toISOString().slice(0, 10);
      const attachments = (parsed.attachments ?? []).filter((a) => a.filename);

      if (args.discover) {
        discovered.push({
          date: dateIso,
          from: fromText,
          subject,
          attachments: attachments.map((a) => a.filename as string),
        });
        continue;
      }

      const broker = identifyBroker(fromText, subject, rules);
      if (!broker) continue;

      for (const attachment of attachments) {
        const original = attachment.filename as string;
        if (!isStatementAttachment(original)) continue;
        const filename = safeFilename(original);
        // 첨부는 외부에서 온 데이터다. 증권사·날짜별 빈 디렉터리에만 쓴다.
        const dir = path.resolve(args.out, broker, dateIso);
        await mkdir(dir, { recursive: true });
        const savedTo = path.join(dir, filename);
        await writeFile(savedTo, attachment.content);
        saved.push({
          broker,
          messageDate: dateIso,
          subject,
          from: fromText,
          filename,
          kind: classifyAttachment(filename),
          bytes: attachment.content.length,
          savedTo,
        });
        console.log(`  저장: ${broker} ${dateIso} ${filename} (${attachment.content.length} bytes)`);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  if (args.discover) {
    console.log(`\n훑어본 메일 ${scanned}통 — 발신자별 집계\n`);
    const bySender = new Map<string, { count: number; subjects: Set<string>; files: Set<string> }>();
    for (const d of discovered) {
      const key = d.from || "(발신자 없음)";
      const entry = bySender.get(key) ?? { count: 0, subjects: new Set(), files: new Set() };
      entry.count += 1;
      entry.subjects.add(d.subject);
      d.attachments.forEach((f) => entry.files.add(f));
      bySender.set(key, entry);
    }
    for (const [sender, e] of [...bySender].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`${sender}  (${e.count}통)`);
      [...e.subjects].slice(0, 3).forEach((s) => console.log(`    제목: ${s}`));
      if (e.files.size) console.log(`    첨부: ${[...e.files].slice(0, 5).join(", ")}`);
    }
    const reportPath = path.resolve(args.out, "discover.json");
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(discovered, null, 2));
    console.log(`\n전체 목록: ${reportPath}`);
    return;
  }

  const manifestPath = path.resolve(args.out, "manifest.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(saved, null, 2));

  console.log(`\n메일 ${scanned}통 확인, 첨부 ${saved.length}개 저장.`);
  if (!saved.length) {
    console.log(
      "받은 게 없습니다. --discover 로 이 기간의 실제 발신자·제목을 확인한 뒤\n" +
        "match.ts 의 DEFAULT_RULES 를 고치거나 --rules 로 규칙 파일을 넘기세요.",
    );
  } else {
    console.log(`목록: ${manifestPath}`);
  }
}

main().catch((error) => {
  // 자격증명이 메시지에 섞여 나가지 않도록 메시지만 찍는다.
  console.error("실패:", error instanceof Error ? error.message : error);
  process.exit(1);
});
