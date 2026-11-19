"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Method } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------------- Màu theo method ---------------- */
const METHOD_VAR: Record<Method, string> = {
  GET: "var(--m-get)",
  POST: "var(--m-post)",
  PUT: "var(--m-put)",
  PATCH: "var(--m-patch)",
  DELETE: "var(--m-delete)",
  HEAD: "var(--m-other)",
  OPTIONS: "var(--m-other)",
};
export const methodColor = (m: Method) => METHOD_VAR[m];

export function MethodTag({ method, className }: { method: Method; className?: string }) {
  return (
    <span
      className={cx("font-mono text-[11px] font-semibold tracking-tight", className)}
      style={{ color: methodColor(method) }}
    >
      {method === "DELETE" ? "DEL" : method === "OPTIONS" ? "OPT" : method}
    </span>
  );
}

/* ---------------- Button ---------------- */
type Variant = "primary" | "ghost" | "outline" | "danger";

export function Button({
  variant = "ghost",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent",
        size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "ghost" && "text-muted hover:bg-subtle hover:text-fg",
        variant === "outline" && "border border-line text-fg hover:bg-subtle",
        variant === "danger" && "border border-err/40 text-err hover:bg-err/10",
        className,
      )}
      {...rest}
    />
  );
}

/* ---------------- Tabs ---------------- */
export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  /** Số đếm nhỏ cạnh tên tab (vd: 3 headers). */
  count?: number;
  dot?: boolean;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  right,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (v: T) => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-line px-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx(
            "relative -mb-px flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-sm transition-colors",
            value === t.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {t.label}
          {!!t.count && (
            <span className="rounded bg-subtle px-1.5 text-[11px] leading-4 text-muted">{t.count}</span>
          )}
          {t.dot && <span className="size-1.5 rounded-full bg-accent" />}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1">{right}</div>
    </div>
  );
}

/* ---------------- Segmented (chọn 1 trong n, nhỏ gọn) ---------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cx(
            "rounded px-2.5 py-1 text-xs transition-colors",
            value === o.id ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Kbd ---------------- */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}

/* ---------------- Format ---------------- */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}
