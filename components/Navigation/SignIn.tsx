import Link from "next/link";
import { useRouter } from "next/router";
import { cn } from "../../utils";

const SignIn = ({ classname, text }: { classname?: string; text?: string }) => {
  const { pathname } = useRouter();
  const isLanding = pathname === "/";

  return (
    <Link
      href={`/auth/Login`}
      style={{ textDecoration: "none" }}
      className={cn(
        "h-auto rounded-md flex items-center border-hidden font-medium text-[0.81em] px-[18px] py-[6px] bg-transparent",
        isLanding
          ? "text-white hover:text-white/80 active:text-white/70 hover:bg-white/10 active:bg-white/20"
          : "text-primary hover:text-primary/80 active:text-primary/70 hover:bg-primary/10 active:bg-primary/20",
        classname
      )}
    >
      {text ? text : "Log in"}
    </Link>
  );
};

export default SignIn;
