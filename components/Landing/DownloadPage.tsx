"use client";

import React from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {getMediaUrl} from "$/utils";

const DownloadPage = () => {
  const downloadLinks = {
    windows: getMediaUrl("file/Copanion-0.1.0-win.exe"), // Replace with actual download link
    mac: getMediaUrl("file/Copanion-0.1.0-mac.dmg"), // Prefer .dmg to avoid macOS "damaged" warning from .zip
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Main Content */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-20">
            {/* Left Section - Marketing Copy and Download Buttons */}
            <div className="lg:w-[35%] flex flex-col justify-end">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
              >
                <h1 className="text-3xl md:text-4xl font-semibold text-foreground leading-tight tracking-tight">
                  Download the Copanion desktop app for an immersive experience
                </h1>
                <p className="text-base font-medium text-muted-foreground leading-relaxed">
                  Talk to copanion all the time. Get things done faster.
                </p>

                {/* Download Buttons - Notion Style (Black) */}
                <div className="flex flex-col gap-3 pt-4">
                  <Button
                    onClick={() => {
                      window.open(downloadLinks.windows, "_blank");
                    }}
                    className="w-full sm:w-auto px-6 py-3.5 bg-primary text-primary-foreground border border-solid border-border rounded-none font-medium text-base hover:bg-primary/80 transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3">
                      <Image
                        src="/asset/windows.svg"
                        alt="Windows"
                        width={20}
                        height={20}
                        className="w-5 h-5 brightness-0 invert"
                      />
                      <span>Download for Windows</span>
                    </div>
                    <ArrowRight
                      size={16}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </Button>

                  <Button
                    onClick={() => {
                      window.open(downloadLinks.mac, "_blank");
                    }}
                    className="w-full sm:w-auto px-6 py-3.5 bg-primary text-primary-foreground border border-solid border-border rounded-none font-medium text-base hover:bg-primary/80 transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3">
                      <Image
                        src="/asset/apple-13.svg"
                        alt="Apple"
                        width={20}
                        height={20}
                        className="w-5 h-5 brightness-0 invert"
                      />
                      <span>Download for Mac</span>
                    </div>
                    <ArrowRight
                      size={16}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Mac: If macOS says the app is &quot;damaged&quot; or from an unidentified developer, right‑click the app → <strong>Open</strong> (first time only).
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Right Section - Desktop App Screenshot with Windows Frame */}
            <div className="lg:w-[65%] flex justify-center lg:justify-end">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="w-full max-w-6xl"
              >
                {/* Windows Window Frame - Notion Style */}
                <div className="bg-background rounded-md border-1 border-solid border-primary/10 shadow-2xl overflow-hidden">
                  {/* Image Container with Border */}
                    <Image
                      src="/asset/download.png"
                      alt="Copanion Desktop App Screenshot"
                      width={1216}
                      height={616}
                      className="w-full h-auto object-contain"
                      priority
                    />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DownloadPage;
