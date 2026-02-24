import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hyperchoApi } from "$/services/http.config";
import { useToast } from "@/components/ui/use-toast";
import {
  Copy,
  RefreshCw,
  Check,
  ExternalLink,
  Terminal,
  Trash2,
  Plus,
  Shield,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ApiKey {
  _id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  isActive: boolean;
}

const AIAccess = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch API keys on mount
  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const response = await hyperchoApi.get("/skill/tokens");
      if (response.data.success) {
        setApiKeys(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
    }
  };

  const generateApiKey = async () => {
    setLoading(true);
    try {
      const response = await hyperchoApi.post("/skill/token", {
        name: `API Key ${apiKeys.length + 1}`,
      });
      if (response.data.success) {
        setNewKey(response.data.data.token);
        await fetchApiKeys();
        toast({
          title: "API Key Created",
          description:
            "Copy your API key now. You won't be able to see it again!",
          variant: "success",
        });
      }
    } catch (error: any) {
      console.error("Error generating API key:", error);
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to generate API key",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    setRevoking(keyId);
    try {
      const response = await hyperchoApi.delete(`/skill/token/${keyId}`);
      if (response.data.success) {
        await fetchApiKeys();
        toast({
          title: "API Key Revoked",
          description:
            "The API key has been removed and can no longer be used.",
          variant: "success",
        });
      }
    } catch (error: any) {
      console.error("Error revoking API key:", error);
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to revoke API key",
        variant: "destructive",
      });
    } finally {
      setRevoking(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "API key copied to clipboard",
        variant: "success",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy API key",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">AI Access</h2>
          <p className="text-sm text-muted-foreground">
            Manage API keys for external AI assistants
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Generate New API Key Section */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">
                Generate New API Key
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create a permanent API key to connect AI assistants
              </p>
            </div>
            <Button
              onClick={generateApiKey}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Generate
            </Button>
          </div>

          {/* New API Key Display */}
          <AnimatePresence>
            {newKey && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium text-sm">
                    Copy your API key now!
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  For security reasons, we cannot show this key again. Make sure
                  to copy it now.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={newKey}
                    readOnly
                    className="font-mono text-sm bg-background"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(newKey)}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewKey("")}
                  className="text-xs"
                >
                  I've copied my API key
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Active API Keys List */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">Active API Keys</h3>
            <span className="text-sm text-muted-foreground">
              {apiKeys.length} key{apiKeys.length !== 1 ? "s" : ""}
            </span>
          </div>

          {apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active API keys. Generate one to connect an AI assistant.
            </p>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key._id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {key.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>Created {formatDate(key.createdAt)}</span>
                      <span className="text-green-500">• Permanent</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => revokeApiKey(key._id)}
                    disabled={revoking === key._id}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    {revoking === key._id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instructions Section */}
        <div className="bg-muted/50 border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-medium text-foreground">How to Use</h3>
          </div>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Add your API key to AI assistant configurations:</p>
            <div className="bg-background rounded-lg p-3 font-mono text-xs">
              Authorization: Bearer YOUR_API_KEY
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              className="gap-2 w-full justify-center"
              asChild
            >
              <a
                href="https://docs.hypercho.com/ai-access"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4" />
                View Full Documentation
              </a>
            </Button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <h4 className="font-medium text-yellow-600 dark:text-yellow-400 text-sm mb-1">
            Keep your API keys secure
          </h4>
          <p className="text-xs text-muted-foreground">
            Never share your API keys publicly. If compromised, revoke it
            immediately using the trash icon.
          </p>
        </div>
      </div>
    </section>
  );
};

export default AIAccess;
