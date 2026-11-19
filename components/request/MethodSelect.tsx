"use client";

import { METHODS, type Method } from "@/lib/types";
import { methodColor } from "@/components/common/ui";

export default function MethodSelect({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <select
      aria-label="HTTP method"
      value={value}
      onChange={(e) => onChange(e.target.value as Method)}
      className="h-full cursor-pointer appearance-none rounded-l-md border-r border-line bg-transparent pr-6 pl-3 font-mono text-[13px] font-semibold outline-none hover:bg-subtle"
      style={{
        color: methodColor(value),
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238b94a3'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {METHODS.map((m) => (
        <option key={m} value={m} style={{ color: methodColor(m) }}>
          {m}
        </option>
      ))}
    </select>
  );
}
