import type { Metadata } from "next";
import { Manrope, Space_Grotesk, Geist_Mono, Sora } from "next/font/google";
import "./globals.css";
import "./storefront-premium.css";
import "./commerce-premium.css";
import { CartProvider } from "./CartContext";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap" });

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ruang Digital | Skip the Scams. Shop with Confidence.",
  description: "Your trusted digital gaming marketplace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${manrope.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}