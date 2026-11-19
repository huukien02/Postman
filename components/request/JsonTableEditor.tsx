"use client";

import { useState } from "react";
import type { KeyValue } from "@/lib/types";
import { jsonToRows, rowsToJson } from "@/lib/json-table";
import KeyValueEditor from "./KeyValueEditor";

interface Props {
  body: string;
  onChange: (body: string) => void;
  /** Body không phải object 1 cấp (mảng, JSON lỗi) -> nhờ chuyển sang dạng code. */
  onNeedCode: () => void;
}

/**
 * Nhập body JSON dạng bảng: mỗi dòng 1 key, không cần gõ nháy kép / dấu phẩy / ngoặc.
 * Giá trị tự đoán kiểu: 123 -> số, true/false, null, {..}/[..] -> object/mảng, còn lại -> chuỗi.
 * Muốn ép chuỗi thì bọc nháy kép: "123".
 */
export default function JsonTableEditor({ body, onChange, onNeedCode }: Props) {
  // Bảng giữ state riêng (để dòng đang tắt / dòng chưa có key không bị mất khi đổi ra JSON)
  const [rows, setRows] = useState<KeyValue[] | null>(() => jsonToRows(body));

  if (rows === null) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
        <p>Body hiện tại là mảng hoặc JSON đang lỗi, không hiện dạng bảng được.</p>
        <button type="button" onClick={onNeedCode} className="text-accent hover:underline">
          Mở dạng code
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <KeyValueEditor
        rows={rows}
        onChange={(next) => {
          setRows(next);
          onChange(rowsToJson(next));
        }}
        separator=":"
        keyPlaceholder="key"
        valuePlaceholder="giá trị"
      />
    </div>
  );
}
