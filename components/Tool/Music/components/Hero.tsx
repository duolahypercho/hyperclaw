import React from "react";
import { PlayCircle, TrendingUp } from "lucide-react";

export function Hero() {
  return (
    <section className="bg-gradient-to-b from-purple-900 to-indigo-900 text-white py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-semibold mb-6">
            Discover Your Next Favorite Track
          </h1>
          <p className="text-xl mb-8 text-purple-200">
            Stream unlimited music and podcasts. Find new artists and create
            your perfect playlist.
          </p>
          <div className="flex gap-4 justify-center">
            <button className="bg-purple-500 hover:bg-purple-600 text-white px-8 py-3 rounded-full flex items-center gap-2 transition">
              <PlayCircle className="w-5 h-5" />
              Start Listening
            </button>
            <button className="border border-purple-400 hover:bg-purple-800 px-8 py-3 rounded-full flex items-center gap-2 transition">
              <TrendingUp className="w-5 h-5" />
              Trending Now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
