export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type Method = (typeof METHODS)[number];

export type BodyType = "none" | "json" | "text" | "form";

export type AuthType = "none" | "bearer";

/** Chế độ gửi: auto = thử trực tiếp, lỗi thì qua proxy. */
export type SendMode = "auto" | "direct" | "proxy";

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestItem {
  id: string;
  name: string;
  /** true khi người dùng tự đặt tên -> không tự đổi tên theo URL nữa. */
  customName: boolean;
  collectionId: string | null;
  method: Method;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyType: BodyType;
  body: string;
  /** Dùng khi bodyType = "form" (x-www-form-urlencoded). */
  form: KeyValue[];
  auth: { type: AuthType; token: string };
  /** true = chỉ lưu trên máy (IndexedDB), không đồng bộ lên Firestore. */
  localOnly?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Collection {
  id: string;
  name: string;
  collapsed: boolean;
  createdAt: number;
}

export interface Environment {
  id: string;
  name: string;
  vars: KeyValue[];
  /** Để sắp xếp ổn định khi tải từ Firestore. */
  createdAt?: number;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  /** Có giá trị khi response là ảnh: data URL để preview. */
  dataUrl?: string;
  contentType: string;
  /** ms */
  duration: number;
  /** bytes */
  size: number;
  via: "direct" | "proxy";
  /** true nếu body bị cắt do quá lớn. */
  truncated: boolean;
}

export interface SendError {
  message: string;
  hints: string[];
  triedProxy: boolean;
}

export interface HistoryItem {
  id: string;
  /** Request gốc (có thể đã bị xóa). */
  requestId: string | null;
  /** Request đã gửi (đã resolve biến) để mở lại. */
  request: Omit<RequestItem, "id" | "createdAt" | "updatedAt">;
  /** URL cuối cùng sau khi thay biến. */
  resolvedUrl: string;
  status: number | null;
  duration: number | null;
  error?: string;
  /** Body response, cắt tối đa HISTORY_BODY_LIMIT. */
  responseBody?: string;
  at: number;
}

/** Payload mà client gửi tới /api/proxy. */
export interface ProxyPayload {
  method: Method;
  url: string;
  headers: [string, string][];
  body?: string;
  timeoutMs?: number;
}

/** Proxy trả về JSON này (body base64 để giữ nguyên byte). */
export interface ProxyResult {
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: [string, string][];
  bodyBase64?: string;
  error?: string;
}

export const LIMITS = {
  /** Hiển thị tối đa 5MB response. */
  DISPLAY_BYTES: 5 * 1024 * 1024,
  /** History chỉ lưu 100KB body. */
  HISTORY_BODY: 100 * 1024,
  HISTORY_ITEMS: 100,
  TIMEOUT_MS: 30_000,
} as const;
