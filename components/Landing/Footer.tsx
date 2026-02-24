import { Mail } from "lucide-react";
import { BsDiscord } from "react-icons/bs";

const Footer = () => {
  const links = {
    product: [
      { name: "Features", href: "#features" },
      { name: "Pricing", href: "#pricing" },
      { name: "Demo", href: "#demo" },
      { name: "Roadmap", href: "#roadmap" },
    ],
    company: [
      { name: "About", href: "https://hypercho.com/" },
      { name: "Contact", href: "https://hypercho.com/contact/sales" },
    ],
    resources: [
      { name: "Blog", href: "https://hypercho.com/blog" },
      { name: "Help Center", href: "https://hypercho.com/docs" },
      { name: "Privacy Policy", href: "https://hypercho.com/docs/privacy" },
      { name: "Terms of Service", href: "https://hypercho.com/docs/tos" },
    ],
  };

  return (
    <footer className="bg-background border-t border-border py-12 px-6">
      <div className="container mx-auto max-w-7xl">
        {/* Links Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div>
            <h3 className="font-semibold text-foreground mb-4">Product</h3>
            <ul className="space-y-2">
              {links.product.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Company</h3>
            <ul className="space-y-2">
              {links.company.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Resources</h3>
            <ul className="space-y-2">
              {links.resources.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <p className="font-semibold text-foreground mb-1">
                Hypercho © {new Date().getFullYear()}
              </p>
              <p className="text-sm text-muted-foreground">
                Built with focus. For people who struggle with it.
              </p>
            </div>

            {/* Social Links */}
            <div className="flex gap-4">
              <a
                href="mailto:duola@hypercho.com"
                className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                aria-label="Email"
              >
                <Mail className="w-5 h-5 text-foreground" />
              </a>
              <a
                href="https://discord.gg/WDTQguGffh"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                aria-label="Discord"
              >
                <BsDiscord className="w-5 h-5 text-foreground" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
