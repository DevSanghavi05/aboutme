import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dev Sanghavi - Portfolio",
  description: "Dev Sanghavi is a 12-year-old 6th-grade student, developer, and creator based in Houston, TX. Explore Dev Sanghavi's portfolio featuring accomplishments in software, AI, and robotics like Churro and Verde.",
  keywords: ["Dev Sanghavi", "Houston", "Developer", "Student", "Portfolio", "Churro", "Verde", "AI", "Software"],
  authors: [{ name: "Dev Sanghavi" }],
  creator: "Dev Sanghavi",
  openGraph: {
    title: "Dev Sanghavi - Portfolio",
    description: "Personal portfolio of Dev Sanghavi, a 12 yr old developer and creator from Houston, TX.",
    url: "https://devsanghavi.com",
    siteName: "Dev Sanghavi",
    locale: "en_US",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
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
