import Link from "next/link";
import { cn } from "../../utils";

const SignUp = ({ classname }: { classname?: string }) => {
  return (
    <Link
      href={`/auth/Signup`}
      style={{ textDecoration: "none" }}
      className={cn(
        "h-auto rounded-md flex items-center border-hidden font-medium text-[0.81em] px-[18px] py-[6px] bg-transparent text-primary hover:text-primary/80 active:text-primary/70 hover:bg-primary/10 active:bg-primary/20",
        classname
      )}
    >
      Sign up
    </Link>
  );
};

export default SignUp;
