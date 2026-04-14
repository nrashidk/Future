import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import StickyNote from "@/components/StickyNote";

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

  const handleCopy = () => {
    const lines = [`Username: ${credentials.username}`, `Password: ${credentials.password}`];
    if (credentials.email) lines.push(`Email: ${credentials.email}`);
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Copied!", description: "Credentials copied to clipboard" });
  };

  const handleDownload = () => {
    const lines = [`Login Credentials`, `Username: ${credentials.username}`, `Password: ${credentials.password}`];
    if (credentials.email) lines.push(`Email: ${credentials.email}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${credentials.username}-credentials.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const modalTitle = title ?? (organizationName ? "School Created" : "Account Created Successfully!");
  const modalDesc = description ?? (
    organizationName
      ? `"${organizationName}" has been created. Save these admin credentials — they won't be shown again.`
      : "Your account has been created. Save these credentials securely — they won't be shown again."
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
              <p className="text-xs text-muted-foreground mb-1">Username</p>
              <p className="font-mono font-bold text-lg" data-testid="text-username">{credentials.username}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Password</p>
              <p className="font-mono font-bold text-lg" data-testid="text-password">{credentials.password}</p>
            </div>
            {credentials.email && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <p className="font-mono font-bold text-base break-all" data-testid="text-email">{credentials.email}</p>
              </div>
            )}
          </div>
        </StickyNote>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleCopy} data-testid="button-copy-all">
            <Copy className="w-4 h-4 mr-2" />
            Copy to Clipboard
          </Button>
          <Button onClick={handleDownload} data-testid="button-download-credentials">
            <Download className="w-4 h-4 mr-2" />
            Download &amp; Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
