"use client";

import { useState } from "react";
import { useX } from "../provider/xProvider";
import { motion } from "framer-motion";
import {
  Calendar,
  Send,
  CalendarClock,
  Settings,
  ChevronRight,
  Check,
  X,
  Sparkles,
  Hash,
  Target,
  MessageSquare,
  BarChart,
  RefreshCw,
  Globe,
  Briefcase,
  Coffee,
  Heart,
  Smile,
  Clock,
} from "lucide-react";
import { cn } from "$/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { TimeSelect } from "@/components/ui/timer";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form } from "@/components/ui/form";
import { GenerateHint } from "$/components/GenerateHint";
import { SchedulePostData, IntervalUnit } from "../types/schedulePost";
import { toast } from "@/components/ui/use-toast";

// Define the steps for the timeline
const steps = [
  { id: 1, name: "AI Generation", icon: Sparkles },
  { id: 2, name: "Customize", icon: Settings },
  { id: 3, name: "Schedule", icon: CalendarClock },
  { id: 4, name: "Review", icon: Check },
];

// Add these prompt templates at the top of the file
const PROMPT_TEMPLATES = [
  {
    icon: MessageSquare,
    title: "Company Update",
    description:
      "Share news about your company's achievements, milestones, or announcements",
    prompt: "Write a post about our latest company milestone or achievement",
  },
  {
    icon: Target,
    title: "Daily Highlight",
    description: "Share a meaningful moment or achievement from your day",
    prompt:
      "Write about a special moment or accomplishment from today that I want to share",
  },
  {
    icon: BarChart,
    title: "Industry Insights",
    description: "Share valuable insights or trends in your industry",
    prompt: "Share an interesting insight or trend about our industry",
  },
  {
    icon: Globe,
    title: "Event Promotion",
    description: "Promote upcoming events, webinars, or conferences",
    prompt: "Promote an upcoming event or webinar",
  },
];

// First, add this timezone list at the top of your file with other constants
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
].sort();

const formSchema = z.object({
  // Step management
  currentStep: z.number().min(1).max(4),
  isSubmitting: z.boolean(),

  // Step 1: AI Generation
  aiPrompt: z.string().min(1, "Please enter what you'd like to post about"),

  tone: z.enum(["professional", "casual", "friendly", "humorous"]),
  language: z.string(),
  targetAudience: z.array(z.string()),
  contentGoals: z.array(z.string()),
  hashtags: z.array(z.string()),
  aiOptimizedTargetAudience: z.boolean(),
  aiOptimizedContentGoals: z.boolean(),
  aiOptimizedHashtags: z.boolean(),
  targetAudienceInput: z.string().optional(),
  contentGoalsInput: z.string().optional(),
  hashtagsInput: z.string().optional(),

  // Step 3: Schedule
  aiOptimizedTiming: z.boolean(),
  date: z.date().optional(),
  time: z.string(),
  timezone: z.string(),
  recurrence: z.enum([
    "one_time",
    "hourly",
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "custom",
  ]),
  interval: z.number().min(0.5).max(30),
  intervalUnit: z.enum(["hour", "day", "week", "month", "year"]),
});

export default function SchedulePost() {
  const { twitterAccounts, activeAccount, handleTabChange } = useX();
  const [currentStep, setCurrentStep] = useState(1);
  const [date, setDate] = useState<Date | undefined>(new Date());
  // Calculate progress percentage
  const progress = (currentStep / steps.length) * 100;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      currentStep: 1,
      isSubmitting: false,
      aiPrompt: "",
      tone: "professional",
      language: "en",
      targetAudience: [],
      contentGoals: [],
      hashtags: [],
      aiOptimizedTargetAudience: true,
      aiOptimizedContentGoals: true,
      aiOptimizedHashtags: true,
      targetAudienceInput: "",
      contentGoalsInput: "",
      hashtagsInput: "",
      aiOptimizedTiming: true,
      time: "12:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      recurrence: "one_time",
      interval: 1,
      intervalUnit: "day",
      date: new Date(),
    },
  });

  // Handle next step
  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    const currentStep = form.getValues("currentStep");
    if (currentStep < steps.length) {
      form.setValue("currentStep", currentStep + 1);
    }
    setCurrentStep(currentStep + 1);
  };

  // Handle previous step
  const handlePrevious = () => {
    const currentStep = form.getValues("currentStep");
    if (currentStep > 1) {
      form.setValue("currentStep", currentStep - 1);
    }
    setCurrentStep(currentStep - 1);
  };

  // Handle target audience input
  const handleTargetAudienceAdd = () => {
    const input = form.getValues("targetAudienceInput");
    const currentAudience = form.getValues("targetAudience");

    if (input?.trim() && !currentAudience.includes(input.trim())) {
      form.setValue("targetAudience", [...currentAudience, input.trim()]);
      form.setValue("targetAudienceInput", "");
    }
  };

  // Handle hashtags input
  const handleHashtagsAdd = () => {
    const input = form.getValues("hashtagsInput");
    const currentHashtags = form.getValues("hashtags");

    if (input?.trim() && !currentHashtags.includes(input.trim())) {
      form.setValue("hashtags", [...currentHashtags, input.trim()]);
      form.setValue("hashtagsInput", "");
    }
  };

  // Handle content goals input
  const handleContentGoalsAdd = () => {
    const input = form.getValues("contentGoalsInput");
    const currentGoals = form.getValues("contentGoals");

    if (input?.trim() && !currentGoals.includes(input.trim())) {
      form.setValue("contentGoals", [...currentGoals, input.trim()]);
      form.setValue("contentGoalsInput", "");
    }
  };

  // Remove item from array
  const removeItem = (
    field: "targetAudience" | "contentGoals" | "hashtags",
    item: string
  ) => {
    const currentItems = form.getValues(field);
    form.setValue(
      field,
      currentItems.filter((i) => i !== item)
    );
  };

  // Modify the handleSubmit function to handle form submission
  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    form.setValue("isSubmitting", true);

    try {
      const submissionData: SchedulePostData = {
        // Step 1: AI Generation
        aiPrompt: data.aiPrompt,
        tone: data.tone,
        language: data.language,

        // Audience targeting
        aiOptimizedTargetAudience: data.aiOptimizedTargetAudience,
        targetAudience: data.targetAudience,

        // Content goals
        aiOptimizedContentGoals: data.aiOptimizedContentGoals,
        contentGoals: data.contentGoals,

        // Hashtags
        aiOptimizedHashtags: data.aiOptimizedHashtags,
        hashtags: data.hashtags,

        aiOptimizedTiming: data.aiOptimizedTiming,
        // Scheduling
        scheduling: data.aiOptimizedTiming
          ? undefined
          : {
              date: data.date?.toISOString() ?? new Date().toISOString(),
              time: data.time,
              timezone: data.timezone,
              recurrence: {
                type: data.recurrence,
                interval:
                  data.recurrence !== "one_time"
                    ? {
                        value: data.interval,
                        unit:
                          data.recurrence === "daily"
                            ? "day"
                            : (data.recurrence.slice(0, -2) as IntervalUnit),
                      }
                    : undefined,
              },
            },
      };
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to schedule post",
        variant: "destructive",
      });
    } finally {
      form.setValue("isSubmitting", false);
    }
  };

  // Format date for display
  const formattedDate = date ? format(date, "PPP") : "";

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="max-w-4xl w-full h-full mx-auto"
      >
        {/* Timeline Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className={cn(
                  "flex flex-col items-center",
                  form.watch("currentStep") >= step.id
                    ? "text-primary"
                    : "text-foreground/50"
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center mb-2",
                    form.watch("currentStep") >= step.id
                      ? "bg-primary text-foreground"
                      : "bg-primary/10 text-muted-foreground"
                  )}
                >
                  <step.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">{step.name}</span>
              </div>
            ))}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Form Content */}
        <Card className="border border-primary-foreground/10">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-primary-foreground">
              {form.watch("currentStep") === 1 && "AI-Powered Post Generation"}
              {form.watch("currentStep") === 2 && "Customize Your Post"}
              {form.watch("currentStep") === 3 && "Schedule Your Post"}
              {form.watch("currentStep") === 4 && "Review & Submit"}
            </CardTitle>
            <CardDescription>
              {form.watch("currentStep") === 1 &&
                "Let AI generate engaging content for your post"}
              {form.watch("currentStep") === 2 &&
                "Fine-tune the AI-generated content to match your style"}
              {form.watch("currentStep") === 3 &&
                "Set when and how often to post"}
              {form.watch("currentStep") === 4 &&
                "Review your post before publishing"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Step 1: AI Generation */}
            {form.watch("currentStep") === 1 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ai-prompt">
                      What would you like to post about?
                    </Label>
                    <Textarea
                      id="ai-prompt"
                      placeholder="Describe what you want to share with your audience..."
                      value={form.watch("aiPrompt")}
                      onChange={(e) => {
                        form.setValue("aiPrompt", e.target.value);
                      }}
                      className="min-h-[120px] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {PROMPT_TEMPLATES.map((template, index) => (
                      <Button
                        key={index}
                        variant={
                          form.watch("aiPrompt") === template.prompt
                            ? "default"
                            : "outline"
                        }
                        className="h-auto p-4 flex flex-col items-start justify-start space-y-2 hover:bg-primary/5 truncate transition-all duration-200"
                        onClick={(e) => {
                          e.preventDefault();
                          form.setValue("aiPrompt", template.prompt);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <template.icon className="w-5 h-5" />
                          <span className="font-medium">{template.title}</span>
                        </div>
                        <p className="text-sm text-muted-foreground text-left">
                          {template.description}
                        </p>
                        {form.watch("aiPrompt") === template.prompt && (
                          <div className="absolute inset-0 border-2 border-primary rounded-md pointer-events-none" />
                        )}
                      </Button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Customize */}
            {form.watch("currentStep") === 2 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Tone of Voice</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            {
                              value: "professional",
                              label: "Professional",
                              icon: Briefcase,
                            },
                            { value: "casual", label: "Casual", icon: Coffee },
                            {
                              value: "friendly",
                              label: "Friendly",
                              icon: Heart,
                            },
                            {
                              value: "humorous",
                              label: "Humorous",
                              icon: Smile,
                            },
                          ].map((item) => (
                            <Button
                              key={item.value}
                              variant={
                                form.watch("tone") === item.value
                                  ? "default"
                                  : "outline"
                              }
                              className="w-full"
                              onClick={() => {
                                form.setValue("tone", item.value as any);
                              }}
                            >
                              <item.icon className="w-4 h-4 mr-2" />
                              {item.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Language & Region</Label>
                        <Select
                          value={form.watch("language")}
                          onValueChange={(value) => {
                            form.setValue("language", value);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English (US)</SelectItem>
                            <SelectItem value="cn">Chinese</SelectItem>
                            <SelectItem value="es">Spanish</SelectItem>
                            <SelectItem value="fr">French</SelectItem>
                            <SelectItem value="de">German</SelectItem>
                            <SelectItem value="ja">Japanese</SelectItem>
                            <SelectItem value="pt">Portuguese</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Target Audience</Label>
                          <Switch
                            checked={form.watch("aiOptimizedTargetAudience")}
                            onCheckedChange={(value) => {
                              form.setValue("aiOptimizedTargetAudience", value);
                            }}
                          />
                        </div>

                        {form.watch("aiOptimizedTargetAudience") ? (
                          <GenerateHint
                            title="AI will optimize your target audience"
                            description="Based on your content and goals, we'll automatically identify the most relevant target audience segments."
                          />
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Add target audience (press Enter)"
                                value={form.watch("targetAudienceInput")}
                                onChange={(e) => {
                                  form.setValue(
                                    "targetAudienceInput",
                                    e.target.value
                                  );
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleTargetAudienceAdd();
                                  }
                                }}
                              />
                              <Button
                                variant="outline"
                                onClick={handleTargetAudienceAdd}
                              >
                                Add
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {form.watch("targetAudience").map((audience) => (
                                <Badge
                                  key={audience}
                                  variant="outline"
                                  className="flex items-center gap-1"
                                >
                                  <Target className="w-3 h-3" />
                                  {audience}
                                  <X
                                    className="w-3 h-3 cursor-pointer"
                                    onClick={() =>
                                      removeItem("targetAudience", audience)
                                    }
                                  />
                                </Badge>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Content Goals</Label>
                          <Switch
                            checked={form.watch("aiOptimizedContentGoals")}
                            onCheckedChange={(value) => {
                              form.setValue("aiOptimizedContentGoals", value);
                            }}
                          />
                        </div>

                        {form.watch("aiOptimizedContentGoals") ? (
                          <GenerateHint
                            title="AI will set optimal content goals"
                            description="We'll analyze your content and automatically set strategic goals to maximize engagement and impact."
                          />
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Add content goals (press Enter)"
                                value={form.watch("contentGoalsInput")}
                                onChange={(e) => {
                                  form.setValue(
                                    "contentGoalsInput",
                                    e.target.value
                                  );
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleContentGoalsAdd();
                                  }
                                }}
                              />
                              <Button
                                variant="outline"
                                onClick={handleContentGoalsAdd}
                              >
                                Add
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {form.watch("contentGoals").map((goal) => (
                                <Badge
                                  key={goal}
                                  variant="outline"
                                  className="flex items-center gap-1 max-w-[200px]"
                                >
                                  <BarChart className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{goal}</span>
                                  <X
                                    className="w-3 h-3 cursor-pointer flex-shrink-0"
                                    onClick={() =>
                                      removeItem("contentGoals", goal)
                                    }
                                  />
                                </Badge>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Hashtags</Label>
                          <Switch
                            checked={form.watch("aiOptimizedHashtags")}
                            onCheckedChange={(value) => {
                              form.setValue("aiOptimizedHashtags", value);
                            }}
                          />
                        </div>

                        {form.watch("aiOptimizedHashtags") ? (
                          <GenerateHint
                            title="AI will generate trending hashtags"
                            description="We'll automatically suggest relevant and trending hashtags to increase your post's visibility."
                          />
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Add hashtags (press Enter)"
                                value={form.watch("hashtagsInput")}
                                onChange={(e) => {
                                  form.setValue(
                                    "hashtagsInput",
                                    e.target.value
                                  );
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleHashtagsAdd();
                                  }
                                }}
                              />
                              <Button
                                variant="outline"
                                onClick={handleHashtagsAdd}
                              >
                                Add
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {form.watch("hashtags").map((keyword) => (
                                <Badge
                                  key={keyword}
                                  variant="outline"
                                  className="flex items-center gap-1"
                                >
                                  <Hash className="w-3 h-3" />
                                  {keyword}
                                  <X
                                    className="w-3 h-3 cursor-pointer"
                                    onClick={() =>
                                      removeItem("hashtags", keyword)
                                    }
                                  />
                                </Badge>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Schedule */}
            {form.watch("currentStep") === 3 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <Label>AI-Optimized Timing</Label>
                      <Switch
                        checked={form.watch("aiOptimizedTiming")}
                        onCheckedChange={(value) => {
                          form.setValue("aiOptimizedTiming", value);
                        }}
                      />
                    </div>

                    {form.watch("aiOptimizedTiming") ? (
                      <GenerateHint
                        title="AI will optimize your posting time"
                        description="Based on your audience's activity patterns, we'll automatically choose the best time to post for maximum engagement."
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>When to Post</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="input"
                                  className="w-full justify-start text-left font-normal"
                                >
                                  <Calendar className="mr-2 h-4 w-4" />
                                  {form.watch("date") ? (
                                    format(form.watch("date") as any, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <CalendarComponent
                                  mode="single"
                                  selected={form.watch("date")}
                                  onSelect={(date) => {
                                    form.setValue("date", date);
                                  }}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>

                          <div className="space-y-2">
                            <Label>Time</Label>
                            <TimeSelect
                              defaultValue={form.watch("time")}
                              onTimeChange={(time) => {
                                form.setValue("time", time);
                              }}
                            />
                          </div>

                          {/* Add Timezone Selector */}
                          <div className="space-y-2">
                            <Label>Timezone</Label>
                            <Select
                              value={form.watch("timezone")}
                              onValueChange={(value) => {
                                form.setValue("timezone", value);
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select timezone" />
                              </SelectTrigger>
                              <SelectContent>
                                {TIMEZONES.map((tz) => (
                                  <SelectItem key={tz} value={tz}>
                                    <div className="flex items-center gap-2">
                                      <Globe className="w-4 h-4" />
                                      <span>{tz.replace("_", " ")}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Current local time:{" "}
                              {new Date().toLocaleTimeString([], {
                                timeZone: form.watch("timezone"),
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Repeat</Label>
                            <Select
                              value={form.watch("recurrence")}
                              onValueChange={(value: any) => {
                                form.setValue("recurrence", value);
                                // Set default interval unit based on recurrence
                                if (value === "hourly") {
                                  form.setValue("intervalUnit", "hour");
                                } else if (value === "daily") {
                                  form.setValue("intervalUnit", "day");
                                } else if (value === "weekly") {
                                  form.setValue("intervalUnit", "week");
                                } else if (value === "monthly") {
                                  form.setValue("intervalUnit", "month");
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select frequency" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="one_time">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Once
                                  </div>
                                </SelectItem>
                                <SelectItem value="hourly">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    Hourly
                                  </div>
                                </SelectItem>
                                <SelectItem value="daily">
                                  <div className="flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4" />
                                    Daily
                                  </div>
                                </SelectItem>
                                <SelectItem value="weekly">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Weekly
                                  </div>
                                </SelectItem>
                                <SelectItem value="monthly">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Monthly
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Add interval controls when recurrence is not one_time */}
                          {form.watch("recurrence") !== "one_time" && (
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label>Interval</Label>
                                <div className="flex gap-4 items-center">
                                  <div className="flex-1">
                                    <Slider
                                      min={
                                        form.watch("recurrence") === "hourly"
                                          ? 0.5
                                          : 1
                                      }
                                      max={
                                        form.watch("recurrence") === "hourly"
                                          ? 12
                                          : 30
                                      }
                                      step={
                                        form.watch("recurrence") === "hourly"
                                          ? 0.5
                                          : 1
                                      }
                                      value={[form.watch("interval")]}
                                      onValueChange={(value) => {
                                        form.setValue("interval", value[0]);
                                      }}
                                    />
                                  </div>
                                  <div className="w-32">
                                    <Input
                                      type="number"
                                      value={form.watch("interval")}
                                      onChange={(e) => {
                                        const value = parseFloat(
                                          e.target.value
                                        );
                                        if (!isNaN(value)) {
                                          form.setValue("interval", value);
                                        }
                                      }}
                                      min={
                                        form.watch("recurrence") === "hourly"
                                          ? 0.5
                                          : 1
                                      }
                                      max={
                                        form.watch("recurrence") === "hourly"
                                          ? 12
                                          : 30
                                      }
                                      step={
                                        form.watch("recurrence") === "hourly"
                                          ? 0.5
                                          : 1
                                      }
                                    />
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {form.watch("interval") === 1 ? (
                                    `Every ${
                                      form.watch("recurrence") === "daily"
                                        ? "day"
                                        : form.watch("recurrence").slice(0, -2)
                                    }`
                                  ) : (
                                    <>
                                      Every{" "}
                                      {form.watch("recurrence") === "hourly" &&
                                      form.watch("interval") === 0.5
                                        ? "half hour"
                                        : `${form.watch("interval")} ${
                                            form.watch("recurrence") ===
                                            "hourly"
                                              ? "hours"
                                              : form.watch("recurrence") ===
                                                "daily"
                                              ? "days"
                                              : form
                                                  .watch("recurrence")
                                                  .slice(0, -2) + "s"
                                          }`}
                                    </>
                                  )}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 4: Review */}
            {form.watch("currentStep") === 4 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium text-primary-foreground">
                        Content Settings
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-secondary-foreground">
                            Tone
                          </span>
                          <span className="text-sm font-medium text-primary-foreground">
                            {form.watch("tone")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-secondary-foreground">
                            AI-Generated
                          </span>
                          <span className="text-sm font-medium text-primary-foreground">
                            Yes
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-secondary-foreground">
                            Language
                          </span>
                          <span className="text-sm font-medium text-primary-foreground">
                            {form.watch("language")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-medium text-primary-foreground">
                        Schedule Settings
                      </h3>
                      <div className="space-y-2">
                        {form.watch("aiOptimizedTiming") ? (
                          <div className="flex justify-between">
                            <span className="text-sm text-secondary-foreground">
                              AI-Optimized Timing
                            </span>
                            <span className="text-sm font-medium text-primary-foreground">
                              Yes
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary-foreground">
                                Post Type
                              </span>
                              <span className="text-sm font-medium text-primary-foreground">
                                Scheduled
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary-foreground">
                                Date
                              </span>
                              <span className="text-sm font-medium text-primary-foreground">
                                {formattedDate}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary-foreground">
                                Time
                              </span>
                              <span className="text-sm font-medium text-primary-foreground">
                                {form.watch("time")}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary-foreground">
                                Recurrence
                              </span>
                              <span className="text-sm font-medium text-primary-foreground">
                                {form.watch("recurrence") === "one_time"
                                  ? "One Time"
                                  : form.watch("recurrence") === "daily"
                                  ? "Daily"
                                  : form.watch("recurrence") === "weekly"
                                  ? "Weekly"
                                  : form.watch("recurrence") === "monthly"
                                  ? "Monthly"
                                  : "Custom"}
                              </span>
                            </div>
                            {form.watch("recurrence") !== "one_time" && (
                              <div className="flex justify-between">
                                <span className="text-sm text-secondary-foreground">
                                  Interval
                                </span>
                                <span className="text-sm font-medium text-primary-foreground">
                                  {form.watch("recurrence") === "hourly" &&
                                  form.watch("interval") === 0.5
                                    ? "Every half hour"
                                    : `Every ${form.watch("interval")} ${
                                        form.watch("recurrence") === "hourly"
                                          ? form.watch("interval") === 1
                                            ? "hour"
                                            : "hours"
                                          : form.watch("recurrence") === "daily"
                                          ? "days"
                                          : form.watch("recurrence") ===
                                            "weekly"
                                          ? "weeks"
                                          : form.watch("recurrence") ===
                                            "monthly"
                                          ? "months"
                                          : "custom period"
                                      }`}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary-foreground">
                                Timezone
                              </span>
                              <span className="text-sm font-medium text-primary-foreground">
                                {form.watch("timezone")}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-secondary-foreground">
                                AI-Optimized Timing
                              </span>
                              <span className="text-sm font-medium text-primary-foreground">
                                No
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevious}
              disabled={form.watch("currentStep") === 1}
            >
              Previous
            </Button>
            {form.watch("currentStep") === steps.length ? (
              <Button
                type="submit"
                disabled={form.watch("isSubmitting")}
                variant="active"
              >
                {form.watch("isSubmitting") ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Schedule Post
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleNext}
                disabled={
                  form.watch("currentStep") === 1 && !form.watch("aiPrompt")
                }
                variant="active"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
