import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StickyNote } from "@/components/StickyNote";
import { useTranslation } from "react-i18next";

interface CredentialsModalProps {
  open: boolean;
  onClose: () => void;
  credentials: {
    username: string;
    password: string;
    email: string;
  };
  organizationName?: string;
  title?: string;
  description?: string;
}

export function CredentialsModal({ open, onClose, credentials, organizationName, title, description }: CredentialsModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation("pricing");

  const handleCopy = () => {
    const lines = [
      `${t("credentials.usernameLabel")}: ${credentials.username}`,
      `${t("credentials.passwordLabel")}: ${credentials.password}`,
    ];
    if (credentials.email) lines.push(`${t("credentials.emailLabel")}: ${credentials.email}`);
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: t("credentials.copiedTitle"), description: t("credentials.copiedDesc") });
  };

  const handleDownload = () => {
    const lines = [
      t("credentials.downloadButton"),
      `${t("credentials.usernameLabel")}: ${credentials.username}`,
      `${t("credentials.passwordLabel")}: ${credentials.password}`,
    ];
    if (credentials.email) lines.push(`${t("credentials.emailLabel")}: ${credentials.email}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${credentials.username}-credentials.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const modalTitle = title ?? (
    organizationName
      ? t("credentials.schoolCreatedTitle")
      : t("credentials.accountCreatedTitle")
  );
  const modalDesc = description ?? (
    organizationName
      ? t("credentials.schoolCreatedDesc", { orgName: organizationName })
      : t("credentials.accountCreatedDesc")
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="modal-credentials">
        <DialogHeader>
          <DialogTitle data-testid="modal-credentials-title">{modalTitle}</DialogTitle>
          <DialogDescription>{modalDesc}</DialogDescription>
        </DialogHeader>

        <StickyNote color="yellow" rotation="1" className="mx-auto w-full">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("credentials.usernameLabel")}</p>
              <p className="font-mono font-bold text-lg" data-testid="text-username">{credentials.username}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("credentials.passwordLabel")}</p>
              <p className="font-mono font-bold text-lg" data-testid="text-password">{credentials.password}</p>
            </div>
            {credentials.email && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("credentials.emailLabel")}</p>
                <p className="font-mono font-bold text-base break-all" data-testid="text-email">{credentials.email}</p>
              </div>
            )}
          </div>
        </StickyNote>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleCopy} data-testid="button-copy-all">
            <Copy className="w-4 h-4 me-2" />
            {t("credentials.copyButton")}
          </Button>
          <Button onClick={handleDownload} data-testid="button-download-credentials">
            <Download className="w-4 h-4 me-2" />
            {t("credentials.downloadButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
