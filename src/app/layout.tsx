import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

/*
 * Rubik ships Latin and Hebrew in one family — product names are Hebrew while
 * the UI is English, so the one typeface must cover both scripts
 * (docs/UI_DESIGN.md §3.1, wired per §14.1). Weights 400/500/600 are within
 * Rubik's variable range.
 */
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "hebrew"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Fridge Tracker",
    template: "%s · Fridge Tracker",
  },
  description:
    "Know what is in your fridge and what to buy again — scan Israeli barcodes, track how much is left, restock smart.",
};

export const viewport: Viewport = {
  // Mobile browser chrome matches the warm-paper canvas (UI_DESIGN §3.3).
  themeColor: "#FBFAF6",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${rubik.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
