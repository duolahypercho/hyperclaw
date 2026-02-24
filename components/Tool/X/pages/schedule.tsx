"use client";

import React from "react";

import type { ReactElement } from "react";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, Eye, Edit3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInteractApp } from "@OS/Provider/InteractAppProv";

interface Template {
  id: string;
  time: string;
  content: string;
  views: number;
  dayId: string;
}

interface DayTemplateSchedule {
  id: string;
  title: string;
  date: string;
  templates: Template[];
}

const initialSchedule: DayTemplateSchedule[] = [
  {
    id: "monday",
    title: "Monday",
    date: "May 26",
    templates: [
      {
        id: "mon-1",
        dayId: "monday",
        time: "12:00 am",
        content:
          "Start thinking of growth like compound interest. Tiny, consistent efforts daily may feel slow. But over time, the...",
        views: 0,
      },
      {
        id: "mon-2",
        dayId: "monday",
        time: "07:00 pm",
        content:
          "Everyone applauds the launch, but no one talks about the grind that gets you there. - The late nights - The fail...",
        views: 0,
      },
      {
        id: "mon-3",
        dayId: "monday",
        time: "09:00 pm",
        content:
          "People overestimate how much they can do in a day. And underestimate how much they can do in a year. Con...",
        views: 0,
      },
    ],
  },
  {
    id: "tuesday",
    title: "Tuesday",
    date: "May 27",
    templates: [
      {
        id: "tue-1",
        dayId: "tuesday",
        time: "12:00 am",
        content:
          "The most underrated life hack? **Keep showing up.** No big moves, no overnight success—just consistent ef...",
        views: 0,
      },
      {
        id: "tue-2",
        dayId: "tuesday",
        time: "07:00 pm",
        content:
          "Stop trying to predict where you'll be in 5 years. Focus on being the kind of person who can thrive no matter w...",
        views: 0,
      },
      {
        id: "tue-3",
        dayId: "tuesday",
        time: "09:00 pm",
        content:
          "The secret to sustainable success: Don't chase perfection, chase consistency. Show up, even when it's messy...",
        views: 0,
      },
    ],
  },
  {
    id: "wednesday",
    title: "Wednesday",
    date: "May 28",
    templates: [
      {
        id: "wed-1",
        dayId: "wednesday",
        time: "12:00 am",
        content:
          "The road to success isn't paved with life-changing moments every day. It's built brick by brick: habits, connect...",
        views: 0,
      },
      {
        id: "wed-2",
        dayId: "wednesday",
        time: "07:00 pm",
        content:
          'Stop chasing perfection—it\'s a moving target that keeps you stuck. Focus on "momentum." Progress is ugly, c...',
        views: 0,
      },
      {
        id: "wed-3",
        dayId: "wednesday",
        time: "09:00 pm",
        content:
          "Focus on systems, not goals. Goals give you a direction. Systems ensure you keep moving forward. Fall in love...",
        views: 0,
      },
    ],
  },
  {
    id: "thursday",
    title: "Thursday",
    date: "May 29",
    templates: [
      {
        id: "thu-1",
        dayId: "thursday",
        time: "12:00 am",
        content:
          "Success is rarely loud or flashy. It's built in the quiet repetition of the right actions over and over again. Don't c...",
        views: 0,
      },
      {
        id: "thu-2",
        dayId: "thursday",
        time: "12:00 am",
        content:
          "Don't obsess over overnight success stories. The real magic is in showing up each day, doing the work, and st...",
        views: 0,
      },
      {
        id: "thu-3",
        dayId: "thursday",
        time: "07:00 pm",
        content:
          "Focus less on the end goal and more on the systems that get you there. Habits > motivation Discipline > inspir...",
        views: 0,
      },
    ],
  },
  {
    id: "friday",
    title: "Friday",
    date: "May 30",
    templates: [
      {
        id: "fri-1",
        dayId: "friday",
        time: "12:00 am",
        content:
          "The most underrated life hack? **Keep showing up.** No big moves, no overnight success—just consistent ef...",
        views: 0,
      },
      {
        id: "fri-2",
        dayId: "friday",
        time: "07:00 pm",
        content:
          "Everyone chases the outcome. Few obsess over the process. Habits are what compound into success, not int...",
        views: 0,
      },
      {
        id: "fri-3",
        dayId: "friday",
        time: "07:00 pm",
        content:
          "Most people underestimate what can happen in a year of consistently showing up. Build habits, not streaks. F...",
        views: 0,
      },
    ],
  },
  {
    id: "saturday",
    title: "Saturday",
    date: "May 31",
    templates: [
      {
        id: "sat-1",
        dayId: "saturday",
        time: "12:00 am",
        content:
          "Stop trying to predict where you'll be in 5 years. Focus on being the kind of person who can thrive no matter w...",
        views: 0,
      },
      {
        id: "sat-2",
        dayId: "saturday",
        time: "07:00 pm",
        content:
          'Stop chasing perfection—it\'s a moving target that keeps you stuck. Focus on "momentum." Progress is ugly, c...',
        views: 0,
      },
      {
        id: "sat-3",
        dayId: "saturday",
        time: "09:00 pm",
        content:
          "Start thinking of growth like compound interest. Tiny, consistent efforts daily may feel slow. But over time, the...",
        views: 0,
      },
    ],
  },
  {
    id: "sunday",
    title: "Sunday",
    date: "June 01",
    templates: [
      {
        id: "sun-1",
        dayId: "sunday",
        time: "07:00 pm",
        content:
          'Focus less on the "end" and more on the "momentum". Habits shape you. Discipline sustains you. Your netwo...',
        views: 0,
      },
    ],
  },
];

const SortableTemplate = React.memo(function SortableTemplate({
  template,
  onViewClick,
  onEditClick,
  onEmptyClick,
}: {
  template: Template;
  onViewClick: () => void;
  onEditClick: () => void;
  onEmptyClick?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: template.id,
    transition: {
      duration: 150,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isEmpty = !template.content;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-4 border border-primary/10 border-solid hover:shadow-sm transition-shadow cursor-move ${
        isDragging ? "shadow-lg opacity-50" : ""
      } ${isOver ? "ring-2 ring-primary" : ""} ${
        isEmpty
          ? "border-dashed bg-muted/40 cursor-pointer hover:bg-primary/10"
          : ""
      }`}
      onClick={isEmpty && onEmptyClick ? onEmptyClick : undefined}
    >
      <div className="flex items-start gap-3">
        <Clock className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
        <span className="text-sm font-medium text-muted-foreground min-w-[60px]">
          {template.time}
        </span>
        <div className="flex-1">
          {isEmpty ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Plus className="w-4 h-4" />
              <span className="text-sm">Click to add a post</span>
            </div>
          ) : (
            <p className="text-sm text-foreground leading-relaxed truncate line-clamp-1">
              {template.content}
            </p>
          )}
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onViewClick();
              }}
            >
              <Eye className="w-3 h-3 text-gray-400" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onEditClick();
              }}
            >
              <Edit3 className="w-3 h-3 text-gray-400" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
});

// 1. Helper to generate empty slots for each day
function fillDayWithEmptyTemplates(
  day: DayTemplateSchedule
): DayTemplateSchedule {
  const fixedTimes = ["12:00 am", "07:00 pm", "09:00 pm"];
  const filledTemplates: Template[] = [];
  for (let i = 0; i < fixedTimes.length; i++) {
    const template = day.templates.find((t) => t.time === fixedTimes[i]);
    if (template) {
      filledTemplates.push(template);
    } else {
      filledTemplates.push({
        id: `${day.id}-empty-${i}`,
        dayId: day.id,
        time: fixedTimes[i],
        content: "",
        views: 0,
      });
    }
  }
  return { ...day, templates: filledTemplates };
}

export default function SchedulePage() {
  const [schedule, setSchedule] = useState<DayTemplateSchedule[]>(
    initialSchedule.map(fillDayWithEmptyTemplates)
  );
  const { bodyRef } = useInteractApp();
  const [editingTemplate, setEditingTemplate] = useState<{
    dayId: string;
    templateId: string;
    content: string;
  } | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);

  // Add Day Dialog State
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [newDayTitle, setNewDayTitle] = useState("");
  const [newDayDate, setNewDayDate] = useState("");

  // Add Template Dialog State
  const [addTemplateOpen, setAddTemplateOpen] = useState<string | null>(null); // dayId
  const [newTemplateTime, setNewTemplateTime] = useState("");
  const [newTemplateContent, setNewTemplateContent] = useState("");
  const memoizedSchedule = useMemo(() => schedule, [schedule]);
  // Infinite scroll state
  const [daysLoaded, setDaysLoaded] = useState(schedule.length);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const template = schedule
        .flatMap((day) => day.templates)
        .find((template) => template.id === active.id);
      setActiveTemplate(template || null);
    },
    [schedule]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTemplate(null);

      if (!over) return;

      const activeTemplate = schedule
        .flatMap((day) => day.templates)
        .find((template) => template.id === active.id);
      const targetTemplate = schedule
        .flatMap((day) => day.templates)
        .find((template) => template.id === over.id);

      if (
        !activeTemplate ||
        !targetTemplate ||
        activeTemplate.id === targetTemplate.id
      )
        return;

      // Only allow swapping content if target is an empty slot or another template
      setSchedule((prevSchedule) =>
        prevSchedule.map((day) => ({
          ...day,
          templates: day.templates.map((template) => {
            if (template.id === activeTemplate.id) {
              // Move content into the empty slot, or swap with another template
              return {
                ...template,
                content: targetTemplate.content,
                views: targetTemplate.views,
              };
            }
            if (template.id === targetTemplate.id) {
              return {
                ...template,
                content: activeTemplate.content,
                views: activeTemplate.views,
              };
            }
            return template;
          }),
        }))
      );
    },
    [schedule]
  );

  const handleEditTemplate = useCallback(
    (dayId: string, templateId: string, newContent: string) => {
      setSchedule((prevSchedule) =>
        prevSchedule.map((day) => {
          if (day.id === dayId) {
            return {
              ...day,
              templates: day.templates.map((template) =>
                template.id === templateId
                  ? { ...template, content: newContent }
                  : template
              ),
            };
          }
          return day;
        })
      );
      setEditingTemplate(null);
    },
    []
  );

  const handleViewClick = useCallback((dayId: string, templateId: string) => {
    setSchedule((prevSchedule) =>
      prevSchedule.map((day) => {
        if (day.id === dayId) {
          return {
            ...day,
            templates: day.templates.map((template) =>
              template.id === templateId
                ? { ...template, views: template.views + 1 }
                : template
            ),
          };
        }
        return day;
      })
    );
  }, []);

  // Add Day Handler
  const handleAddDay = () => {
    if (!newDayTitle.trim() || !newDayDate.trim()) return;
    const newDayId =
      newDayTitle.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
    setSchedule((prev) => [
      ...prev,
      fillDayWithEmptyTemplates({
        id: newDayId,
        title: newDayTitle,
        date: newDayDate,
        templates: [],
      }),
    ]);
    setNewDayTitle("");
    setNewDayDate("");
    setAddDayOpen(false);
  };

  // Add Template Handler
  const handleAddTemplate = (dayId: string) => {
    if (!newTemplateTime.trim() || !newTemplateContent.trim()) return;
    setSchedule((prev) =>
      prev.map((day) => {
        if (day.id === dayId) {
          // Replace the empty slot with the new template (keep id, dayId, time)
          return {
            ...day,
            templates: day.templates.map((template) =>
              !template.content && template.time === newTemplateTime
                ? {
                    ...template,
                    content: newTemplateContent,
                    views: 0,
                  }
                : template
            ),
          };
        }
        return day;
      })
    );
    setNewTemplateTime("");
    setNewTemplateContent("");
    setAddTemplateOpen(null);
  };

  // Helper to get next day info
  function getNextDayInfo(lastDay: DayTemplateSchedule, index: number) {
    // Try to parse the last date and increment by 1 day
    let nextDate = "";
    let nextTitle = `Day ${daysLoaded + index + 1}`;
    try {
      const lastDate = new Date(lastDay.date + ", 2024");
      if (!isNaN(lastDate.getTime())) {
        lastDate.setDate(lastDate.getDate() + 1);
        nextDate = lastDate.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
        });
      }
    } catch {
      nextDate = `Day ${daysLoaded + index + 1}`;
    }
    return { title: nextTitle, date: nextDate || nextTitle };
  }

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!bodyRef) return;
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      // Near bottom, load more days
      setDaysLoaded((prev) => prev + 3);
    }
  }, []);

  // Effect to add more days when daysLoaded increases
  useEffect(() => {
    if (daysLoaded > schedule.length) {
      const newDays: DayTemplateSchedule[] = [];
      let lastDay = schedule[schedule.length - 1];
      for (let i = 0; i < daysLoaded - schedule.length; i++) {
        const { title, date } = getNextDayInfo(lastDay, i);
        const newDay: DayTemplateSchedule = fillDayWithEmptyTemplates({
          id: `${title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${i}`,
          title,
          date,
          templates: [],
        });
        newDays.push(newDay);
        lastDay = newDay;
      }
      setSchedule((prev) => [...prev, ...newDays]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysLoaded]);

  useEffect(() => {
    if (!bodyRef) return;
    const el = bodyRef.current;
    if (!el) return;

    el.addEventListener("scroll", handleScroll);

    // Cleanup
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  return (
    <div className="max-w-4xl w-full mx-auto h-fit">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-8">
          {memoizedSchedule.slice(0, daysLoaded).map((day) => (
            <div key={day.id} className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                {day.title} | {day.date}
              </h2>
              <SortableContext
                items={day.templates.map((template) => template.id)}
                strategy={verticalListSortingStrategy}
              >
                {day.templates.map((template) => (
                  <SortableTemplate
                    key={template.id}
                    template={template}
                    onViewClick={() =>
                      template.content && handleViewClick(day.id, template.id)
                    }
                    onEditClick={() =>
                      template.content &&
                      setEditingTemplate({
                        dayId: day.id,
                        templateId: template.id,
                        content: template.content,
                      })
                    }
                    onEmptyClick={() => {
                      setAddTemplateOpen(day.id);
                      setNewTemplateTime(template.time);
                    }}
                  />
                ))}
              </SortableContext>
            </div>
          ))}
        </div>
        {/* Add Day Button */}
        <div className="flex justify-center mt-8">
          <Button variant="default" onClick={() => setAddDayOpen(true)}>
            + Add Day
          </Button>
        </div>
        {/* Add Template Dialog */}
        <Dialog
          open={!!addTemplateOpen}
          onOpenChange={() => setAddTemplateOpen(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <input
                type="text"
                className="w-full px-3 py-2 rounded bg-background border border-input text-foreground"
                placeholder="Time (e.g. 12:00 am)"
                value={newTemplateTime}
                onChange={(e) => setNewTemplateTime(e.target.value)}
                disabled
              />
              <Textarea
                value={newTemplateContent}
                onChange={(e) => setNewTemplateContent(e.target.value)}
                className="min-h-[80px]"
                placeholder="Template content..."
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setAddTemplateOpen(null)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    addTemplateOpen && handleAddTemplate(addTemplateOpen)
                  }
                  disabled={!newTemplateContent.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {/* Add Day Dialog */}
        <Dialog open={addDayOpen} onOpenChange={setAddDayOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Day</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <input
                type="text"
                className="w-full px-3 py-2 rounded bg-background border border-input text-foreground"
                placeholder="Day Title (e.g. Monday)"
                value={newDayTitle}
                onChange={(e) => setNewDayTitle(e.target.value)}
              />
              <input
                type="text"
                className="w-full px-3 py-2 rounded bg-background border border-input text-foreground"
                placeholder="Date (e.g. May 32)"
                value={newDayDate}
                onChange={(e) => setNewDayDate(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddDayOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddDay}
                  disabled={!newDayTitle.trim() || !newDayDate.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <DragOverlay dropAnimation={null}>
          {activeTemplate ? (
            <Card className="p-3 shadow-lg rotate-2">
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                <span className="text-sm font-medium text-muted-foreground min-w-[60px]">
                  {activeTemplate.time}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-foreground leading-relaxed truncate line-clamp-1">
                    {activeTemplate.content}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Eye className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <Edit3 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
      {/* Edit Dialog */}
      <Dialog
        open={!!editingTemplate}
        onOpenChange={() => setEditingTemplate(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={editingTemplate?.content || ""}
              onChange={(e) =>
                setEditingTemplate((prev) =>
                  prev ? { ...prev, content: e.target.value } : null
                )
              }
              className="min-h-[120px]"
              placeholder="Enter your template content..."
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setEditingTemplate(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (editingTemplate) {
                    handleEditTemplate(
                      editingTemplate.dayId,
                      editingTemplate.templateId,
                      editingTemplate.content
                    );
                  }
                }}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
