import { memo } from "react";
import { useSession } from "next-auth/react";
import { Dropdown, SignIn, SignUp } from ".";
import { Skeleton } from "@/components/ui/skeleton";

//check if user is authenticated or not, then render either signIn button or notitification and userpic
const AuthenticatedNavComponent = () => {
  const { status } = useSession();

  if (status === "loading")
    return <Skeleton className="h-7 w-20 max-w-[100px] min-h-[1.7rem]" />;
  if (status === "unauthenticated")
    return (
      <div className="flex flex-row gap-3">
        <SignIn />
        <SignUp />
      </div>
    );
  return (
    <>
      <Dropdown />
    </>
  );
};

export default memo(AuthenticatedNavComponent);
