import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { AccountButton } from "@/components/account-button";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "志願分組",
  description: "依志願序與渴望度自動分配職位，主辦方看不到、也改不了結果",
};

const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* 在第一次繪製前就決定深淺色（存過的選擇優先，否則跟系統），避免深色使用者先閃一下淺色 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {/* 深色模式的動態光暈背景（淺色模式不顯示）；放在 Providers 外面，才不會受 OverscrollBounce 的 transform 影響 */}
        <div className="theme-mesh" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <Providers>
          <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-5">
            <Link href="/" className="tap-bounce text-sm font-semibold tracking-wide text-accent hover:opacity-80">
              志願分組
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <AccountButton />
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
