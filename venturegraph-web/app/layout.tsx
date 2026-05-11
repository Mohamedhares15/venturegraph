import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { sha256File } from "@/lib/crypto";
import path from "node:path";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VentureGraph Sovereign",
  description:
    "Audit-grade private-market intelligence for sovereign capital. Pre-registered protocol, cryptographically sealed signals, twenty-two analytical modules.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Compute the protocol seal at request time (safe, server-side)
  const protoPath = path.resolve(process.cwd(), "..", "preregistration.py");
  const protoSeal = (await sha256File(protoPath)) ?? "";
  const sealShort = protoSeal.slice(0, 10).toUpperCase();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${cormorant.variable}`}
    >
      <body className="min-h-screen bg-paper-50 text-ink-700" suppressHydrationWarning>
        <div className="flex min-h-screen">
          <Sidebar protoSeal={sealShort} />
          <div className="flex flex-1 flex-col min-w-0">
            <TopBar />
            <main className="flex-1 px-8 py-6 md:px-12 md:py-8 max-w-[1600px] w-full mx-auto">
              {children}
            </main>
            <footer className="border-t border-ink-100 px-8 py-5 mt-12 text-center">
              <div className="font-mono text-[0.66rem] text-ink-300 tracking-[0.2em] uppercase">
                VENTUREGRAPH SOVEREIGN · v2.0 · MOHAMED HARES · EUI · MAY 2026
              </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
