import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { AccountButton } from "@/components/account-button";
import { Providers } from "@/components/providers";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-5">
            <Link href="/" className="tap-bounce text-sm font-semibold tracking-wide text-accent hover:opacity-80">
              志願分組
            </Link>
            <AccountButton />
          </header>
          <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
