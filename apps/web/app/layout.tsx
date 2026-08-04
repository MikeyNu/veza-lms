import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veza Learning Cloud",
  description: "The operating system for modern learning institutions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
