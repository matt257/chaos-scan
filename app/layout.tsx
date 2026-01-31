import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revenue & Billing Chaos Scan",
  description: "Extract atomic financial facts from CSV or text data",
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
