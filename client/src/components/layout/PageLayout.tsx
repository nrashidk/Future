import { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { useAuth } from "@/hooks/useAuth";

interface PageLayoutProps {
  children: ReactNode;
  variant?: "gradient" | "plain";
}

export function PageLayout({ children, variant = "plain" }: PageLayoutProps) {
  const { user } = useAuth();
  const bgClass = variant === "gradient" 
    ? "bg-gradient-to-br from-primary/10 via-background to-accent/10"
    : "bg-background";

  return (
    <div className={`min-h-screen flex flex-col ${bgClass}`}>
      <Header />
      {user && (
        <div className="max-w-4xl mx-auto w-full px-4 pt-4">
          <AnnouncementBanner />
        </div>
      )}
      <main id="main-content" className="flex-1 pt-4">
        {children}
      </main>
      <Footer />
    </div>
  );
}
