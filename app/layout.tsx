import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"] });
const jb = JetBrains_Mono({ variable: "--font-jb", subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Postman Mini",
  description: "Test API nhanh, gọn, ít thao tác",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} ${jb.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden font-sans">{children}</body>
    </html>
  );
}
