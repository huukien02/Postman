"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Tabs } from "@/components/common/ui";
import RequestTree from "./RequestTree";
import HistoryList from "./HistoryList";

type Tab = "requests" | "history";

export default function Sidebar() {
  const open = useStore((s) => s.sidebarOpen);
  const [tab, setTab] = useState<Tab>("requests");

  if (!open) return null;
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel lg:w-72">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "requests", label: "Requests" },
          { id: "history", label: "Lịch sử" },
        ]}
      />
      <div className="min-h-0 flex-1">{tab === "requests" ? <RequestTree /> : <HistoryList />}</div>
    </aside>
  );
}
