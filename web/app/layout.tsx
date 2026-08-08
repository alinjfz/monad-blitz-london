import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FocusBond — miss it, pay your friends",
  description:
    "Friend-group accountability circles on Monad. Stake MON on a shared goal; whoever misses pays the friends who showed up.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
