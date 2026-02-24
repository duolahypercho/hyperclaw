import React from "react";
import Head from "next/head";

interface SEOProps {
  title: string;
  description: string;
  url: string;
  image: string;
  author: string;
  keywords?: string;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
  noindex?: boolean;
  nofollow?: boolean;
  locale?: string;
  alternateLocales?: string[];
  type?: "website" | "article" | "product" | "software";
  siteName?: string;
  twitterHandle?: string;
  facebookAppId?: string;
  additionalMeta?: Array<{ name?: string; property?: string; content: string }>;
  additionalStructuredData?: any;
}

const SEO: React.FC<SEOProps> = ({
  title,
  description,
  url,
  image,
  author,
  keywords,
  publishedTime,
  modifiedTime,
  section,
  tags,
  noindex = false,
  nofollow = false,
  locale = "en_US",
  alternateLocales = [],
  type = "website",
  siteName = "Hypercho Copanion",
  twitterHandle = "@hypercho",
  facebookAppId,
  additionalMeta = [],
  additionalStructuredData,
}) => {
  const fullTitle = title.includes("Hypercho")
    ? title
    : `${title} | Hypercho Copanion`;

  // Normalize image URL to ensure it's absolute
  const normalizeImageUrl = (imgUrl: string): string => {
    if (!imgUrl) return "";
    // If already absolute, return as is
    if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
      return imgUrl;
    }
    // If relative, make it absolute based on the page URL
    if (imgUrl.startsWith("/")) {
      try {
        const baseUrl = new URL(url);
        return `${baseUrl.origin}${imgUrl}`;
      } catch {
        // Fallback if URL parsing fails
        return imgUrl.startsWith("/")
          ? `https://copanion.hypercho.com${imgUrl}`
          : imgUrl;
      }
    }
    return imgUrl;
  };

  const absoluteImageUrl = normalizeImageUrl(image);

  const structuredData = {
    "@context": "https://schema.org",
    "@type":
      type === "article"
        ? "Article"
        : type === "product"
        ? "Product"
        : type === "software"
        ? "SoftwareApplication"
        : "WebPage",
    name: title,
    headline: title,
    description: description,
    url: url,
    image: absoluteImageUrl,
    author: {
      "@type": "Organization",
      name: author,
      url: "https://hypercho.com",
      logo: "https://copanion.hypercho.com/Logopic.png",
    },
    publisher: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
      logo: "https://copanion.hypercho.com/Logopic.png",
    },
    ...(type === "article" &&
      publishedTime && { datePublished: publishedTime }),
    ...(type === "article" && modifiedTime && { dateModified: modifiedTime }),
    ...(type === "article" && section && { articleSection: section }),
    ...(type === "article" && tags && { keywords: tags.join(", ") }),
    ...(type === "software" && {
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Web Browser",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    }),
    ...additionalStructuredData,
  };

  const robotsContent = [
    noindex ? "noindex" : "index",
    nofollow ? "nofollow" : "follow",
    "max-snippet:-1",
    "max-image-preview:large",
    "max-video-preview:-1",
  ].join(", ");

  return (
    <Head>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="author" content={author} />
      <meta
        name="keywords"
        content={
          keywords ||
          "AI, operating system, productivity, tools, Hypercho, Copanion, artificial intelligence, interactive OS"
        }
      />
      <meta name="robots" content={robotsContent} />
      {/* Note: viewport meta tag is handled automatically by Next.js */}
      <meta name="theme-color" content="#3B82F6" />
      <meta name="msapplication-TileColor" content="#3B82F6" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content="Copanion" />

      {/* Favicon and Icons */}
      <link rel="icon" href="/favicon.ico" />
      <link
        rel="icon"
        type="image/ico"
        sizes="32x32"
        href="/favicon-32x32.ico"
      />
      <link
        rel="icon"
        type="image/ico"
        sizes="16x16"
        href="/favicon-16x16.ico"
      />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

      {/* Open Graph Meta Tags - Twitter falls back to these */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteImageUrl} />
      <meta property="og:image:secure_url" content={absoluteImageUrl} />
      <meta property="og:image:alt" content={`${title} - Hypercho Copanion`} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content={locale} />
      {alternateLocales.map((locale) => (
        <meta key={locale} property="og:locale:alternate" content={locale} />
      ))}
      {type === "article" && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === "article" && modifiedTime && (
        <meta property="article:modified_time" content={modifiedTime} />
      )}
      {type === "article" && section && (
        <meta property="article:section" content={section} />
      )}
      {type === "article" &&
        tags &&
        tags.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}
      {facebookAppId && <meta property="fb:app_id" content={facebookAppId} />}

      {/* Twitter Card Meta Tags - MUST use name attribute, not property */}
      {/* Twitter Card Type - summary_large_image is required for large images */}
      <meta name="twitter:card" content="summary_large_image" />
      {twitterHandle && <meta name="twitter:site" content={twitterHandle} />}
      {twitterHandle && <meta name="twitter:creator" content={twitterHandle} />}
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {/* Twitter image - must be absolute URL with https:// */}
      <meta name="twitter:image" content={absoluteImageUrl} />
      <meta name="twitter:image:src" content={absoluteImageUrl} />
      <meta name="twitter:image:alt" content={`${title} - Hypercho Copanion`} />
      {/* Twitter image dimensions - recommended for better rendering */}
      <meta name="twitter:image:width" content="1200" />
      <meta name="twitter:image:height" content="630" />

      {/* Additional Meta Tags */}
      <meta name="format-detection" content="telephone=no" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="application-name" content="Copanion" />
      <meta
        name="msapplication-tooltip"
        content="Hypercho Copanion - AI-First Interactive OS"
      />
      <meta name="msapplication-starturl" content="/" />

      {/* Canonical URL */}
      <link rel="canonical" href={url} />

      {/* Alternate Languages */}
      {alternateLocales.map((locale) => (
        <link key={locale} rel="alternate" hrefLang={locale} href={url} />
      ))}

      {/* Additional Custom Meta Tags */}
      {additionalMeta.map((meta, index) => (
        <meta
          key={index}
          {...(meta.name ? { name: meta.name } : { property: meta.property })}
          content={meta.content}
        />
      ))}

      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Performance and Security */}
      <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
      <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
      <meta
        httpEquiv="Referrer-Policy"
        content="strict-origin-when-cross-origin"
      />
    </Head>
  );
};

export default SEO;
