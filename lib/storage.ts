import { get, set, del } from "idb-keyval";
import type { StateStorage } from "zustand/middleware";

/**
 * Adapter IndexedDB cho zustand/persist.
 * - IndexedDB không giới hạn 5MB như localStorage -> đủ chỗ cho history.
 * - Ghi có debounce: gõ phím liên tục chỉ ghi 1 lần sau khi dừng 300ms.
 * - Khi chạy trên server (SSR) thì không làm gì.
 */
const WRITE_DELAY = 300;
const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();

const hasIdb = () => typeof indexedDB !== "undefined";

function flush(name: string) {
  const p = pending.get(name);
  if (!p) return Promise.resolve();
  clearTimeout(p.timer);
  pending.delete(name);
  return set(name, p.value);
}

if (typeof window !== "undefined") {
  // Đóng tab khi đang chờ ghi -> ghi ngay
  window.addEventListener("pagehide", () => {
    for (const name of [...pending.keys()]) void flush(name);
  });
}

export const idbStorage: StateStorage = {
  getItem: async (name) => {
    if (!hasIdb()) return null;
    const p = pending.get(name);
    if (p) return p.value;
    return (await get<string>(name)) ?? null;
  },
  setItem: (name, value) => {
    if (!hasIdb()) return;
    const old = pending.get(name);
    if (old) clearTimeout(old.timer);
    pending.set(name, { value, timer: setTimeout(() => void flush(name), WRITE_DELAY) });
  },
  removeItem: async (name) => {
    if (!hasIdb()) return;
    const p = pending.get(name);
    if (p) clearTimeout(p.timer);
    pending.delete(name);
    await del(name);
  },
};
