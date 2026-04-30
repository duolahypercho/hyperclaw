import { Skeleton } from "@/components/ui/skeleton";

const NoteEditorSkeleton = ({ count = 20, sizes = ["full", "4/5", "2/3"] }) => {
  return (
    <div className="flex-1 bg-background/60 border-none outline-none text-primary-foreground placeholder-[#9ba1ae] w-full resize-none min-h-[20px] leading-[20px] text-sm customScrollbar2 py-6 px-9 overflow-x-hidden overflow-y-auto h-full">
      <div className="flex flex-col gap-4 w-full h-full">
        {[...Array(count)].map((_, index) => (
          <Skeleton
            key={index}
            className={`w-[${sizes[index % sizes.length]}] rounded-md`}
            style={{ height: `calc(100% / ${count})` }} // Adjust height to fit within the container
          />
        ))}
      </div>
    </div>
  );
};

export default NoteEditorSkeleton;
