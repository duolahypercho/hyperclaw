import { GetServerSideProps } from "next";
import { SITE_URL } from "../lib/site-url";

const Sitemap = () => {
  return null;
};

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const baseUrl = SITE_URL;

  const staticPages = [
    "",
    "/Tool/TodoList",
    "/Tool/PromptLibrary",
    "/Tool/Music",
    "/Tool/X",
    "/Tool/Aurum",
    "/Settings",
    "/auth/signin",
    "/auth/signup",
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${staticPages
        .map((url) => {
          const priority =
            url === "" ? "1.0" : url.startsWith("/Tool/") ? "0.9" : "0.8";
          const changefreq =
            url === ""
              ? "daily"
              : url.startsWith("/Tool/")
              ? "weekly"
              : "monthly";

          return `
            <url>
              <loc>${baseUrl}${url}</loc>
              <lastmod>${new Date().toISOString()}</lastmod>
              <changefreq>${changefreq}</changefreq>
              <priority>${priority}</priority>
            </url>
          `;
        })
        .join("")}
    </urlset>
  `;

  res.setHeader("Content-Type", "text/xml");
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
};

export default Sitemap;
