import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const Notifications = () => {
  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-2 text-foreground">
        Notifications
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage your notification preferences.
      </p>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="email-notifications" className="flex-grow">
            Email Notifications
          </Label>
          <Switch id="email-notifications" />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="push-notifications" className="flex-grow">
            Push Notifications
          </Label>
          <Switch id="push-notifications" />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="marketing-emails" className="flex-grow">
            Marketing Emails
          </Label>
          <Switch id="marketing-emails" />
        </div>
        <div className="flex justify-end mt-4">
          <Button className="w-full sm:w-auto mt-4">Save Changes</Button>
        </div>
      </div>
    </section>
  );
};

export default Notifications;
