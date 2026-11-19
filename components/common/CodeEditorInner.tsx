"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { linter } from "@codemirror/lint";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { useDarkMode } from "@/lib/hooks";
import { selectStringOnDoubleClick } from "@/lib/cm-select-string";

export type CodeLang = "json" | "html" | "text";

export interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  lang?: CodeLang;
  readOnly?: boolean;
  placeholder?: string;
  /** Bật kiểm tra lỗi JSON (gạch đỏ). */
  lint?: boolean;
  wrap?: boolean;
}

export default function CodeEditorInner({
  value,
  onChange,
  lang = "text",
  readOnly,
  placeholder,
  lint,
  wrap,
}: CodeEditorProps) {
  const dark = useDarkMode();

  const extensions = useMemo(() => {
    const ext = [
      // Ctrl+Enter: chặn "chèn dòng trống" mặc định của CodeMirror.
      // Việc gửi request do phím tắt toàn cục (lib/hotkeys.ts) xử lý.
      Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => true }])),
      EditorView.theme({
        "&": { backgroundColor: "transparent" },
        ".cm-gutters": { backgroundColor: "transparent", borderRight: "1px solid var(--line)" },
      }),
    ];
    if (lang === "json") ext.push(json(), selectStringOnDoubleClick);
    if (lang === "html") ext.push(html());
    if (lint && lang === "json") ext.push(linter(jsonParseLinter(), { delay: 300 }));
    if (wrap) ext.push(EditorView.lineWrapping);
    return ext;
  }, [lang, lint, wrap]);

  return (
    <CodeMirror
      className="cm-fill"
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={dark ? "dark" : "light"}
      readOnly={readOnly}
      editable={!readOnly}
      placeholder={placeholder}
      height="100%"
      basicSetup={{
        foldGutter: true,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
        autocompletion: !readOnly,
        searchKeymap: true,
      }}
    />
  );
}
