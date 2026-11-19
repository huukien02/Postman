import { collection, deleteDoc, doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { useStore, type Store } from "@/store/useStore";
import { explainFirebaseError, getFirebase } from "./firebase";
import { FIRESTORE_ROOT } from "./firebase-config";
import { applyRemote, byCreatedAsc, byCreatedDesc, idsToSync, type RemoteChange, type Synced } from "./sync-logic";

/*
 * Đồng bộ requests / collections / envs giữa store (Zustand) và Firestore.
 *
 * Dữ liệu: apps/postman-mini/{requests|collections|envs}/{id}
 * Web cá nhân: không đăng nhập, mọi trình duyệt/máy dùng chung dữ liệu này.
 *
 * - Store là nguồn hiển thị (gõ phím mượt, không chờ mạng).
 * - Store đổi -> sau 800ms không gõ nữa mới ghi doc đó lên Firestore (đỡ tốn lượt ghi).
 * - Firestore đổi (tab/máy khác) -> áp vào store, trừ doc đang có sửa đổi local chưa ghi.
 * - Firestore có cache offline: mất mạng vẫn sửa được, có mạng tự đẩy lên.
 */

type Coll = "requests" | "collections" | "envs";
const COLLS: Coll[] = ["requests", "collections", "envs"];
const SORT = { requests: byCreatedDesc, collections: byCreatedAsc, envs: byCreatedAsc };
const WRITE_DELAY = 800;
const FIRST_LOAD_WAIT = 4000;

let started = false;

export function startCloudSync(): () => void {
  if (started) return () => {};
  started = true;
  const setCloud = (cloud: Store["cloud"]) => useStore.setState({ cloud });
  let stop: () => void = () => {};
  try {
    stop = syncCollections(getFirebase().db, setCloud);
  } catch (e) {
    setCloud({ status: "error", error: explainFirebaseError(e) });
  }
  return () => {
    stop();
    started = false;
  };
}

function syncCollections(db: Firestore, setCloud: (c: Store["cloud"]) => void) {
  const [rootColl, rootDoc] = FIRESTORE_ROOT;
  const pending = new Map<string, ReturnType<typeof setTimeout>>(); // key "coll/id"
  const key = (c: Coll, id: string) => `${c}/${id}`;
  let applyingRemote = false;

  /* ---------- Local -> Firestore ---------- */

  const flush = (c: Coll, id: string) => {
    pending.delete(key(c, id));
    const item = (useStore.getState()[c] as Synced[]).find((x) => x.id === id);
    const ref = doc(db, rootColl, rootDoc, c, id);
    // Đã xóa, hoặc chuyển sang "chỉ trên máy" -> xóa bản trên Firestore
    const op = item && !item.localOnly ? setDoc(ref, item) : deleteDoc(ref);
    op.catch((e) => useStore.getState().notify(`Lưu lên Firestore lỗi: ${explainFirebaseError(e)}`, "error"));
  };

  const schedule = (c: Coll, id: string) => {
    const k = key(c, id);
    clearTimeout(pending.get(k));
    pending.set(k, setTimeout(() => flush(c, id), WRITE_DELAY));
  };

  const unsubStore = useStore.subscribe((s, prev) => {
    if (applyingRemote) return;
    for (const c of COLLS) {
      for (const id of idsToSync(prev[c] as Synced[], s[c] as Synced[])) schedule(c, id);
    }
  });

  // Đóng tab khi còn chỉnh sửa chưa ghi -> ghi ngay (Firestore giữ trong cache offline, lần sau mở tự đẩy lên)
  const flushAll = () => {
    for (const [k, t] of [...pending]) {
      clearTimeout(t);
      const [c, id] = k.split("/") as [Coll, string];
      flush(c, id);
    }
  };
  window.addEventListener("pagehide", flushAll);

  /* ---------- Firestore -> Local ---------- */

  const firstSnap = new Map<Coll, { empty: boolean; fromCache: boolean }>();
  let ready = false;

  const markReady = () => {
    if (ready) return;
    ready = true;
    const s = useStore.getState();
    // Lần đầu dùng (Firestore trống): tạo sẵn 1 request để gõ được ngay
    if (!s.requests.length) s.newRequest();
    else if (!s.requests.some((r) => r.id === s.activeRequestId)) s.openRequest(s.requests[0].id);
    setCloud({ status: "ready" });
  };

  const checkReady = () => {
    if (ready || firstSnap.size < COLLS.length) return;
    const req = firstSnap.get("requests")!;
    // Cache trống + chưa có phản hồi server: chờ server một chút để không tạo request thừa
    if (req.empty && req.fromCache) return;
    markReady();
  };
  const timer = setTimeout(() => firstSnap.size === COLLS.length && markReady(), FIRST_LOAD_WAIT);

  const unsubs = COLLS.map((c) =>
    onSnapshot(
      collection(db, rootColl, rootDoc, c),
      { includeMetadataChanges: true },
      (snap) => {
        const changes: RemoteChange<Synced>[] = snap
          .docChanges()
          // Bản ghi đang chờ ghi = chính mình vừa sửa -> bỏ qua, tránh vọng lại
          .filter((ch) => !ch.doc.metadata.hasPendingWrites)
          .map((ch) => ({ type: ch.type, id: ch.doc.id, data: ch.doc.data() as Synced }));

        if (changes.length) {
          const current = useStore.getState()[c] as Synced[];
          const localOnly = new Set(current.filter((x) => x.localOnly).map((x) => x.id));
          // Bỏ qua: doc đang chờ ghi, và request "chỉ trên máy" (vd sự kiện xóa do chính mình vừa gỡ khỏi cloud)
          const skip = (id: string) => pending.has(key(c, id)) || localOnly.has(id);
          const next = applyRemote(current, changes, skip, SORT[c]);
          if (next !== current) {
            applyingRemote = true;
            useStore.setState({ [c]: next } as Partial<Store>);
            applyingRemote = false;
          }
        }

        const prevFirst = firstSnap.get(c);
        if (!prevFirst || (prevFirst.fromCache && !snap.metadata.fromCache)) {
          firstSnap.set(c, { empty: snap.empty, fromCache: snap.metadata.fromCache });
          checkReady();
        }
      },
      (e) => setCloud({ status: "error", error: explainFirebaseError(e) }),
    ),
  );

  return () => {
    flushAll();
    clearTimeout(timer);
    unsubStore();
    unsubs.forEach((u) => u());
    window.removeEventListener("pagehide", flushAll);
  };
}
