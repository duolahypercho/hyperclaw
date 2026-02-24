export const daysOfWeek = [
  { name: "Monday", short: "Mon" },
  { name: "Tuesday", short: "Tue" },
  { name: "Wednesday", short: "Wed" },
  { name: "Thursday", short: "Thu" },
  { name: "Friday", short: "Fri" },
  { name: "Saturday", short: "Sat" },
  { name: "Sunday", short: "Sun" },
];

export function getDayIndexFromDate(date?: Date | string) {
  if (!date) return undefined;
  const d = typeof date === "string" ? new Date(date) : date;
  let day = d.getDay();
  day = day === 0 ? 6 : day - 1;
  return daysOfWeek[day].name;
}

const cloneDate = (date: Date): Date => {
  return new Date(date.getTime());
};

export const generateDateRange = (startDate: Date, endDate: Date): Date[] => {
  const dates: Date[] = [];
  const currentDate = cloneDate(startDate);

  while (currentDate <= endDate) {
    dates.push(cloneDate(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
};

export function getDateForDay(dayIndex: number): Date {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 7) % 7));
  const targetDate = new Date(monday);
  targetDate.setDate(monday.getDate() + dayIndex);
  return targetDate;
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export function isPast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getStartOfDay(date: Date): Date {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

export function getEndOfDay(date: Date): Date {
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

export function getDayStartAndEnd(dayIndex: number): {
  start: Date;
  end: Date;
} {
  const dayDate = getDateForDay(dayIndex);
  return {
    start: getStartOfDay(dayDate),
    end: getEndOfDay(dayDate),
  };
}

export function getDayStartAndEndFromName(
  dayName: string
): { start: Date; end: Date } | null {
  const dayIndex = daysOfWeek.findIndex((day) => day.name === dayName);
  if (dayIndex === -1) return null;
  return getDayStartAndEnd(dayIndex);
}

export const calculateOptimalGap = (taskCount: number): number => {
  // Use larger gaps for more tasks to reduce reordering frequency
  if (taskCount > 1000) return 10000;
  if (taskCount > 500) return 5000;
  if (taskCount > 100) return 2000;
  return 1000;
};

/** Matches your backend’s `generateOrderValues` */
export const generateOrderValues = (
  count: number,
  gap: number = 1000
): number[] => {
  return Array.from({ length: count }, (_, index) => (index + 1) * gap);
};
