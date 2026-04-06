import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export default function NotFound() {
  useEffect(() => { document.title = "Page Not Found | Future Pathways"; }, []);

  return (
    <main id="main-content" className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center">
          <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
          <p className="text-muted-foreground mb-6">
            Sorry, we couldn't find the page you were looking for. It may have been moved or no longer exists.
          </p>
          <Button asChild data-testid="button-go-home">
            <Link href="/">Go to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
