import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { PlayerProvider } from "@/components/providers/PlayerProvider";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "Melomania — Social music sharing & annotation platform",
  description:
    "Share tracks and playlists, annotate your favorite timecodes, discuss and export seamlessly to Spotify and Apple Music.",
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
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <AuthProvider>
          <PlayerProvider>
            <AppLayout>{children}</AppLayout>
          </PlayerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
