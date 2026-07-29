import type { Metadata, Viewport } from "next";
import { Inter, Cinzel } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// A display serif for headings, evoking a fantasy tome without hurting
// readability of body copy.
const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FableKeeper — Pathfinder 2E Campaign Management",
    template: "%s · FableKeeper",
  },
  description:
    "An all-in-one worldbuilding, character, and campaign management platform for Pathfinder Second Edition Game Masters and players.",
  applicationName: "FableKeeper",
  keywords: ["Pathfinder", "PF2E", "TTRPG", "campaign manager", "worldbuilding"],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0d12" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${cinzel.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
