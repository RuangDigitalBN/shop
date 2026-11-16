import type { Metadata } from "next";
import { Manrope, Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "./CartContext";

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
      className={`${manrope.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}