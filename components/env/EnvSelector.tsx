"use client";

import { Check, ChevronDown, Layers, Settings2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import Menu from "@/components/common/Menu";
import { cx } from "@/components/common/ui";

export default function EnvSelector() {
  const envs = useStore((s) => s.envs);
  const activeId = useStore((s) => s.activeEnvId);
  const setActiveEnv = useStore((s) => s.setActiveEnv);
  const setModal = useStore((s) => s.setModal);
  const active = envs.find((e) => e.id === activeId);

  return (
    <Menu
      trigger={({ onClick, open }) => (
        <button
          type="button"
          onClick={onClick}
          title="Môi trường (biến {{...}})"
          className={cx(
            "flex h-8 max-w-56 items-center gap-1.5 rounded-md border px-2.5 text-[13px]",
            open ? "border-accent" : "border-line hover:border-accent/50",
            active ? "text-fg" : "text-muted",
          )}
        >
          <Layers size={14} className={active ? "text-accent" : ""} />
          <span className="truncate">{active?.name ?? "Không có env"}</span>
          <ChevronDown size={13} className="shrink-0 text-muted" />
        </button>
      )}
      items={[
        ...envs.map((e) => ({
          label: e.name,
          icon: <Check size={13} className={e.id === activeId ? "opacity-100" : "opacity-0"} />,
          onClick: () => setActiveEnv(e.id),
        })),
        {
          label: "Không dùng env",
          icon: <Check size={13} className={!activeId ? "opacity-100" : "opacity-0"} />,
          onClick: () => setActiveEnv(null),
        },
        { label: "Quản lý môi trường…", icon: <Settings2 size={13} />, onClick: () => setModal("env") },
      ]}
    />
  );
}
