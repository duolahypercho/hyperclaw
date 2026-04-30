import { Html, Head, Main, NextScript } from "next/document";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

export default function Document() {
  return (
    <Html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} style={{ background: "transparent" }}>
      <Head>
        {/* Default meta tags that will be overridden by page-specific SEO component */}
        {/* These ensure basic tags are present even if client-side rendering is delayed */}
        {/* Note: viewport meta tag is handled automatically by Next.js and should not be added here */}
        <meta charSet="utf-8" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </Head>
      <body style={{ background: "transparent" }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
