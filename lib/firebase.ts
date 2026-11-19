import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

/**
 * Khởi tạo Firebase (chỉ gọi trên trình duyệt).
 * Web cá nhân: KHÔNG đăng nhập, mọi trình duyệt dùng chung 1 chỗ dữ liệu (xem FIRESTORE_ROOT).
 */
export function getFirebase() {
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
    db = initializeFirestore(app, {
      // Cache offline trên máy (IndexedDB): mở app không có mạng vẫn thấy dữ liệu, có mạng tự đồng bộ.
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  }
  return { app: app!, db: db! };
}

/** Mã lỗi Firebase -> câu tiếng Việt kèm cách sửa. */
export function explainFirebaseError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const msg = (e as Error)?.message ?? String(e);
  if (code === "permission-denied")
    return "Firestore từ chối truy cập. Dán nội dung file firestore.rules vào Firebase Console → Firestore → Rules rồi bấm Publish.";
  if (code === "failed-precondition" || /database .* does not exist|NOT_FOUND/i.test(msg))
    return "Project chưa tạo Firestore Database. Vào Firebase Console → Firestore Database → Create database.";
  if (code === "invalid-argument" && /api key/i.test(msg)) return "API key sai. Kiểm tra apiKey trong lib/firebase-config.ts.";
  if (code === "unavailable") return "Không kết nối được Firestore (mất mạng?).";
  return `${code ? code + ": " : ""}${msg}`;
}
