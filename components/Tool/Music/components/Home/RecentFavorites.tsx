import React from "react";
import Image from "next/image";

const favorites = [
  {
    title: "Alone With You",
    artist: "Alina Baraz",
    cover:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=80&w=300",
  },
  {
    title: "Hopeless",
    artist: "Always Never",
    cover:
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=300",
  },
  {
    title: "Za karę",
    artist: "SB Maffija",
    cover:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300",
  },
  {
    title: "No Limit",
    artist: "G-Eazy",
    cover:
      "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&q=80&w=300",
  },
  {
    title: "Candy",
    artist: "Machine Gun Kelly",
    cover:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&q=80&w=300",
  },
  {
    title: "Fade Away",
    artist: "Always Never",
    cover:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=80&w=300",
  },
];

export function RecentFavorites() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {favorites.map((item) => (
        <div key={item.title} className="group cursor-pointer">
          <div className="relative aspect-square mb-3">
            <Image
              src={item.cover}
              alt={`${item.title} cover`}
              fill
              className="w-full h-full object-cover rounded-lg"
              sizes="(max-width: 1024px) 33vw, 16vw"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
          </div>
          <h3 className="font-medium truncate">{item.title}</h3>
          <p className="text-sm text-gray-400 truncate">{item.artist}</p>
        </div>
      ))}
    </div>
  );
}
