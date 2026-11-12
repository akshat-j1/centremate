"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <section className="empty" style={{ margin: "60px auto", maxWidth: 500 }}>
        <h2>Let’s try that again.</h2>
        <p>
          CentreMate couldn’t load this page. Your saved plans are still in your
          account.
        </p>
        <Button onClick={reset}>Try again</Button>
        <a className="text-link" href="/">
          Back to CentreMate
        </a>
      </section>
    </main>
  );
}
