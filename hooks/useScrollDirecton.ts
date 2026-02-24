import { useState, useEffect, useRef } from "react";

export const useScrollDirection = () => {
  const lastScrolled = useRef<number>(0); // last scrolled to position by user
  const [scrolledUp, setScrolledUp] = useState<boolean>(false);
  const scrolledUpRef = useRef<boolean>(false);
  const BodyRef = useRef<HTMLDivElement | null>(null);

  const ManageScrollEvent = (e: any) => {
    const scrolled = e.currentTarget.scrollTop; // Number of pixels the user has scrolled
    /* If the user position is not at 0 : which means its at the top
    and the user previous scroll position is greater than the current one, that means the user is scrolling up
    */
    if (scrolled !== 0 && scrolled < lastScrolled.current) {
      // update scroledUp status and prev scrolled position
      if (!scrolledUpRef.current) {
        //if the prev scrolled up state is the same
        setScrolledUp(true);
        scrolledUpRef.current = true;
      }
      lastScrolled.current = Math.round(~~scrolled);
      return;
    }
    if (scrolledUpRef.current) {
      //if the prev scrolled up state is the same
      setScrolledUp(false);
      scrolledUpRef.current = false;
    }
    lastScrolled.current = Math.round(~~scrolled);
  };
  useEffect(() => {
    BodyRef.current?.parentElement?.parentElement?.parentElement?.addEventListener("scroll", ManageScrollEvent);
    return () => BodyRef.current?.parentElement?.parentElement?.parentElement?.removeEventListener("scroll", ManageScrollEvent);
  }, []);
  return { scrolledUp, BodyRef };
};
