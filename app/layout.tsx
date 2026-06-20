import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steam市场情报站",
  description: "Steam市场情报站本地配置管理面板",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body data-theme="dark">{children}</body>
    </html>
  );
}
