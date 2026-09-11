"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We hit an unexpected error. Please try again.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Go to dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}
