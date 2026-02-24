import { Button } from "@/components/ui/button";
import { cn } from "$/utils";
import { useX } from "../provider/xProvider";
import { FaXTwitter } from "react-icons/fa6";

export const TwitterAuth = () => {
  const { twitterStatus, connectTwitter, disconnectTwitter } = useX();

  return (
    <div className="flex flex-col justify-center items-center max-w-md mx-auto my-auto h-full">
      <div className="bg-primary/10 p-6 rounded-lg border border-primary/10">
        <div className="flex items-center gap-3 mb-6">
          <FaXTwitter className="w-6 h-6 text-black fill-white" />
          <h2 className="text-xl font-semibold text-foreground/80">
            Connect Twitter
          </h2>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Connect your Twitter account to schedule posts and manage your
          content.
        </p>
        <div className="flex flex-col md:flex-row gap-3">
          <Button
            variant={
              twitterStatus === "disconnected"
                ? "accent"
                : twitterStatus === "connecting"
                ? "accent"
                : "success"
            }
            onClick={connectTwitter}
            disabled={
              twitterStatus === "connecting" || twitterStatus === "connected"
            }
            className={cn("w-full")}
            loading={twitterStatus === "connecting"}
            loadingText="Connecting..."
          >
            {twitterStatus === "disconnected" && "Connect Twitter"}
            {twitterStatus === "connecting" && "Connecting..."}
            {twitterStatus === "connected" && "Connected"}
          </Button>

          {twitterStatus === "connected" && (
            <Button
              variant="destructive"
              onClick={disconnectTwitter}
              className="w-full "
            >
              Disconnect Twitter
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
