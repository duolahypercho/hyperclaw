import { Skeleton } from "@/components/ui/skeleton";

interface SettingsSkeletonProps {
  title: string;
  description: string;
}

const SettingsSkeleton = ({ title, description }: SettingsSkeletonProps) => {
  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-2 text-foreground">{title}</h2>
      <p className="mb-6 text-sm text-muted-foreground">{description}</p>
      <div className="space-y-6">
        {[1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="w-15 h-4" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <div className="space-y-6">
          <Skeleton className="w-40 h-10" />
        </div>
      </div>
    </section>
  );
};

export default SettingsSkeleton;
