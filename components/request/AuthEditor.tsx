"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AuthType } from "@/lib/types";
import { Segmented } from "@/components/common/ui";

interface Props {
  auth: { type: AuthType; token: string };
  hasAuthHeader: boolean;
  onChange: (auth: { type: AuthType; token: string }) => void;
}

export default function AuthEditor({ auth, hasAuthHeader, onChange }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-3 px-3 py-2">
      <Segmented<AuthType>
        value={auth.type}
        onChange={(type) => onChange({ ...auth, type })}
        options={[
          { id: "none", label: "Không có" },
          { id: "bearer", label: "Bearer token" },
        ]}
      />
      {auth.type === "bearer" && (
        <div className="space-y-1.5">
          <div className="flex h-9 items-center rounded-md border border-line focus-within:border-accent">
            <span className="pl-3 font-mono text-xs text-muted">Bearer</span>
            <input
              spellCheck={false}
              type={show ? "text" : "password"}
              value={auth.token}
              placeholder="{{token}} hoặc dán token"
              onChange={(e) => onChange({ ...auth, token: e.target.value })}
              className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[13px] outline-none placeholder:text-muted/60"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Ẩn token" : "Hiện token"}
              className="px-3 text-muted hover:text-fg"
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="text-xs text-muted">
            Gợi ý: lưu token vào biến môi trường rồi gõ <code className="font-mono">{"{{token}}"}</code>, đổi env là đổi token.
          </p>
          {hasAuthHeader && (
            <p className="text-xs text-warn">
              Tab Headers đã có header Authorization, header đó sẽ được dùng thay cho token ở đây.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
