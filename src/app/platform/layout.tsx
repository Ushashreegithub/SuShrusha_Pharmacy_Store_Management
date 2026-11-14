import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PharmaPro — Platform Administration",
  description: "PharmaPro Platform Administration by DiracAI Services.",
};

export default function PlatformRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[#F8FAFC]">{children}</div>;
}

