"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCheck, ExternalLink } from "lucide-react";
import { markDisclosuresRead } from "@/app/disclosures/actions";
import type { FeedDisclosure } from "@/lib/finance/disclosureFeed";

const PRIORITY_LABEL = {
  important: "중요",
  reference: "참고",
  noise: "기타",
} as const;

export function DisclosureFeed({
  items,
  initialReadKeys,
  title,
  allHref,
}: {
  items: FeedDisclosure[];
  initialReadKeys: string[];
  title?: string;
  allHref?: string;
}) {
  const [read, setRead] = useState(() => new Set(initialReadKeys));
  const [, startTransition] = useTransition();
  const unread = items.filter((item) => !read.has(item.readKey));

  const persist = (keys: string[]) => {
    setRead((current) => new Set([...current, ...keys]));
    startTransition(async () => markDisclosuresRead(keys));
  };

  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
        이 조건의 공시가 없습니다.
      </p>
    );
  }

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {title && <p className="text-sm font-semibold">{title}</p>}
          <p className={title ? "mt-0.5 text-xs text-muted-foreground" : "text-xs text-muted-foreground"}>
            {items.length}건 · 미확인 {unread.length}건
          </p>
        </div>
        {allHref && (
          <Link href={allHref} className="ml-auto shrink-0 text-xs font-semibold text-muted-foreground">
            전체 보기 ›
          </Link>
        )}
        {unread.length > 0 && (
          <button
            type="button"
            onClick={() => persist(unread.map((item) => item.readKey))}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"
          >
            <CheckCheck size={14} /> 모두 읽음
          </button>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => {
          const isRead = read.has(item.readKey);
          return (
            <li key={item.rceptNo} className={isRead ? "opacity-55" : ""}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => !isRead && persist([item.readKey])}
                className="flex items-start gap-3 py-4"
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    isRead
                      ? "bg-border"
                      : item.priority === "important"
                        ? "bg-warn"
                        : "bg-primary"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {PRIORITY_LABEL[item.priority]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.corpName} · {item.date}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm font-semibold leading-5">
                    {item.title}
                  </span>
                  {item.hint && (
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {item.hint.text}
                    </span>
                  )}
                </span>
                <ExternalLink size={14} className="mt-1 shrink-0 text-muted-foreground" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
