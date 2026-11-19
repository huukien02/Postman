"use client";

import dynamic from "next/dynamic";
import type { CodeEditorProps } from "./CodeEditorInner";

/** CodeMirror chỉ chạy trên browser -> tải động, không SSR. */
const CodeEditorInner = dynamic(() => import("./CodeEditorInner"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-subtle/50" />,
});

export type { CodeLang } from "./CodeEditorInner";

export default function CodeView(props: CodeEditorProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <CodeEditorInner {...props} />
    </div>
  );
}
