import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dev Sanghavi - Portfolio",
  description: "Clean, professional personal site of Dev Sanghavi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans bg-white text-zinc-900 antialiased selection:bg-zinc-200`}
      >
        {children}
      </body>
    </html>
  );
}
