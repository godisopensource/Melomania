import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { PlayerProvider } from "@/components/providers/PlayerProvider";
import { AppLayout } from "@/components/layout/AppLayout";

// Body font: Inter (self-hosted variable font, latin subset)
const inter = localFont({
  src: "./fonts/Inter.woff2",
  variable: "--font-inter",
  display: "swap",
  preload: true,
  // Inter variable font supports weight range 100–900
  weight: "100 900",
});

// Display / accent font: Bonbance Bold Condensed (woff2 only — the legacy
// woff fallback is not preloaded; all modern browsers/mobile use woff2).
const bonbance = localFont({
  src: [
    {
      path: "./fonts/Bonbance-BoldCondensed.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-bonbance",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Melomania: Effortlessly share your music recommendations with your musical soulmates",
  description:
    "Effortlessly share your music recommendations with your musical soulmates",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${bonbance.variable}`}
    >
      <body className={`${inter.className} antialiased`}>
        <AuthProvider>
          <PlayerProvider>
            <AppLayout>{children}</AppLayout>
          </PlayerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
