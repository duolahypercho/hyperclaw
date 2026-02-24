import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react"; // Add these imports
import Image from "next/image";
import { getMediaUrl } from "../../../../../utils";

interface CardsectionsProps {
  cards: {
    _id: string;
    name: string;
    cover: string;
  }[];
  onCardClick: (_id: string) => void;
}

export function Cardsections({ cards, onCardClick }: CardsectionsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;

      // Check if we can scroll left (not at the start)
      setCanScrollLeft(scrollLeft > 0);

      // Check if we can scroll right (not at the end)
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1); // -1 for rounding errors
    }
  };

  useEffect(() => {
    checkScroll();
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 440;
      const newScrollPosition =
        scrollContainerRef.current.scrollLeft +
        (direction === "left" ? -scrollAmount : scrollAmount);

      scrollContainerRef.current.scrollTo({
        left: newScrollPosition,
        behavior: "smooth",
      });

      setCanScrollLeft(newScrollPosition > 0);
      setCanScrollRight(
        newScrollPosition + scrollContainerRef.current.clientWidth <
          scrollContainerRef.current.scrollWidth - 1
      );
    }
  };

  return (
    <div className="relative w-full mx-auto">
      {/* Add fade shadows on edges */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background-default to-transparent z-10  transition-opacity duration-300 select-none ${
          canScrollLeft
            ? "opacity-100 cursor-pointer pointer-events-auto"
            : "opacity-0 cursor-none pointer-events-none"
        }`}
      />
      <div
        className={`absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background-default to-transparent z-10  transition-opacity duration-300 ${
          canScrollRight
            ? "opacity-100 cursor-pointer pointer-events-auto"
            : "opacity-0 cursor-none pointer-events-none"
        }`}
      />
      <div
        ref={scrollContainerRef}
        className="relative flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth"
      >
        {cards.map((card) => (
          <div
            key={card._id}
            onClick={() => onCardClick(card._id)}
            className={`flex-shrink-0 w-[220px] aspect-[4/3] rounded-lg  bg-gradient-to-br cursor-pointer group relative overflow-hidden before:absolute before:inset-0  before:bg-gradient-to-br before:from-white/10 before:to-transparent after:absolute after:inset-0 after:bg-gradient-to-t after:from-black/40 after:to-transparent shadow-lg shadow-black/20 backdrop-blur-sm
  `}
          >
            {card.cover && (
              <Image
                src={getMediaUrl(card.cover)}
                alt={card.name}
                fill
                sizes="220px"
                className="object-cover"
                priority={false}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
            <div className="relative h-full flex flex-col-reverse justify-between z-10">
              <div className="w-full px-4 py-2 bg-transparent backdrop-blur-sm transition-all duration-300 group-hover:bg-black/20">
                <h3 className="text-xs font-semibold text-white drop-shadow-[0_-2px_2px_rgba(0,0,0,0.3)]">
                  {card.name}
                </h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full 
            bg-black/30 text-white hover:bg-black/50 transition-all z-20"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full 
            bg-black/30 text-white hover:bg-black/50 transition-all z-20"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
