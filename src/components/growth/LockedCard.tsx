import Link from "next/link";

export function LockedCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-2xl bg-secondary p-5">
      <p className="text-sm font-semibold text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
