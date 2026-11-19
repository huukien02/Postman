# Postman Mini

Công cụ test API gọn nhẹ, ít thao tác. Next.js + IndexedDB, không cần tài khoản hay cloud.

## Chạy

```bash
npm install
npm run dev        # mở http://localhost:3000
```

Chạy bằng `npm run dev` trên máy bạn thì proxy gọi được cả API nội bộ công ty và `http://localhost`.

## Dùng nhanh

| Thao tác | Cách làm |
|---|---|
| Nhập request từ DevTools / tài liệu | Dán lệnh **cURL** vào ô URL |
| Gửi | `Enter` trong ô URL hoặc `Ctrl+Enter` ở bất kỳ đâu |
| Hủy | `Esc` |
| Request mới | `Alt+N` |
| Tìm request / lệnh | `Ctrl+K` (gõ không dấu cũng được) |
| Ẩn/hiện sidebar | `Ctrl+B` |
| Đổi tên | Double-click tên trong sidebar |
| Biến | `{{baseUrl}}`, `{{token}}`… khai báo ở nút môi trường trên header |

Mọi thay đổi **tự lưu** vào trình duyệt. Sao lưu/chuyển máy: Cài đặt → Export/Import.

## Chế độ gửi

- **Auto** (mặc định): gọi thẳng từ trình duyệt, lỗi CORS/mạng thì tự gọi lại qua proxy `/api/proxy`.
- **Direct**: chỉ gọi từ trình duyệt.
- **Proxy**: luôn qua server Next.js (xem được đầy đủ response headers).

> Proxy là proxy mở. Đừng deploy công khai. Nếu bắt buộc deploy, đặt `PROXY_TOKEN=...` trong
> `.env.local` và nhập cùng giá trị ở Cài đặt → Proxy token.

## Kiểm tra

```bash
npm run test:lib   # test cURL parser, biến môi trường, params, build request
npm run typecheck
npm run lint
```
