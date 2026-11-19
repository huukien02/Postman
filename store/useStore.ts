import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/storage";
import { firebaseEnabled } from "@/lib/firebase-config";
import { newId, kv } from "@/lib/id";
import { paramsFromUrl, urlWithParams, shortPath } from "@/lib/url-params";
import { parseCurl, toCurl } from "@/lib/curl";
import { buildRequest } from "@/lib/build-request";
import { sendRequest } from "@/lib/api-client";
import { toVarMap, type VarMap } from "@/lib/env-resolver";
import {
  LIMITS,
  type Collection,
  type Environment,
  type HistoryItem,
  type KeyValue,
  type RequestItem,
  type ResponseData,
  type SendError,
  type SendMode,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Kiểu dữ liệu                                                         */
/* ------------------------------------------------------------------ */

export interface ResponseState {
  loading: boolean;
  data?: ResponseData;
  error?: SendError;
  /** Biến {{x}} thiếu ở lần gửi gần nhất. */
  missingVars?: string[];
}

interface PersistedState {
  requests: RequestItem[];
  collections: Collection[];
  envs: Environment[];
  activeEnvId: string | null;
  activeRequestId: string | null;
  history: HistoryItem[];
  sendMode: SendMode;
  sidebarOpen: boolean;
  layout: "vertical" | "horizontal";
  /** Khớp PROXY_TOKEN trong .env.local (nếu có đặt). */
  proxyToken: string;
  /** Body JSON nhập dạng bảng hay dạng code (nhớ lựa chọn lần trước). */
  jsonView: "table" | "code";
}

export type ModalName = "palette" | "env" | "settings";

export interface Notice {
  id: number;
  text: string;
  tone: "info" | "warn" | "error";
  action?: { label: string; run: () => void };
}

interface TransientState {
  hydrated: boolean;
  /** Response theo từng request (không lưu xuống IndexedDB). */
  responses: Record<string, ResponseState>;
  /** Thông báo ngắn (toast). */
  notice: Notice | null;
  modal: ModalName | null;
  /** id request đang được đổi tên trong sidebar. */
  renamingId: string | null;
  /** Trạng thái Firestore: off = không cấu hình Firebase (chỉ dùng IndexedDB). */
  cloud: { status: "off" | "connecting" | "ready" | "error"; error?: string };
}

type RequestPatch = Partial<Omit<RequestItem, "id" | "createdAt">>;

interface Actions {
  // request
  newRequest: (collectionId?: string | null) => string;
  openRequest: (id: string) => void;
  updateRequest: (id: string, patch: RequestPatch) => void;
  setUrl: (id: string, url: string) => void;
  setParams: (id: string, params: KeyValue[]) => void;
  applyCurl: (id: string, text: string) => boolean;
  renameRequest: (id: string, name: string) => void;
  duplicateRequest: (id: string) => void;
  deleteRequest: (id: string) => void;
  moveRequest: (id: string, collectionId: string | null) => void;
  copyCurl: (id?: string) => Promise<void>;
  // send
  send: (id?: string) => Promise<void>;
  cancel: (id?: string) => void;
  // collection
  createCollection: (name?: string) => string;
  renameCollection: (id: string, name: string) => void;
  toggleCollection: (id: string) => void;
  deleteCollection: (id: string) => void;
  // env
  createEnv: (name?: string) => string;
  updateEnv: (id: string, patch: Partial<Omit<Environment, "id">>) => void;
  deleteEnv: (id: string) => void;
  setActiveEnv: (id: string | null) => void;
  activeVars: () => VarMap;
  // history
  openHistory: (id: string) => void;
  clearHistory: () => void;
  // misc
  setSendMode: (m: SendMode) => void;
  toggleSidebar: () => void;
  setLayout: (l: PersistedState["layout"]) => void;
  setProxyToken: (t: string) => void;
  setJsonView: (v: PersistedState["jsonView"]) => void;
  setModal: (m: ModalName | null) => void;
  setRenaming: (id: string | null) => void;
  notify: (text: string, tone?: Notice["tone"], action?: Notice["action"]) => void;
  exportData: () => string;
  importData: (json: string) => void;
}

export type Store = PersistedState & TransientState & Actions;

/* ------------------------------------------------------------------ */
/* Helper                                                               */
/* ------------------------------------------------------------------ */

function blankRequest(collectionId: string | null = null): RequestItem {
  const now = Date.now();
  return {
    id: newId(),
    name: "Request mới",
    customName: false,
    collectionId,
    method: "GET",
    url: "",
    params: [],
    headers: [],
    bodyType: "none",
    body: "",
    form: [],
    auth: { type: "none", token: "" },
    createdAt: now,
    updatedAt: now,
  };
}

/** Tên tự động: "GET /users/1". */
function autoName(r: Pick<RequestItem, "method" | "url">): string {
  const p = shortPath(r.url);
  return p ? `${r.method} ${p}` : "Request mới";
}

/** So nội dung gửi đi (bỏ qua tên, collection, thời gian). */
function sameContent(a: HistoryItem["request"], b: HistoryItem["request"]): boolean {
  const pick = (r: HistoryItem["request"]) =>
    JSON.stringify([r.method, r.url, r.headers, r.bodyType, r.body, r.form, r.auth]);
  return pick(a) === pick(b);
}

const aborters = new Map<string, AbortController>();
const SEND_MODES: SendMode[] = ["auto", "direct", "proxy"];

/* ------------------------------------------------------------------ */
/* Store                                                                */
/* ------------------------------------------------------------------ */

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      /** Cập nhật 1 request + tự đặt tên nếu chưa đặt tay. */
      const patchRequest = (id: string, fn: (r: RequestItem) => RequestItem) =>
        set((s) => ({
          requests: s.requests.map((r) => {
            if (r.id !== id) return r;
            const next = fn(r);
            if (!next.customName) next.name = autoName(next);
            next.updatedAt = Date.now();
            return next;
          }),
        }));

      const setResponse = (id: string, rs: ResponseState) =>
        set((s) => ({ responses: { ...s.responses, [id]: rs } }));

      return {
        requests: [],
        collections: [],
        envs: [],
        activeEnvId: null,
        activeRequestId: null,
        history: [],
        sendMode: "auto",
        sidebarOpen: true,
        layout: "vertical",
        proxyToken: "",
        jsonView: "table",

        hydrated: false,
        responses: {},
        notice: null,
        modal: null,
        renamingId: null,
        cloud: { status: firebaseEnabled ? "connecting" : "off" },

        /* ---------------- request ---------------- */

        newRequest: (collectionId = null) => {
          const r = blankRequest(collectionId);
          set((s) => ({ requests: [r, ...s.requests], activeRequestId: r.id }));
          return r.id;
        },

        openRequest: (id) => set({ activeRequestId: id }),

        updateRequest: (id, patch) => patchRequest(id, (r) => ({ ...r, ...patch })),

        setUrl: (id, url) => patchRequest(id, (r) => ({ ...r, url, params: paramsFromUrl(url, r.params) })),

        setParams: (id, params) => patchRequest(id, (r) => ({ ...r, params, url: urlWithParams(r.url, params) })),

        applyCurl: (id, text) => {
          try {
            const c = parseCurl(text);
            patchRequest(id, (r) => ({
              ...r,
              method: c.method,
              url: c.url,
              params: c.params,
              headers: c.headers,
              bodyType: c.bodyType,
              body: c.body,
              form: c.form,
              auth: { type: "none", token: "" },
            }));
            get().notify(
              c.warnings.length ? `Đã nhập cURL. Lưu ý: ${c.warnings.join("; ")}` : "Đã nhập từ cURL",
              c.warnings.length ? "warn" : "info",
            );
            return true;
          } catch (e) {
            get().notify((e as Error).message, "error");
            return false;
          }
        },

        renameRequest: (id, name) =>
          patchRequest(id, (r) => {
            const trimmed = name.trim();
            // Xóa trắng tên -> quay về đặt tên tự động
            return trimmed ? { ...r, name: trimmed, customName: true } : { ...r, customName: false };
          }),

        duplicateRequest: (id) => {
          const src = get().requests.find((r) => r.id === id);
          if (!src) return;
          const now = Date.now();
          const copy: RequestItem = {
            ...structuredClone(src),
            id: newId(),
            name: `${src.name} (copy)`,
            customName: true,
            createdAt: now,
            updatedAt: now,
          };
          set((s) => {
            const i = s.requests.findIndex((r) => r.id === id);
            const requests = [...s.requests];
            requests.splice(i + 1, 0, copy);
            return { requests, activeRequestId: copy.id };
          });
        },

        /** Xóa không hỏi lại, nhưng có nút "Hoàn tác" trên toast. */
        deleteRequest: (id) => {
          const before = get();
          const index = before.requests.findIndex((r) => r.id === id);
          const removed = before.requests[index];
          if (!removed) return;
          const wasActive = before.activeRequestId === id;
          aborters.get(id)?.abort();
          set((s) => {
            const requests = s.requests.filter((r) => r.id !== id);
            const { [id]: _removed, ...responses } = s.responses;
            void _removed;
            let activeRequestId = s.activeRequestId;
            // Mở request kế bên thay vì nhảy về đầu danh sách
            if (wasActive) activeRequestId = (requests[index] ?? requests[index - 1])?.id ?? null;
            return { requests, responses, activeRequestId };
          });
          if (!get().requests.length) get().newRequest();
          get().notify(`Đã xóa "${removed.name}"`, "info", {
            label: "Hoàn tác",
            run: () =>
              set((s) => {
                if (s.requests.some((r) => r.id === id)) return s;
                const requests = [...s.requests];
                requests.splice(Math.min(index, requests.length), 0, removed);
                return { requests, activeRequestId: wasActive ? id : s.activeRequestId };
              }),
          });
        },

        moveRequest: (id, collectionId) => patchRequest(id, (r) => ({ ...r, collectionId })),

        copyCurl: async (id) => {
          const req = get().requests.find((r) => r.id === (id ?? get().activeRequestId));
          if (!req) return;
          const b = buildRequest(req, get().activeVars());
          try {
            await navigator.clipboard.writeText(toCurl(b));
            get().notify(b.missingVars.length ? `Đã copy cURL (thiếu biến: ${b.missingVars.join(", ")})` : "Đã copy cURL");
          } catch {
            get().notify("Trình duyệt không cho copy", "error");
          }
        },

        /* ---------------- send ---------------- */

        send: async (id) => {
          const reqId = id ?? get().activeRequestId;
          const req = get().requests.find((r) => r.id === reqId);
          if (!req) return;

          aborters.get(req.id)?.abort();
          const ac = new AbortController();
          aborters.set(req.id, ac);

          const built = buildRequest(req, get().activeVars());
          setResponse(req.id, { ...get().responses[req.id], loading: true, missingVars: built.missingVars });

          const result = await sendRequest(built, {
            mode: get().sendMode,
            signal: ac.signal,
            proxyToken: get().proxyToken || undefined,
          });
          if (aborters.get(req.id) !== ac) return; // đã có lần gửi mới hơn
          aborters.delete(req.id);

          if (result.ok) {
            setResponse(req.id, { loading: false, data: result.data, missingVars: built.missingVars });
          } else {
            setResponse(req.id, { loading: false, error: result.error, missingVars: built.missingVars });
          }

          if (!result.ok && result.error.message === "Đã hủy") return;

          const { id: _i, createdAt: _c, updatedAt: _u, ...snapshot } = req;
          void _i; void _c; void _u;
          const item: HistoryItem = {
            id: newId(),
            requestId: req.id,
            request: structuredClone(snapshot),
            resolvedUrl: built.url,
            status: result.ok ? result.data.status : null,
            duration: result.ok ? result.data.duration : null,
            error: result.ok ? undefined : result.error.message,
            responseBody: result.ok ? result.data.body.slice(0, LIMITS.HISTORY_BODY) : undefined,
            at: Date.now(),
          };
          set((s) => ({ history: [item, ...s.history].slice(0, LIMITS.HISTORY_ITEMS) }));
        },

        cancel: (id) => {
          const reqId = id ?? get().activeRequestId;
          if (reqId) aborters.get(reqId)?.abort();
        },

        /* ---------------- collection ---------------- */

        createCollection: (name = "Collection mới") => {
          const c: Collection = { id: newId(), name, collapsed: false, createdAt: Date.now() };
          set((s) => ({ collections: [...s.collections, c] }));
          return c.id;
        },

        renameCollection: (id, name) =>
          set((s) => ({
            collections: s.collections.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)),
          })),

        toggleCollection: (id) =>
          set((s) => ({
            collections: s.collections.map((c) => (c.id === id ? { ...c, collapsed: !c.collapsed } : c)),
          })),

        /** Xóa collection: request bên trong chuyển ra ngoài (không mất dữ liệu). */
        deleteCollection: (id) =>
          set((s) => ({
            collections: s.collections.filter((c) => c.id !== id),
            requests: s.requests.map((r) => (r.collectionId === id ? { ...r, collectionId: null } : r)),
          })),

        /* ---------------- env ---------------- */

        createEnv: (name = "Môi trường mới") => {
          const e: Environment = { id: newId(), name, vars: [kv("baseUrl", "")], createdAt: Date.now() };
          set((s) => ({ envs: [...s.envs, e], activeEnvId: e.id }));
          return e.id;
        },

        updateEnv: (id, patch) =>
          set((s) => ({ envs: s.envs.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

        deleteEnv: (id) =>
          set((s) => ({
            envs: s.envs.filter((e) => e.id !== id),
            activeEnvId: s.activeEnvId === id ? null : s.activeEnvId,
          })),

        setActiveEnv: (id) => set({ activeEnvId: id }),

        activeVars: () => {
          const { envs, activeEnvId } = get();
          return toVarMap(envs.find((e) => e.id === activeEnvId)?.vars);
        },

        /* ---------------- history ---------------- */

        /**
         * Mở history:
         * - request gốc còn và chưa sửa gì sau lần gửi đó -> mở request gốc
         * - ngược lại -> tạo request mới từ snapshot (không ghi đè bản đang có)
         */
        openHistory: (id) => {
          const h = get().history.find((x) => x.id === id);
          if (!h) return;
          // Hiện lại response đã lưu trong history (body tối đa 100KB, không có headers)
          const savedResponse = (): ResponseState => {
            if (h.status === null) {
              return { loading: false, error: { message: h.error ?? "Lỗi", hints: [], triedProxy: false } };
            }
            const body = h.responseBody ?? "";
            return {
              loading: false,
              data: {
                status: h.status,
                statusText: "(từ history)",
                headers: [],
                body,
                contentType: /^\s*[[{]/.test(body) ? "application/json" : "text/plain",
                duration: h.duration ?? 0,
                size: new TextEncoder().encode(body).byteLength,
                via: "direct",
                truncated: body.length >= LIMITS.HISTORY_BODY,
              },
            };
          };

          const original = h.requestId ? get().requests.find((r) => r.id === h.requestId) : undefined;
          if (original && sameContent(original, h.request)) {
            set((s) => ({
              activeRequestId: original.id,
              responses: s.responses[original.id] ? s.responses : { ...s.responses, [original.id]: savedResponse() },
            }));
            return;
          }
          const now = Date.now();
          const r: RequestItem = {
            ...structuredClone(h.request),
            id: newId(),
            collectionId: null,
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({
            requests: [r, ...s.requests],
            activeRequestId: r.id,
            responses: { ...s.responses, [r.id]: savedResponse() },
          }));
        },

        clearHistory: () => set({ history: [] }),

        /* ---------------- misc ---------------- */

        setSendMode: (m) => set({ sendMode: SEND_MODES.includes(m) ? m : "auto" }),
        toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
        setLayout: (layout) => set({ layout }),
        setProxyToken: (proxyToken) => set({ proxyToken }),
        setJsonView: (jsonView) => set({ jsonView }),
        setModal: (modal) => set({ modal }),
        setRenaming: (renamingId) => set({ renamingId }),

        notify: (text, tone = "info", action) => set({ notice: { id: Date.now(), text, tone, action } }),

        exportData: () => {
          const { requests, collections, envs } = get();
          return JSON.stringify({ app: "postman-mini", version: 1, requests, collections, envs }, null, 2);
        },

        importData: (json) => {
          try {
            const d = JSON.parse(json);
            if (d.app !== "postman-mini" || !Array.isArray(d.requests)) throw new Error("File không đúng định dạng");
            // Gộp theo id: bản import ghi đè bản trùng id
            const merge = <T extends { id: string }>(cur: T[], inc: T[] = []) => {
              const ids = new Set(inc.map((x) => x.id));
              return [...cur.filter((x) => !ids.has(x.id)), ...inc];
            };
            set((s) => ({
              requests: merge(s.requests, d.requests),
              collections: merge(s.collections, d.collections),
              envs: merge(s.envs, d.envs),
            }));
            get().notify(`Đã nhập ${d.requests.length} request`);
          } catch (e) {
            get().notify(`Import lỗi: ${(e as Error).message}`, "error");
          }
        },
      };
    },
    {
      // Có Firebase: dùng kho local mới (bắt đầu mới, kho cũ "postman-mini" vẫn còn nguyên, không bị xóa)
      name: firebaseEnabled ? "postman-mini-cloud" : "postman-mini",
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      // Không tự nạp lúc tạo store (sẽ chạy cả trên server). Client gọi rehydrate() trong useEffect.
      skipHydration: true,
      partialize: (s): Partial<PersistedState> => ({
        // Có Firebase: requests/collections/envs nằm trên Firestore (+ cache offline của Firestore),
        // IndexedDB chỉ giữ history và cài đặt trên máy này.
        ...(firebaseEnabled
          ? { requests: s.requests.filter((r) => r.localOnly) } // request "chỉ trên máy" lưu ở đây
          : { requests: s.requests, collections: s.collections, envs: s.envs }),
        activeEnvId: s.activeEnvId,
        activeRequestId: s.activeRequestId,
        history: s.history,
        sendMode: s.sendMode,
        sidebarOpen: s.sidebarOpen,
        layout: s.layout,
        proxyToken: s.proxyToken,
        jsonView: s.jsonView,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Có Firebase: requests tải từ Firestore sau (lib/cloud-sync.ts lo phần tạo request đầu tiên)
        if (firebaseEnabled) {
          useStore.setState({ hydrated: true });
          return;
        }
        // Lần đầu mở app: tạo sẵn 1 request để gõ được ngay
        if (!state.requests.length) state.newRequest();
        else if (!state.requests.some((r) => r.id === state.activeRequestId)) {
          state.openRequest(state.requests[0].id);
        }
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Request đang mở. */
export const useActiveRequest = () =>
  useStore((s) => s.requests.find((r) => r.id === s.activeRequestId) ?? null);
