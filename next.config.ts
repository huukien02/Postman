import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ẩn nút "N" của Next.js ở góc màn hình (lỗi build/runtime vẫn hiện)
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
