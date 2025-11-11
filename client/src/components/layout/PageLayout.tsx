import { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

interface PageLayoutProps {
  children: ReactNode;
  variant?: "gradient" | "plain";
}

export function PageLayout({ children, variant = "plain" }: PageLayoutProps) {
  const bgClass = variant === "gradient" 
    ? "bg-gradient-to-br from-primary/10 via-background to-accent/10"
    : "bg-background";

  return (
    <div className={`min-h-screen flex flex-col ${bgClass}`}>
      <Header />
      <main className="flex-1 pt-4">
        {children}
      </main>
      <Footer />
    </div>
  );
}
