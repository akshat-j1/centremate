import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main>
      <section className="empty" style={{ margin: "60px auto", maxWidth: 500 }}>
        <h2>This page isn’t on the map.</h2>
        <p>Return to the directory to find your exam centre.</p>
        <Button asChild>
          <a href="/">Find my centre</a>
        </Button>
      </section>
    </main>
  );
}
