import React, { useEffect, useRef } from "react";
import { useAssistant } from "$/Providers/AssistantProv";
import { useState } from "react";
import { PersonalityData } from "$/types/services";
import { editAssistantAPI } from "$/services/assistant";
import { useToast } from "@/components/ui/use-toast";
import { useUser } from "$/Providers/UserProv";
import { fetchAssistantAPI } from "$/services/assistant";
import { Button } from "@/components/ui/button";
import { HyperchoInput } from "$/components/UI/InputBox";
import { AITextarea } from "@/components/ui/ai-textarea";
import SettingsSkeleton from "$/components/Tool/Setting/pages/skelenton";
import HyperchoLogoInput, {
  HyperchoLogoInputRef,
} from "$/components/UI/HyperchoLogoInput";

const Copanion = () => {
  const { userId } = useUser();
  const { chatid, setInfowithData } = useAssistant();
  const coverPhotoRef = useRef<HyperchoLogoInputRef>(null);
  const [personality, setPersonalityData] = useState<PersonalityData | null>(
    null
  );
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDescription, setNewDescription] = useState<string>("");
  const [tone, setTone] = useState<string>("");
  const [background, setBackground] = useState<string>("");
  const [personalityChar, setPersonalityChar] = useState<string>("");
  const [interests, setInterests] = useState<string>("");
  const [newTag, setNewTag] = useState<string>("");
  const [statusInput, setStatusInput] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [modelInput, setModelInput] = useState<string>("");
  const [curStatus, setCurStatus] = useState<string>("");
  const [newCoverPhoto, setNewCoverPhoto] = useState<string>("");
  const [hasPendingCoverPhoto, setHasPendingCoverPhoto] = useState(false);
  const [update, setUpdate] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadFileError, setuploadFileError] = useState<string>("");
  const [showError, setShowError] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [status, setStatus] = useState<"idle" | "save" | "loading">("idle");
  const { toast, dismiss } = useToast();
  const [loading, setLoading] = useState(true);
  //check if the user has edited the assistant
  useEffect(() => {
    //set update to true if the user has edited the assistant
    if (
      newTitle !== personality?.name ||
      newDescription !== personality?.description ||
      curStatus !== personality?.status ||
      model !== personality?.chatbotModel ||
      hasPendingCoverPhoto ||
      newTag !== personality?.tag ||
      tone !== personality?.characteristics?.Tone ||
      background !== personality?.characteristics?.Background ||
      interests !== personality?.characteristics?.Interests ||
      personalityChar !== personality?.characteristics?.Personality
    ) {
      setUpdate(true);
    } else {
      setUpdate(false);
    }
  }, [
    newTitle,
    newDescription,
    curStatus,
    model,
    hasPendingCoverPhoto,
    newTag,
    tone,
    background,
    interests,
    personalityChar,
    personality?.name,
    personality?.description,
    personality?.status,
    personality?.chatbotModel,
    personality?.tag,
    personality?.characteristics?.Tone,
    personality?.characteristics?.Background,
    personality?.characteristics?.Interests,
    personality?.characteristics?.Personality,
  ]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Access the latest value from `updateRef` instead of `update`
      const message =
        "You have unsaved changes. Are you sure you want to leave?";
      event.preventDefault();
      return message;
    };
    if (update) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      setStatus("save");
    } else {
      setStatus("idle");
    }
    // Cleanup function to remove the event listener
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [update]);

  useEffect(() => {
    const getData = async () => {
      const getData = await fetchAssistantAPI();
      const getJson = await getData.data;
      if (getJson.status !== 200) throw new Error(getJson.error);
      const fetchedPersonality = getJson.data.personality;
      setPersonalityData(fetchedPersonality);
      // Update all state with fetched data
      setNewTitle(fetchedPersonality.name || "");
      setNewDescription(fetchedPersonality.description || "");
      setTone(fetchedPersonality.characteristics?.Tone || "");
      setBackground(fetchedPersonality.characteristics?.Background || "");
      setPersonalityChar(fetchedPersonality.characteristics?.Personality || "");
      setInterests(fetchedPersonality.characteristics?.Interests || "");
      setNewTag(fetchedPersonality.tag || "");
      setStatusInput(fetchedPersonality.status || "");
      setModel(fetchedPersonality.chatbotModel || "");
      setModelInput(fetchedPersonality.chatbotModel || "");
      setCurStatus(fetchedPersonality.status || "");
      setNewCoverPhoto(fetchedPersonality.coverPhoto || "");
      setLoading(false);
    };
    getData();
  }, [userId]);

  const handleCoverPhotoChange = (value: string | File) => {
    if (typeof value === "string") {
      setNewCoverPhoto(value);
    }
  };

  const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userId) {
      return;
    }
    //check which fields have been edited
    const formData: { [key: string]: any } = {};
    let upload = false;
    setUploading(true);
    toast({
      title: "Setting Up Your Copanion...",
      description: "Optimizing your assistant to match your style and needs.",
      variant: "loading",
    });

    // Handle cover photo upload if needed
    if (hasPendingCoverPhoto && coverPhotoRef.current) {
      try {
        // Upload new file if exists (component handles S3 cleanup automatically)
        const uploadedKey = await coverPhotoRef.current.upload();

        // Update cover photo (either with new key or empty string for removal)
        const newCoverPhotoValue = uploadedKey || newCoverPhoto;
        formData["coverPhoto"] = newCoverPhotoValue;
        setNewCoverPhoto(newCoverPhotoValue);

        // Reset pending state
        if (!uploadedKey) {
          coverPhotoRef.current.resetPendingChanges();
        }
        setHasPendingCoverPhoto(false);
        upload = true;
      } catch (error) {
        console.error("Cover photo upload error:", error);
        setUploading(false);
        dismiss();
        toast({
          title: "Error",
          description: "Failed to upload cover photo",
          variant: "destructive",
        });
        return;
      }
    }

    if (newTitle !== personality?.name) {
      formData["name"] = newTitle;
      upload = true;
    }
    if (newDescription !== personality?.description) {
      formData["description"] = newDescription;
      upload = true;
    }
    if (curStatus !== personality?.status) {
      formData["status"] = curStatus;
      upload = true;
    }
    if (model !== personality?.chatbotModel) {
      formData["chatbotModel"] = model;
      upload = true;
    }
    if (newTag !== personality?.tag) {
      formData["tag"] = newTag;
      upload = true;
    }

    const personalityData: { [key: string]: any } = {};
    if (personalityChar !== personality?.characteristics?.Personality) {
      personalityData["Personality"] = personalityChar;
      upload = true;
    }
    if (tone !== personality?.characteristics?.Tone) {
      personalityData["Tone"] = tone;
      upload = true;
    }
    if (background !== personality?.characteristics?.Background) {
      personalityData["Background"] = background;
      upload = true;
    }
    if (interests !== personality?.characteristics?.Interests) {
      personalityData["Interests"] = interests;
      upload = true;
    }
    if (upload) {
      try {
        const response = await editAssistantAPI({
          formData: formData,
          Personality: personalityData,
        });
        const getJson = await response.data;
        if (getJson.status !== 200) {
          const error = response.data?.error || "An unknown error occurred";

          setuploadFileError(error);
          setShowError(true);
          throw new Error(error);
        }
        setInfowithData(getJson.data.personality);
        setPersonalityData(getJson.data.personality);
        setUpdate(false);
        setSaved(true);
      } catch (e: any) {
        setuploadFileError(e.message || "An error occurred during upload.");
        setShowError(true);
        toast({
          title: e.response.data.error || "Update Failed",
          description:
            "We encountered an issue while updating your assistant. Please try again.",
          variant: "destructive",
        });
      }
    }

    setUploading(false);
    dismiss();
    toast({
      title: "Copanion Updated!",
      variant: "success",
      description: "Your Copanion is now up-to-date and ready to talk you.",
    });
  };

  if (loading) {
    return (
      <SettingsSkeleton
        title="Customize"
        description="Personalize your AI friend's personality, responses, and interactions to bring your imaginary friend to life."
      />
    );
  }

  // Only render the form after loading is complete
  return (
    <>
      <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
        <h2 className="text-2xl font-semibold mb-2 text-foreground">
          Customize
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Personalize your AI friend&apos;s personality, responses, and
          interactions to bring your imaginary friend to life.
        </p>
        <form className="space-y-6" onSubmit={onFormSubmit}>
          {/* Avatar Upload */}
          <div className="flex flex-col items-center gap-4">
            <HyperchoLogoInput
              ref={coverPhotoRef}
              value={newCoverPhoto || ""}
              onChange={handleCoverPhotoChange}
              onPendingChangesChange={setHasPendingCoverPhoto}
              placeholder="Upload copanion avatar"
              storeLocation={`user/${userId}/assistant/${chatid}/coverImage`}
              size="lg"
              variant="staged"
              maxSizeInMB={10}
              convertType="webp"
              quality={85}
              width={400}
              height={400}
            />
          </div>

          {/* Main Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="name"
              >
                Name
              </label>
              <HyperchoInput
                id="name"
                required
                value={newTitle}
                placeholder="What's my name?"
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={20}
                variant="hypercho"
              />
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="tag"
              >
                Tag Line
              </label>
              <HyperchoInput
                id="tag"
                required
                value={newTag}
                placeholder="Briefly describe me"
                onChange={(e) => setNewTag(e.target.value)}
                maxLength={50}
                variant="hypercho"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Description
              </label>
              <AITextarea
                value={newDescription}
                onValueChange={(value: string) => setNewDescription(value)}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-4 pt-4">
            <Button
              type="reset"
              variant="outline"
              className="max-w-fit"
              onClick={(e) => {
                e.preventDefault();
                setNewTitle(personality?.name || "");
                setNewDescription(personality?.description || "");
                setCurStatus(personality?.status || "");
                setModel(personality?.chatbotModel || "");
                setNewCoverPhoto(personality?.coverPhoto || "");
                setHasPendingCoverPhoto(false);
                // Reset the logo input component
                if (coverPhotoRef.current) {
                  coverPhotoRef.current.clear();
                }
              }}
            >
              Reset
            </Button>
            <Button
              type="submit"
              variant="default"
              className="max-w-fit"
              disabled={!update || uploading}
            >
              {uploading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </section>
    </>
  );
};

export default Copanion;
