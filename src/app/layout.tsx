import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiracPharma — Intelligent Pharmacy Management by DiracAI Services",
  description:
    "Intelligent Management. Better Pharmacy Operations. DiracPharma is an enterprise pharmacy store management system by DiracAI Services.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F8FAFC] antialiased text-slate-800">
        {children}
      </body>
    </html>
  );
}
