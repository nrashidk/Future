/**
 * "CONFIRM YOUR EMAIL", for an account a parent registered and has not yet
 * confirmed (shared/emailConfirmation.ts is the rule; the server erases an
 * unconfirmed, unpaid account when the time runs out).
 *
 * It states the consequence and the time left, because a banner that only
 * says "please confirm" reads as optional, and here it is not. A PAID
 * account is never erased, so it gets the request without the deadline.
 *
 * Renders nothing for every account that was never asked — school students,
 * school admins and everyone registered before this existed.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MailWarning, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, serverErrorMessage } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { hoursLeftToConfirm, needsConfirmation } from "@shared/emailConfirmation";

export function EmailConfirmationBanner() {
  const { user } = useAuth();
  const { t } = useTranslation("auth");
  const { language } = useLanguage();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const now = new Date();
  if (!user || !needsConfirmation(user, now)) return null;

  const hours = hoursLeftToConfirm(user, now) ?? 0;
  const deadline = user.isPremium
    ? null
    : hours >= 48
      ? t("confirmEmail.banner.daysLeft", { days: Math.floor(hours / 24) })
      : hours > 0
        ? t("confirmEmail.banner.hoursLeft", { hours })
        : t("confirmEmail.banner.overdue");

  const resend = async () => {
    setSending(true);
    try {
      await apiRequest("POST", "/api/email-confirmation/resend", { locale: language });
      toast({ title: t("confirmEmail.banner.resentTitle"), description: t("confirmEmail.banner.resentDesc", { email: user.email }) });
    } catch (error) {
      toast({
        title: t("confirmEmail.banner.resendFailedTitle"),
        description: serverErrorMessage(error) ?? t("confirmEmail.banner.resendFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      className="mb-3 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm sm:flex-row sm:items-center dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
      data-testid="banner-confirm-email"
    >
      <MailWarning className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">{t("confirmEmail.banner.title")}</p>
        <p>
          {t("confirmEmail.banner.body")}{" "}
          <span dir="ltr" className="font-medium">{user.email}</span>
          {deadline ? <> — <span data-testid="text-confirm-deadline">{deadline}</span></> : null}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={resend} disabled={sending} data-testid="button-resend-confirmation">
        {sending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
        {t("confirmEmail.banner.resend")}
      </Button>
    </div>
  );
}
