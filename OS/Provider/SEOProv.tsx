import React, { createContext, useContext, useMemo } from "react";
import Head from "next/head";

// --- Types ---
export type SEOJsonLd = Record<string, any>;

const defaultSEOSchema: SEOSchema = {
  title: "Copanion",
  description: "Copanion",
  url: "https://hypercho.com",
  image: "https://hypercho.com/opImage.jpg",
};

export interface SEOTwitter {
  card?: string;
  site?: string;
  creator?: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface SEOOpenGraph {
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  site_name?: string;
  locale?: string;
  [key: string]: any;
}

export interface SEOSchema {
  title: string;
  description: string;
  url: string;
  image: string;
  author?: string;
  robots?: string;
  canonical?: string;
  type?: string; // og:type
  themeColor?: string;
  twitter?: SEOTwitter;
  openGraph?: SEOOpenGraph;
  jsonLd?: SEOJsonLd;
  children?: React.ReactNode;
}

// --- Context ---
const SEOContext = createContext<SEOSchema | undefined>(undefined);

export const useSEO = () => {
  const ctx = useContext(SEOContext);
  if (!ctx) throw new Error("useSEO must be used within SEOProv");
  return ctx;
};

// --- Provider ---
export const SEOProv: React.FC<{
  children: React.ReactNode;
  schema?: SEOSchema;
}> = ({ schema, children }) => {
  // Only render SEO if schema is provided, otherwise just render children
  if (!schema) {
    return <>{children}</>;
  }
  const {
    title,
    description,
    url,
    image,
    author = "Hypercho",
    robots = "index,follow",
    canonical,
    type = "website",
    themeColor = "#000319", // dark mode default
    twitter = {},
    openGraph = {},
    jsonLd = {},
  } = schema;

  // Merge Open Graph defaults
  const og = {
    type,
    title,
    description,
    url,
    image,
    ...openGraph,
  };

  // Merge Twitter defaults
  const tw = {
    card: "summary_large_image",
    creator: author,
    title,
    description,
    image,
    ...twitter,
  };

  // Merge JSON-LD defaults
  const structuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url,
      description,
      image,
      author: author ? { "@type": "Person", name: author } : undefined,
      ...jsonLd,
    }),
    [title, url, description, image, author, jsonLd]
  );

  return (
    <SEOContext.Provider value={schema}>
      <Head>
        {/* Basic Meta Tags */}
        <title>{title}</title>
        <meta name="description" content={description} />
        {author && <meta name="author" content={author} />}
        {/* Note: viewport meta tag is handled automatically by Next.js */}
        <meta name="robots" content={robots} />
        <meta name="theme-color" content={themeColor} />
        <link rel="icon" href="https://hypercho.com/favicon.ico" />
        {/* Canonical */}
        <link rel="canonical" href={canonical || url} />
        {/* Open Graph */}
        <meta property="og:type" content={og.type} />
        <meta property="og:title" content={og.title} />
        <meta property="og:description" content={og.description} />
        <meta property="og:image" content={og.image} />
        <meta property="og:url" content={og.url} />
        {og.site_name && (
          <meta property="og:site_name" content={og.site_name} />
        )}
        {og.locale && <meta property="og:locale" content={og.locale} />}
        {/* Twitter Card */}
        <meta name="twitter:card" content={tw.card} />
        {tw.site && <meta name="twitter:site" content={tw.site} />}
        {tw.creator && <meta name="twitter:creator" content={tw.creator} />}
        <meta name="twitter:title" content={tw.title} />
        <meta name="twitter:description" content={tw.description} />
        <meta name="twitter:image" content={tw.image} />
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </Head>
      {children}
    </SEOContext.Provider>
  );
};

export default SEOProv;
