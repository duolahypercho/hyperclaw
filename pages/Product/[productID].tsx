import React, { ReactNode, useEffect, useRef, useState } from "react";
import { getLayout } from "../../layouts/ProductLayout";
import Logo from "../../components/Logo";
import { Globe } from "lucide-react";
import {
  BsDiscord,
  BsGithub,
  BsLinkedin,
  BsTelegram,
  BsTwitterX,
  BsYoutube,
} from "react-icons/bs";
import Link from "next/link";
import Image from "next/image";
import { AiFillInstagram } from "react-icons/ai";
import { FaEnvelope } from "react-icons/fa";
import { FaFacebookSquare } from "react-icons/fa";
import { GetServerSideProps } from "next/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HiDotsHorizontal } from "react-icons/hi";
import { getMediaUrl } from "../../utils";
import { getProduct } from "../../services/product";
import { Helmet } from "react-helmet";
import { SiOpensea } from "react-icons/si";
import { FaTiktok } from "react-icons/fa";

interface product {
  link: string;
  active: boolean;
}

interface productLinks {
  Website: product;
  Github: product;
  X: product;
  Facebook: product;
  Instagram: product;
  Linkedin: product;
  TikTok: product;
  Discord: product;
  Youtube: product;
  Telegram: product;
  Opensea: product;
  "Contact Email": product;
}

interface LinkItem {
  link: string;
  type: string;
  icon: ReactNode;
  showCaseIcon: ReactNode;
  showCased: boolean;
}

interface Categories {
  product: LinkItem[];
  socialMedia: LinkItem[];
  community: LinkItem[];
  contact: LinkItem[];
}

interface productData {
  id: string;
  owner: string;
  name: string;
  description: string;
  tagline: string;
  logo: string;
  banner: string;
  Subscribers: string;
  links: productLinks;
}

const getAllLinks = (links: productLinks): Categories => {
  const formatedlinks: Categories = {
    product: [
      {
        link: links.Website ? links.Website.link : "",
        type: "Website",
        icon: <Globe className="mr-2 h-4 w-4 hover:text-foreground" />,
        showCaseIcon: (
          <Globe className="h-6 w-6 hover:text-foreground max-md:h-4 max-md:w-4" />
        ),
        showCased: links.Website ? links.Website.active : false,
      },
      {
        link: links.Github ? links.Github.link : "",
        type: "Github",
        icon: <BsGithub className="mr-2 h-4 w-4 hover:text-[#333]" />,
        showCaseIcon: (
          <BsGithub className="h-6 w-6 hover:text-[#333] max-md:h-4 max-md:w-4" />
        ),
        showCased: links.Github ? links.Github.active : false,
      },
      {
        link: links.Opensea ? links.Opensea.link : "",
        type: "OpenSea",
        icon: <SiOpensea className="mr-2 h-4 w-4 hover:text-[#2081E2]" />,
        showCaseIcon: (
          <SiOpensea className="h-6 w-6 hover:text-[#2081E2] max-md:h-4 max-md:w-4" />
        ),
        showCased: links.Opensea ? links.Opensea.active : false,
      },
    ],
    socialMedia: [
      {
        link: links.X ? links.X.link : "",
        type: "X",
        icon: <BsTwitterX className="mr-2 h-4 w-4 hover:text-black" />,
        showCaseIcon: (
          <BsTwitterX className="h-6 w-6 hover:text-black max-md:h-4 max-md:w-4" />
        ),
        showCased: links.X ? links.X.active : false,
      },
      {
        link: links.Facebook ? links.Facebook.link : "",
        type: "Facebook",
        icon: (
          <FaFacebookSquare className="mr-2 h-4 w-4 hover:text-[#4267B2]" />
        ),
        showCaseIcon: (
          <FaFacebookSquare className="h-6 w-6 hover:text-[#4267B2] max-md:h-4 max-md:w-4" />
        ),
        showCased: links.Facebook ? links.Facebook.active : false,
      },
      {
        link: links.Instagram ? links.Instagram.link : "",
        type: "Instagram",
        icon: <AiFillInstagram className="mr-2 h-4 w-4 hover:text-[#E1306C]" />,
        showCaseIcon: (
          <AiFillInstagram className="h-6 w-6 hover:text-[#E1306C] max-md:h-4 max-md:w-4" />
        ),
        showCased: links.Instagram ? links.Instagram.active : false,
      },
      {
        link: links.Linkedin ? links.Linkedin.link : "",
        type: "Linkedin",
        icon: <BsLinkedin className="mr-2 h-4 w-4 hover:text-[#0077B5]" />,
        showCaseIcon: (
          <BsLinkedin className="h-6 w-6 hover:text-[#0077B5] max-md:h-4 max-md:w-4" />
        ),
        showCased: links.Linkedin ? links.Linkedin.active : false,
      },
      {
        link: links.Youtube ? links.Youtube.link : "",
        type: "Youtube",
        icon: <BsYoutube className="mr-2 h-4 w-4 hover:text-[#FF0000]" />,
        showCaseIcon: (
          <BsYoutube className="h-6 w-6 hover:text-[#FF0000] sm:h-4 sm:w-4" />
        ),
        showCased: links.Youtube ? links.Youtube.active : false,
      },
      {
        link: links.TikTok ? links.TikTok.link : "",
        type: "TikTok",
        icon: <FaTiktok className="mr-2 h-4 w-4 hover:text-[#000]" />,
        showCaseIcon: (
          <FaTiktok className="h-6 w-6 hover:text-[#000] max-md:h-4 max-md:w-4" />
        ),
        showCased: links.TikTok ? links.TikTok.active : false,
      },
    ],
    community: [
      {
        link: links.Discord ? links.Discord.link : "",
        type: "Discord",
        icon: <BsDiscord className="mr-2 h-4 w-4 hover:text-[#7289DA]" />,
        showCaseIcon: (
          <BsDiscord className="h-6 w-6 hover:text-[#7289DA] max-md:h-4 max-md:w-4" />
        ),
        showCased: links.Discord ? links.Discord.active : false,
      },
      {
        link: links.Telegram ? links.Telegram.link : "",
        type: "Telegram",
        icon: <BsTelegram className="mr-2 h-4 w-4 hover:text-[#0088cc]" />,
        showCaseIcon: (
          <BsTelegram className="h-6 w-6 hover:text-[#0088cc] max-md:h-4 max-md:w-4" />
        ),
        showCased: links.Telegram ? links.Telegram.active : false,
      },
    ],
    contact: [
      {
        link: links["Contact Email"] ? links["Contact Email"].link : "",
        type: "Contact Email",
        icon: <FaEnvelope className="mr-2 h-4 w-4 hover:text-[#D44638]" />,
        showCaseIcon: (
          <FaEnvelope className="h-6 w-6 hover:text-[#D44638] max-md:h-4 max-md:w-4" />
        ),
        showCased: links["Contact Email"]
          ? links["Contact Email"].active
          : false,
      },
    ],
  };
  return formatedlinks;
};

const getShowcasedIcons = (links: Categories): React.ReactNode[] => {
  const showcasedIcons: React.ReactNode[] = [];

  links.product.forEach((link) => {
    if (link.showCased) {
      showcasedIcons.push(
        <Link
          key={"Links " + link.type}
          href={link.link}
          title={link.type}
          className="text-white/80 text-sm h-fit w-fit"
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.showCaseIcon}
        </Link>
      );
    }
  });
  links.socialMedia.forEach((link) => {
    if (link.showCased) {
      showcasedIcons.push(
        <Link
          key={"Links " + link.type}
          href={link.link}
          title={link.type}
          className="text-white/80 text-sm h-fit w-fit"
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.showCaseIcon}
        </Link>
      );
    }
  });
  links.community.forEach((link) => {
    if (link.showCased) {
      showcasedIcons.push(
        <Link
          key={"Links " + link.type}
          href={link.link}
          title={link.type}
          className="text-white/80 text-sm h-fit w-fit"
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.showCaseIcon}
        </Link>
      );
    }
  });
  links.contact.forEach((link) => {
    if (link.showCased) {
      showcasedIcons.push(
        <Link
          key={"Links " + link.type}
          href={link.link}
          title={link.type}
          className="text-white/80 text-sm h-fit w-fit"
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.showCaseIcon}
        </Link>
      );
    }
  });

  return showcasedIcons;
};

const Product = (Props: {
  product: productData | null;
  notFound: boolean | null;
}) => {
  const { product, notFound } = Props;

  // Move all hooks to the top level to avoid conditional hook calls
  const [showMore, setShowMore] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // useEffect hook must be called before any early returns
  useEffect(() => {
    if (product && descriptionRef.current && containerRef.current) {
      setIsOverflowing(
        descriptionRef.current.scrollWidth > containerRef.current.clientWidth
      );
    }
  }, [product]);

  // Early return for not found case
  if (notFound || !product) {
    return (
      <div className="bg-black/30">
        <div className="flex flex-col items-center gap-3 justify-center h-screen">
          <span className="text-4xl font-semibold text-white">404 Error</span>
          <span className="text-xl text-white/60">
            Didn&apos;t find this product, try something else
          </span>
          <Link
            href="/"
            className="bg-primary text-black px-4 py-2 rounded-md font-medium"
          >
            Go to home
          </Link>
        </div>
      </div>
    );
  }

  const banner = product.banner;
  const logo = product.logo;
  const name = product.name;
  const tagline = product.tagline;
  const creator = product.owner || product.name;
  const description = product.description;
  const links = getAllLinks(product.links || {});

  //get the current url
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  // Structured data for rich snippets
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: name,
    image: [banner, logo].filter(Boolean),
    description: description,
    brand: {
      "@type": "Brand",
      name: creator,
    },
    url: pageUrl,
  };

  const checkifShowSeparator = (currentLinks: LinkItem[]) => {
    //check if currentLinks.link is not empty
    return currentLinks.some((link) => link.link !== "");
  };

  //only show one line and do not wrap the line until user click see more
  return (
    <>
      <Helmet>
        {/* Basic Meta Tags */}
        <title>{`${name} - ${tagline} | Hypercho`}</title>
        <meta name="description" content={description} />
        <meta name="author" content={creator} />

        {/* Open Graph Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={name} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={banner || logo} />
        <meta property="og:url" content={pageUrl} />

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={name} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={banner || logo} />

        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>
      <div className="w-full h-full">
        <div className="relative w-full overflow-hidden h-[510px]">
          <div className="absolute inset-0 z-0 h-full w-full">
            <span
              style={{
                boxSizing: "border-box",
                display: "block",
                overflow: "hidden",
                width: "initial",
                height: "initial",
                background: "none",
                opacity: 1,
                border: 0,
                margin: 0,
                padding: 0,
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
              }}
            >
              {banner !== "" && (
                <Image
                  src={getMediaUrl(banner)}
                  alt={name}
                  fill
                  sizes="100vw"
                  style={{
                    objectFit: "cover",
                  }}
                  priority
                />
              )}
            </span>
            <div className="absolute inset-0 z-0 h-full w-full bg-transparent bg-gradient-to-b from-black/40 to-black/80" />
          </div>
          <div className="mx-auto w-full max-w-[2560px] px-4 sm:px-8 xxl:px-16 relative z-[1] flex h-full flex-col justify-end pb-6">
            <div className="flex flex-col justify-between items-start">
              <div className="mb-4">
                <Logo src={logo} alt={`${name} logo`} size={90} />
              </div>
              <h1 className="text-2xl font-semibold text-white">{name}</h1>
              <h2 className="text-lg font-semibold text-white/60">{tagline}</h2>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:justify-between gap-4 px-4 sm:px-8 xxl:px-16 py-4 w-full">
          <div
            className="flex flex-col w-full md:w-2/3 lg:w-[600px]"
            ref={containerRef}
          >
            <div className="flex flex-col gap-2">
              <p
                ref={descriptionRef}
                className={`text-base text-white/60 overflow-hidden ${
                  showMore ? "" : "whitespace-nowrap text-ellipsis"
                }`}
              >
                {description}
              </p>
            </div>
            {isOverflowing && (
              <button
                className="bg-white/10 px-4 py-2 rounded-lg text-white text-sm w-fit active:scale-95 active:bg-white/8 transition-all duration-300 hover:bg-white/5 my-2"
                onClick={() => setShowMore(!showMore)}
              >
                {showMore ? "See less" : "See more"}
              </button>
            )}
          </div>
          <div className="flex flex-row gap-6 w-fit">
            {getShowcasedIcons(links)}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-white/80 text-sm h-fit w-fit hover:text-foreground active:text-foreground/60">
                  <HiDotsHorizontal className="w-6 h-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>{name}</DropdownMenuLabel>
                {checkifShowSeparator(links.product) && (
                  <DropdownMenuSeparator />
                )}
                <DropdownMenuGroup>
                  {links.product
                    .filter((link) => link.link !== "")
                    .map((link) => (
                      <DropdownMenuItem key={link.type}>
                        <Link
                          className="w-full h-full flex flex-row items-center justify-start"
                          href={link.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.icon}
                          <span>{link.type}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                {checkifShowSeparator(links.socialMedia) && (
                  <DropdownMenuSeparator />
                )}
                <DropdownMenuGroup>
                  {links.socialMedia
                    .filter((link) => link.link !== "")
                    .map((link) => (
                      <DropdownMenuItem key={link.type}>
                        <Link
                          className="w-full h-full flex flex-row items-center justify-start"
                          href={link.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.icon}
                          <span>{link.type}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                {checkifShowSeparator(links.community) && (
                  <DropdownMenuSeparator />
                )}
                <DropdownMenuGroup>
                  {links.community
                    .filter((link) => link.link !== "")
                    .map((link) => (
                      <DropdownMenuItem key={link.type}>
                        <Link
                          className="w-full h-full flex flex-row items-center justify-start"
                          href={link.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.icon}
                          <span>{link.type}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                {checkifShowSeparator(links.contact) && (
                  <DropdownMenuSeparator />
                )}
                <DropdownMenuGroup>
                  {links.contact
                    .filter((link) => link.link !== "")
                    .map((link) => (
                      <DropdownMenuItem key={link.type}>
                        <Link
                          className="w-full h-full flex flex-row items-center justify-start"
                          href={link.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.icon}
                          <span>{link.type}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </>
  );
};

Product.getLayout = getLayout;
export default Product;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { productID } = context.params as { productID: string };

  try {
    const productRaw = await getProduct({ productId: productID });
    const productReturn = productRaw.data;
    if (productReturn.status !== 200) {
      return {
        notFound: true,
      };
    }
    return {
      props: {
        product: productReturn.data,
      },
    };
  } catch (error) {
    return {
      props: {
        notFound: true,
      },
    };
  }
};
