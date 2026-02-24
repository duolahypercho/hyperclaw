import Link from "next/link";
import { cn } from "../../utils";

const StartForFree = ({ classname, text = "Start for Free" }: { classname?: string; text?: string }) => {
  return (
    <Link
      href={`/auth/Signup`}
      style={{ textDecoration: "none" }}
      className={cn(
        "h-auto rounded-md flex items-center border-hidden font-medium text-[0.81em] px-[18px] py-[6px] bg-accent text-accent-foreground hover:bg-accent/80 active:bg-accent/70",
        classname
      )}
    >
      {text}
    </Link>
  );
};

export default StartForFree;
