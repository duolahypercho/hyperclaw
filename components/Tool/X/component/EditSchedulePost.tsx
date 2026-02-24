import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

interface ScheduledTweet {
  id: string;
  status: "upcoming" | "completed";
  time: string;
  date: string;
  content: string;
}

export function EditSchedulePost({
  tweet,
  onSave,
  onCancel,
}: {
  tweet: ScheduledTweet;
  onSave: (newContent: string, newDate: string, newTime: string) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState(tweet.content);
  const [date, setDate] = useState(tweet.date);
  const [time, setTime] = useState(tweet.time);
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!content.trim()) {
      setError("Content cannot be empty");
      return;
    }
    if (!date || !time) {
      setError("Date and time are required");
      return;
    }
    setError("");
    onSave(content, date, time);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="flex flex-col gap-3 p-4 border border-primary/20 bg-background/80">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="resize-none min-h-[60px]"
        />
        <div className="flex gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-32"
          />
        </div>
        {error && <div className="text-destructive text-xs">{error}</div>}
        <div className="flex gap-2 mt-2 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="accent" onClick={handleSave}>
            Save
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
