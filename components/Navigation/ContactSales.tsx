import Link from "next/link";
import { cn } from "../../utils";

const ContactSales = ({ classname }: { classname?: string }) => {
  return (
    <Link
      href={`/contact/sales`}
      style={{ textDecoration: "none" }}
      className={cn(
        "h-full rounded flex items-center border-hidden text-[1em] px-[18px] py-[6px] text-secondary-foreground hover:text-secondary-foreground/80 active:text-secondary-foreground/50 transition",
        classname
      )}
    >
      Contact Sales
    </Link>
  );
};

export default ContactSales;
