import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Page Not Found — MultiW2",
  description: "The page you're looking for doesn't exist or has been moved.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <Card className="mx-auto max-w-md p-8 text-center">
        <p className="font-mono text-6xl font-bold text-muted-foreground/30">
          404
        </p>
        <h1 className="mt-4 text-xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground h-8 px-2.5 text-sm font-medium transition-all hover:bg-primary/80"
          >
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-background h-8 px-2.5 text-sm font-medium transition-all hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
          >
            Go home
          </Link>
        </div>
      </Card>
    </div>
  );
}
