import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface CredentialsModalProps {
  open: boolean;
  onClose: () => void;
  credentials: {
    username: string;
    password: string;
    email: string;
  };
  organizationName?: string;
}

export function CredentialsModal({ open, onClose, credentials, organizationName }: CredentialsModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: "Copied!",
      description: `${field} copied to clipboard`,
    });
  };

  const copyAllCredentials = () => {
    const text = `Login Credentials\nUsername: ${credentials.username}\nPassword: ${credentials.password}\nEmail: ${credentials.email}`;
    navigator.clipboard.writeText(text);
    toast({
      title: "All Credentials Copied!",
      description: "Please save these credentials in a secure location",
      duration: 5000,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="modal-credentials">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            🎉 Account Created Successfully!
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            {organizationName 
              ? `Your organization "${organizationName}" has been created. Please save these credentials securely.`
              : "Your premium account has been created. Please save these credentials securely."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Username</label>
              <div className="flex items-center justify-between gap-2">
                <code className="flex-1 p-2 bg-background rounded text-sm font-mono" data-testid="text-username">
                  {credentials.username}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(credentials.username, "Username")}
                  data-testid="button-copy-username"
                >
                  {copiedField === "Username" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Password</label>
              <div className="flex items-center justify-between gap-2">
                <code className="flex-1 p-2 bg-background rounded text-sm font-mono" data-testid="text-password">
                  {credentials.password}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(credentials.password, "Password")}
                  data-testid="button-copy-password"
                >
                  {copiedField === "Password" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <div className="flex items-center justify-between gap-2">
                <code className="flex-1 p-2 bg-background rounded text-sm font-mono break-all" data-testid="text-email">
                  {credentials.email}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(credentials.email, "Email")}
                  data-testid="button-copy-email"
                >
                  {copiedField === "Email" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg">
            <p className="text-sm text-destructive font-medium">
              ⚠️ Important: Save these credentials now! You won't be able to see your password again.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={copyAllCredentials}
            className="w-full sm:w-auto"
            data-testid="button-copy-all"
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy All
          </Button>
          <Button
            onClick={onClose}
            className="w-full sm:w-auto"
            data-testid="button-continue"
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
