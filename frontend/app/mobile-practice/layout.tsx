import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClearLens — Interview Practice",
  description: "Mobile interview practice with AI scoring",
};

export default function MobilePracticeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {children}
    </main>
  );
}
