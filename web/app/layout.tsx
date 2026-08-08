import type { Metadata } from "next";
import { Syne, Manrope } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FocusBond: miss it, pay your friends",
  description:
    "Friend-group accountability circles on Monad. Stake MON on a shared goal; whoever misses pays the friends who showed up.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
  openGraph: {
    title: "FocusBond: miss it, pay your friends",
    description:
      "Friend-group accountability circles on Monad. Stake MON on a shared goal; whoever misses pays the friends who showed up.",
    images: [{ url: "/brand/hero.webp", width: 1600, height: 900, alt: "FocusBond" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FocusBond: miss it, pay your friends",
    description:
      "Friend-group accountability circles on Monad. Stake MON on a shared goal; whoever misses pays the friends who showed up.",
    images: ["/brand/hero.webp"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${manrope.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
