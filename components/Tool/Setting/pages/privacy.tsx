import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "$/components/UI/HyperchoSelect";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const Privacy = () => {
  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-2 text-foreground">Privacy</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage your privacy settings.
      </p>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <Label htmlFor="profile-visibility" className="flex-grow">
            Profile Visibility
          </Label>
          <Select>
            <SelectTrigger
              id="profile-visibility"
              className="w-full sm:w-[180px]"
            >
              <SelectValue placeholder="Select visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="friends">Friends Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="two-factor" className="flex-grow">
            Two-Factor Authentication
          </Label>
          <Switch id="two-factor" />
        </div>
        <div className="flex justify-end mt-4">
          <Button className="w-full sm:w-auto mt-4">Save Changes</Button>
        </div>
      </div>
    </section>
  );
};

export default Privacy;
