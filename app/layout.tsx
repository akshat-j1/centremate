import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CentreMate — Same centre. Better company.",
  description:
    "Find your exam centre, meet your Scaler people, and travel together. Built for IITM BS students.",
  robots: { index: true, follow: true },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
