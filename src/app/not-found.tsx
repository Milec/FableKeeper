import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-6xl font-bold text-primary">404</p>
      <h1 className="text-xl font-semibold">This page has wandered off the map.</h1>
      <p className="text-muted-foreground">
        The scroll you seek isn&apos;t here.
      </p>
      <Button asChild>
        <Link href="/">Return home</Link>
      </Button>
    </div>
  );
}
