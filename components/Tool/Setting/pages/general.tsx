import React, { useEffect, useState, useRef } from "react";
import { HyperchoInput, HyperchoTextarea } from "$/components/UI/InputBox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUser } from "$/Providers/UserProv";
import { useToast } from "@/components/ui/use-toast";
import SettingsSkeleton from "$/components/Tool/Setting/pages/skelenton";
import HyperchoLogoInput, {
  HyperchoLogoInputRef,
} from "$/components/UI/HyperchoLogoInput";
import { Loader2 } from "lucide-react";

const General = () => {
  const { userInfo, setId } = useUser();
  const profilePicRef = useRef<HyperchoLogoInputRef>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [profilePic, setProfilePic] = useState("");
  const [hasPendingProfilePic, setHasPendingProfilePic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aboutme, setAboutme] = useState("");
  const [hasPendingAboutme, setHasPendingAboutme] = useState(false);
  const { toast, dismiss } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUsername(userInfo.username ?? "");
    setEmail(userInfo.email ?? "");
    setProfilePic(userInfo.profilePic ?? "");
    setAboutme(userInfo.aboutme ?? "");
    setLoading(false);
  }, [
    userInfo.email,
    userInfo.username,
    userInfo.profilePic,
    userInfo.aboutme,
  ]);

  if (loading) {
    return (
      <SettingsSkeleton
        title="General Settings"
        description="Manage your account settings and preferences."
      />
    );
  }

  const handleProfilePicChange = (value: string | File) => {
    if (typeof value === "string") {
      setProfilePic(value);
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      // Prepare update data object
      const updateData: {
        username?: string;
        profilePic?: string;
        aboutme?: string;
      } = {};

      // Handle profile picture upload if needed
      if (hasPendingProfilePic && profilePicRef.current) {
        try {
          // Upload new file if exists (component handles S3 cleanup automatically)
          const uploadedKey = await profilePicRef.current.upload();

          // Update profile picture (either with new key or empty string for removal)
          const newProfilePicValue = uploadedKey || profilePic;
          updateData.profilePic = newProfilePicValue;
          setProfilePic(newProfilePicValue);

          // Reset pending state
          if (!uploadedKey) {
            profilePicRef.current.resetPendingChanges();
          }
          setHasPendingProfilePic(false);
        } catch (error) {
          console.error("Profile pic upload error:", error);
          setIsSaving(false);
          toast({
            title: "Error",
            description: "Failed to upload profile picture",
            variant: "destructive",
          });
          return;
        }
      }

      // Add username if changed
      if (username !== userInfo?.username) {
        updateData.username = username;
      }

      // Add about me if changed
      if (hasPendingAboutme && aboutme !== userInfo?.aboutme) {
        updateData.aboutme = aboutme;
        setHasPendingAboutme(false);
      }

      // Community Edition stores profile changes in the local session context.
      if (Object.keys(updateData).length > 0) {
        await setId({
          ...userInfo,
          username: updateData.username ?? userInfo.username,
          profilePic: updateData.profilePic ?? userInfo.profilePic,
          aboutme: updateData.aboutme ?? userInfo.aboutme,
        });

        toast({
          title: "Success",
          description: "Profile updated locally",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const checkforUpdate = () => {
    return (
      username !== userInfo?.username ||
      hasPendingProfilePic ||
      hasPendingAboutme
    );
  };

  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-2 text-foreground">
        General Settings
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage your account settings and preferences.
      </p>
      <div className="space-y-6">
        {/* Profile Picture Section */}
        <div className="space-y-2">
          <Label>Profile Picture</Label>
          <HyperchoLogoInput
            ref={profilePicRef}
            value={profilePic || ""}
            onChange={handleProfilePicChange}
            onPendingChangesChange={setHasPendingProfilePic}
            placeholder="Upload your profile picture"
            storeLocation="user/profilePics"
            size="lg"
            variant="staged"
            maxSizeInMB={5}
            convertType="webp"
            quality={85}
            width={400}
            height={400}
            className="w-full h-full"
            classNames={{
              container: "rounded-sm",
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <HyperchoInput
            id="username"
            placeholder="Enter your username"
            value={username || ""}
            onChange={(e) => setUsername(e.target.value)}
            variant={"hypercho"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <HyperchoInput
            id="email"
            type="email"
            placeholder="Enter your email"
            disabled={true}
            value={email || ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="about-me">About me</Label>
          <HyperchoTextarea
            id="about-me"
            placeholder="Tell us about yourself"
            className="min-h-[100px] bg-transparent"
            value={aboutme || ""}
            onChange={(e) => {
              setAboutme(e.target.value);
              setHasPendingAboutme(true);
            }}
          />
        </div>
        <div className="flex justify-end mt-4">
          <Button
            variant="default"
            type="button"
            onClick={handleSaveChanges}
            disabled={!checkforUpdate() || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>
    </section>
  );
};

export default General;
