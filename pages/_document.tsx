import { Html, Head, Main, NextScript } from "next/document";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

export default function Document() {
  return (
    <Html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <Head>
        {/* Default meta tags that will be overridden by page-specific SEO component */}
        {/* These ensure basic tags are present even if client-side rendering is delayed */}
        {/* Note: viewport meta tag is handled automatically by Next.js and should not be added here */}
        <meta charSet="utf-8" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
