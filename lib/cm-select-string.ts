import { EditorSelection, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Tìm chuỗi "..." chứa vị trí `col` trong 1 dòng. Trả về [from, to] của NỘI DUNG (không gồm dấu nháy).
 * Xử lý được dấu nháy escape \" bên trong.
 */
export function stringRangeAt(line: string, col: number): [number, number] | null {
  const re = /"(?:[^"\\]|\\.)*"/g;
  for (const m of line.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    // col nằm trong nội dung (giữa 2 dấu nháy)
    if (col > start && col < end) return [start + 1, end - 1];
  }
  return null;
}

/**
 * Double-click vào trong 1 chuỗi JSON -> chọn cả chuỗi (vd cả "a.b@gmail.com"),
 * thay vì chỉ 1 "từ" như mặc định (CodeMirror ngắt từ ở dấu . và @).
 * Ngoài chuỗi thì vẫn chọn từ như bình thường.
 */
export const selectStringOnDoubleClick = Prec.highest(
  EditorView.domEventHandlers({
    mousedown(e, view) {
      if (e.detail !== 2 || e.button !== 0 || e.shiftKey || e.altKey) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos == null) return false;
      const line = view.state.doc.lineAt(pos);
      const r = stringRangeAt(line.text, pos - line.from);
      if (!r || r[0] === r[1]) return false;
      e.preventDefault();
      view.dispatch({ selection: EditorSelection.single(line.from + r[0], line.from + r[1]) });
      view.focus();
      return true;
    },
  }),
);
