import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

const Navbar = () => {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 relative">
              <Image
                src="/hypercho_icon.png"
                alt="Hypercho"
                fill
                className="object-contain"
              />
            </div>
            <span className="text-xl font-bold text-foreground">
              Copanion
            </span>
          </Link>

          {/* Navigation Links - Optional middle section */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </a>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="default"
              className="hidden sm:inline-flex"
              asChild
            >
              <a
                href="https://cal.com/hypercho"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Schedule Call
              </a>
            </Button>
            <Button variant="default" size="default" asChild>
              <Link href="/auth/Login">Sign In</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
