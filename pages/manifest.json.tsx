import { GetServerSideProps } from "next";
import { SITE_URL } from "../lib/site-url";

const Manifest = () => {
  return null;
};

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const manifest = {
    name: "Hypercho Hyperclaw OS",
    short_name: "Hyperclaw",
    description:
      "AI-first interactive operating system for modern productivity",
    start_url: "/",
    display: "standalone",
    background_color: "#0F172A",
    theme_color: "#3B82F6",
    orientation: "portrait-primary",
    scope: "/",
    lang: "en",
    categories: ["productivity", "utilities", "business"],
    icons: [
      {
        src: "/favicon-16x16.ico",
        sizes: "16x16",
        type: "image/ico",
      },
      {
        src: "/favicon-32x32.ico",
        sizes: "32x32",
        type: "image/ico",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/Logopic.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
    screenshots: [
      {
        src: "/hypercho_banner.png",
        sizes: "1200x630",
        type: "image/png",
        form_factor: "wide",
        label: "Hyperclaw OS Dashboard",
      },
    ],
    shortcuts: [
      {
        name: "Music",
        short_name: "Music",
        description: "Play and manage your music collection",
        url: "/Tool/Music",
        icons: [{ src: "/favicon-32x32.png", sizes: "32x32" }],
      },
    ],
    related_applications: [
      {
        platform: "webapp",
        url: `${SITE_URL}/manifest.json`,
      },
    ],
    prefer_related_applications: false,
  };

  res.setHeader("Content-Type", "application/json");
  res.write(JSON.stringify(manifest, null, 2));
  res.end();

  return {
    props: {},
  };
};

export default Manifest;
