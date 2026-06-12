import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Jira Automation",
  description: "Jira & Confluence automation tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="flex min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </body>
    </html>
  );
}
