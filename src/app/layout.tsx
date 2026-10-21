import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sushrusha Pharmacy — Multi-Store Pharmacy Management",
  description:
    "Secure pharmacy store management system. Clean, modern multi-branch operations and role-based access.",
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
