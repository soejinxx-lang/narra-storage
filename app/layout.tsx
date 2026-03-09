import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Narra Storage",
  description: "Narra Storage API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
