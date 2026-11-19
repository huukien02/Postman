/*
 * Logic thuần (không phụ thuộc Firebase) cho đồng bộ store <-> Firestore. Có test ở scripts/test-lib.ts.
 */

export type Synced = { id: string; createdAt?: number; localOnly?: boolean };

/**
 * id cần ghi lên Firestore khi store đổi. Bỏ qua request "chỉ trên máy" (localOnly)
 * trừ lúc vừa chuyển trạng thái (cloud -> máy: cần xóa bản trên cloud; máy -> cloud: cần đẩy lên).
 */
export function idsToSync<T extends Synced>(prev: T[], next: T[]): string[] {
  const { upserted, removed } = diffById(prev, next);
  const before = new Map(prev.map((x) => [x.id, x]));
  const after = new Map(next.map((x) => [x.id, x]));
  const wasCloud = (id: string) => !!before.get(id) && !before.get(id)!.localOnly;
  return [
    ...upserted.filter((id) => !after.get(id)!.localOnly || wasCloud(id)),
    ...removed.filter((id) => wasCloud(id)),
  ];
}

/** id nào đã thêm/sửa (so tham chiếu object) hoặc đã xóa giữa 2 phiên bản mảng. */
export function diffById<T extends Synced>(prev: T[], next: T[]): { upserted: string[]; removed: string[] } {
  if (prev === next) return { upserted: [], removed: [] };
  const before = new Map(prev.map((x) => [x.id, x]));
  const upserted: string[] = [];
  for (const x of next) {
    if (before.get(x.id) !== x) upserted.push(x.id);
    before.delete(x.id);
  }
  return { upserted, removed: [...before.keys()] };
}

export interface RemoteChange<T> {
  type: "added" | "modified" | "removed";
  id: string;
  data?: T;
}

/**
 * Áp thay đổi từ Firestore vào mảng local.
 * Bỏ qua id đang có sửa đổi local chưa đẩy lên (`skip`) để không ghi đè cái người dùng vừa gõ.
 */
export function applyRemote<T extends Synced>(
  current: T[],
  changes: RemoteChange<T>[],
  skip: (id: string) => boolean,
  sort: (a: T, b: T) => number,
): T[] {
  const map = new Map(current.map((x) => [x.id, x]));
  let touched = false;
  for (const c of changes) {
    if (skip(c.id)) continue;
    if (c.type === "removed") touched = map.delete(c.id) || touched;
    else if (c.data) {
      map.set(c.id, { ...c.data, id: c.id });
      touched = true;
    }
  }
  return touched ? [...map.values()].sort(sort) : current;
}

export const byCreatedDesc = (a: { createdAt?: number }, b: { createdAt?: number }) =>
  (b.createdAt ?? 0) - (a.createdAt ?? 0);
export const byCreatedAsc = (a: { createdAt?: number }, b: { createdAt?: number }) =>
  (a.createdAt ?? 0) - (b.createdAt ?? 0);
