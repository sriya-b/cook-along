import type { Metadata, Viewport } from "next";
import { Mansalva, Manrope } from "next/font/google";
import "./globals.css";

const mansalva = Mansalva({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "cook along",
  description: "a calm friend next to you while you cook.",
};

// the cooking screen is a fixed, full-height camera view, so the page
// itself must never zoom or bounce-scroll under messy hands.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${mansalva.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
