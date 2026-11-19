/*
 * CONFIG FIREBASE - dán config project của bạn vào đây.
 *
 * Lấy ở: Firebase Console -> Project settings (bánh răng) -> General -> Your apps -> Web app (</>)
 *        -> SDK setup and configuration -> Config -> copy object firebaseConfig.
 *
 * Config web này KHÔNG phải bí mật (Google thiết kế để nằm trong code trình duyệt).
 * Dữ liệu được bảo vệ bởi file firestore.rules (mỗi tài khoản chỉ đọc/ghi được dữ liệu của mình).
 *
 * Để apiKey rỗng = không dùng Firestore, dữ liệu lưu trên trình duyệt (IndexedDB) như cũ.
 *
 * File này KHÔNG import Firebase SDK để store dùng được mà không kéo SDK vào bundle.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyAs1LEj2WXO-6MvS7v2uWg5nPzVsqjbVf0",
  authDomain: "crud-3fd86.firebaseapp.com",
  databaseURL: "https://crud-3fd86-default-rtdb.firebaseio.com",
  projectId: "crud-3fd86",
  storageBucket: "crud-3fd86.firebasestorage.app",
  messagingSenderId: "663063195093",
  appId: "1:663063195093:web:5d892cb09a9d2016c7e15c",
  measurementId: "G-579FGCK6TP",
};

/** Chỗ lưu dữ liệu trên Firestore: apps/postman-mini/{requests|collections|envs}/{id}. Dùng chung mọi trình duyệt. */
export const FIRESTORE_ROOT = ["apps", "postman-mini"] as const;

export const firebaseEnabled =Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId,
);
