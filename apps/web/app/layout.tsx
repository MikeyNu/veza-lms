import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veza Learning Cloud",
  description: "The operating system for modern learning institutions.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/branding/veza-app-icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/branding/veza-app-icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/branding/veza-app-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
