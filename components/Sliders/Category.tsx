import React, { useRef, useState, useEffect, Dispatch, SetStateAction, memo } from "react";
import { MdKeyboardArrowLeft, MdKeyboardArrowRight } from "react-icons/md";
export interface categoryProps {
  categoryData: {
    category: string[];
    active: string;
  };
  setCategoryData: Dispatch<SetStateAction<{ category: string[]; active: string }>>;
  keyName?: string;
  hidecontrol?: boolean;
}
export interface categoryStateType {
  category: string[];
  active: string;
}

//min screen size for slider to start working
const MIN_SCREEN_SIZE: number = 481;
//options to use for intersection observer
const interSectionOptions = {
  root: null,
  rootMargin: "0px",
  threshold: 1.0,
};
/* main component */
const Category = ({ categoryData, setCategoryData, keyName, hidecontrol }: categoryProps) => {
  const ContainerRef = useRef<HTMLUListElement>(null);
  const prevBtn = useRef<HTMLButtonElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const [slideSize, setslideSize] = useState<number>(0);
  const [nextSlide, setNextSlide] = useState<boolean>(false);
  const [prevSlide, setPrevSlide] = useState<boolean>(false);
  const [windowSize, setWindowSize] = useState<number>(0);

  //intersection callBack for First ele
  const callbackFunction_ForFirst = (entries: IntersectionObserverEntry[]) => {
    //work only on bigger screens
    if (windowSize > MIN_SCREEN_SIZE) {
      const [entry] = entries;
      setPrevSlide(entry.isIntersecting);
    }
  };
  //intersection callBack for last ele
  const callbackFunction_ForLast = (entries: IntersectionObserverEntry[]) => {
    //work only on bigger screens
    if (windowSize > MIN_SCREEN_SIZE) {
      const [entry] = entries;
      setNextSlide(entry.isIntersecting);
    }
  };

  const PREV = () => {
    //function to scroll backward
    ContainerRef.current?.scrollBy({
      left: -slideSize,
      behavior: "smooth",
    });
  };

  const NEXT = () => {
    //function to scroll forward
    ContainerRef.current?.scrollBy({
      left: slideSize,
      behavior: "smooth",
    });
  };

  /* useEffect to reset the slider size and the screen size onload and onresize */
  useEffect(() => {
    const changeSize = (windowWidth: number): void => {
      setWindowSize(windowWidth);
      const containerWidth = ContainerRef.current?.offsetWidth;
      //set slide size
      setslideSize(containerWidth!);
      //take the slider to its initial position
      ContainerRef.current?.scrollTo(0, 0);
    };

    changeSize(window.innerWidth);
    const handleResize = () => changeSize(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /*use Effect to handle intersection events */
  useEffect(() => {
    const firstCategory: any = ContainerRef.current?.children[1];
    const lastCategory: any = ContainerRef.current?.lastElementChild;
    const observer_ForFirst = new IntersectionObserver(callbackFunction_ForFirst, interSectionOptions);
    const observer_ForLast = new IntersectionObserver(callbackFunction_ForLast, interSectionOptions);

    if (firstCategory) observer_ForFirst.observe(firstCategory);
    if (lastCategory) observer_ForLast.observe(lastCategory);

    return () => {
      if (firstCategory) observer_ForFirst.unobserve(firstCategory);
      if (lastCategory) observer_ForLast.unobserve(lastCategory);
    };
  }, [ContainerRef, windowSize]);

  /* JSX to control the category */
  const CategoryController = (newCategory: string) => {
    setCategoryData({ ...categoryData, active: newCategory });
  };
  // check if the first and the last categories are on the screen
  const bothAreVisible: boolean = nextSlide && prevSlide;
  const ControlBox = !bothAreVisible && (
    <>
      <div className="controller">
        <button disabled={prevSlide} ref={prevBtn} onClick={PREV}>
          <MdKeyboardArrowLeft className="icon" />
        </button>
        <button disabled={nextSlide} ref={nextBtn} onClick={NEXT}>
          <MdKeyboardArrowRight className="icon" />
        </button>
      </div>
    </>
  );

  /* main list of Categories */
  return (
    <div className="Slider">
      <ul className="categoryChild" ref={ContainerRef}>
        {categoryData.category.map((ele, i) => {
          const active = categoryData.active == ele;
          return (
            <li
              key={`${keyName || `category`}__${ele}__${i}`}
              className={`children ${active && `active`}`}
              onClick={() => CategoryController(ele)}
            >
              <p>{ele}</p>
            </li>
          );
        })}
      </ul>
      {hidecontrol || ControlBox}
    </div>
  );
};

export default memo(Category);
