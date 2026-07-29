import Link from "next/link";
import { Dices } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Dices className="h-6 w-6 text-primary" />
          <span className="font-display text-lg font-bold tracking-wide">
            FableKeeper
          </span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        {children}
      </main>
    </div>
  );
}
