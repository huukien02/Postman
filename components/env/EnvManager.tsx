"use client";

import { useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import { kv } from "@/lib/id";
import { firebaseEnabled } from "@/lib/firebase-config";
import Modal from "@/components/common/Modal";
import KeyValueEditor from "@/components/request/KeyValueEditor";
import { Button, cx } from "@/components/common/ui";

export default function EnvManager() {
  const open = useStore((s) => s.modal === "env");
  const setModal = useStore((s) => s.setModal);
  return (
    <Modal open={open} onClose={() => setModal(null)} title="Môi trường & biến" className="h-[70vh] max-w-3xl">
      {open && <Body />}
    </Modal>
  );
}

function Body() {
  const s = useStore();
  const [selected, setSelected] = useState<string | null>(() => s.activeEnvId ?? s.envs[0]?.id ?? null);
  const env = s.envs.find((e) => e.id === selected) ?? null;

  /** Tạo nhanh bộ Dev + Prod có sẵn biến baseUrl, token. */
  const quickStart = () => {
    const dev = s.createEnv("Dev");
    s.updateEnv(dev, { vars: [kv("baseUrl", "http://localhost:3000"), kv("token", "")] });
    const prod = s.createEnv("Prod");
    s.updateEnv(prod, { vars: [kv("baseUrl", "https://api.example.com"), kv("token", "")] });
    s.setActiveEnv(dev);
    setSelected(dev);
  };

  if (!s.envs.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="max-w-md text-sm text-muted">
          Môi trường chứa các biến như <code className="font-mono text-fg">{"{{baseUrl}}"}</code>,{" "}
          <code className="font-mono text-fg">{"{{token}}"}</code>. Đổi môi trường là đổi toàn bộ giá trị,
          không phải sửa từng request.
        </p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={quickStart}>
            Tạo nhanh Dev + Prod
          </Button>
          <Button variant="outline" onClick={() => setSelected(s.createEnv())}>
            <Plus size={14} /> Môi trường trống
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Danh sách env */}
      <div className="flex w-48 shrink-0 flex-col border-r border-line">
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {s.envs.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e.id)}
              className={cx(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                e.id === selected ? "bg-accent/10 font-medium" : "hover:bg-subtle",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {e.id === s.activeEnvId && <CheckCircle2 size={13} className="shrink-0 text-accent" />}
            </button>
          ))}
        </div>
        <div className="border-t border-line p-1.5">
          <Button size="sm" className="w-full justify-start" onClick={() => setSelected(s.createEnv())}>
            <Plus size={14} /> Thêm môi trường
          </Button>
        </div>
      </div>

      {/* Chi tiết env */}
      {env ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <input
              key={env.id}
              defaultValue={env.name}
              aria-label="Tên môi trường"
              onBlur={(e) => s.updateEnv(env.id, { name: e.target.value.trim() || env.name })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm font-medium outline-none hover:bg-subtle focus:bg-subtle"
            />
            {env.id === s.activeEnvId ? (
              <span className="text-xs text-accent">Đang dùng</span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => s.setActiveEnv(env.id)}>
                Dùng env này
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              title="Xóa môi trường"
              onClick={() => {
                if (!confirm(`Xóa môi trường "${env.name}"?`)) return;
                s.deleteEnv(env.id);
                setSelected(s.envs.find((e) => e.id !== env.id)?.id ?? null);
              }}
            >
              <Trash2 size={13} />
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <KeyValueEditor
              key={env.id}
              rows={env.vars}
              onChange={(vars) => s.updateEnv(env.id, { vars })}
              separator="="
              keyPlaceholder="Tên biến"
              valuePlaceholder="Giá trị"
            />
          </div>
          <p className="border-t border-line px-3 py-2 text-xs text-muted">
            Dùng trong URL, params, headers, body, token: <code className="font-mono">{"{{tênBiến}}"}</code>.
            {firebaseEnabled ? "Đồng bộ lên Firestore." : "Dữ liệu chỉ lưu trên trình duyệt này."}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">Chọn một môi trường</div>
      )}
    </div>
  );
}
