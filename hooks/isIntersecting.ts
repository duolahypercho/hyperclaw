import { RefObject, useEffect, useState } from "react";
type Ref = HTMLHRElement | HTMLElement | HTMLDivElement | null;

export const useIsIntersecting = (ref: RefObject<Ref>) => {
  const [isIntersecting, setIsIntersecting] = useState<boolean>(false);
  const [isIntersectingRatio, setIsIntersectingRatio] = useState<number>(0);

  const interSectionOptions = {
    root: null,
    rootMargin: "0px",
    threshold: 1.0,
  };

  const callbackFunction = (entries: IntersectionObserverEntry[]) => {
    //work only on bigger screens
    const [entry] = entries;
    setIsIntersecting(entry.isIntersecting);
    setIsIntersectingRatio(entry.intersectionRatio);
  };

  useEffect(() => {
    const lastCategory = ref.current;
    const observer = new IntersectionObserver(callbackFunction, interSectionOptions);

    if (lastCategory) observer.observe(lastCategory);

    return () => {
      if (lastCategory) observer.unobserve(lastCategory);
    };
  }, []);

  return {
    isIntersecting,
    isIntersectingRatio,
  };
};
