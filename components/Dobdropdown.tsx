import { memo, SetStateAction, useRef, useState, useEffect } from "react";
import React from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type MonthContentType = {
  monthTitle: string;
  monthValue: string;
};

const MonthArray: MonthContentType[] = [
  {
    monthTitle: "January",
    monthValue: "01",
  },
  {
    monthTitle: "February",
    monthValue: "02",
  },
  {
    monthTitle: "March",
    monthValue: "03",
  },
  {
    monthTitle: "April",
    monthValue: "04",
  },
  {
    monthTitle: "May",
    monthValue: "05",
  },
  {
    monthTitle: "June",
    monthValue: "06",
  },
  {
    monthTitle: "July",
    monthValue: "07",
  },
  {
    monthTitle: "August",
    monthValue: "08",
  },
  {
    monthTitle: "September",
    monthValue: "09",
  },
  {
    monthTitle: "October",
    monthValue: "10",
  },
  {
    monthTitle: "November",
    monthValue: "11",
  },
  {
    monthTitle: "December",
    monthValue: "12",
  },
];

const DropdownLinkMonths = ({
  MonthArray,
  setshow,
  setMonth,
  monthInput,
  setMonthInput,
  curmonth,
  setMonthNum,
  monthNum,
}: {
  MonthArray: MonthContentType[];
  setshow: React.Dispatch<React.SetStateAction<boolean>>;
  setMonth: React.Dispatch<SetStateAction<string>>;
  monthInput: string;
  setMonthInput: React.Dispatch<SetStateAction<string>>;
  curmonth: string;
  setMonthNum: React.Dispatch<SetStateAction<string>>;
  monthNum: string;
}) => {
  return (
    <>
      {MonthArray.map(({ monthTitle, monthValue }) => {
        const isVisible =
          monthInput === "" ||
          monthTitle.toLowerCase().includes(monthInput.toLowerCase()) ||
          monthValue.toString().includes(monthInput);

        if (!isVisible) return null;

        return (
          <motion.div
            key={`month${monthValue}`}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            className={`px-3 py-2 text-sm cursor-pointer rounded-md transition-colors duration-150 ${
              curmonth === monthTitle
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"
            }`}
            onClick={() => {
              setMonth(monthTitle);
              setMonthNum(monthValue.toString());
              setMonthInput("");
              setshow(false);
            }}
          >
            {monthTitle}
          </motion.div>
        );
      })}
    </>
  );
};
const DropdownLinkDays = ({
  DayArray,
  setshow,
  setDay,
  dayInput,
  setDayInput,
  curday,
}: {
  DayArray: string[];
  setshow: React.Dispatch<React.SetStateAction<boolean>>;
  setDay: React.Dispatch<SetStateAction<string>>;
  dayInput: string;
  setDayInput: React.Dispatch<SetStateAction<string>>;
  curday: string;
}) => {
  return (
    <>
      {DayArray.map((day) => {
        const isVisible =
          dayInput === "" ||
          day.includes(dayInput) ||
          day.toString().includes(dayInput);

        if (!isVisible) return null;

        return (
          <motion.div
            key={`day${day}`}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            className={`px-3 py-2 text-sm text-center cursor-pointer rounded-md transition-colors duration-150 ${
              curday === day
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"
            }`}
            onClick={() => {
              setDay(day);
              setDayInput("");
              setshow(false);
            }}
          >
            {day}
          </motion.div>
        );
      })}
    </>
  );
};
const DropdownLinkYears = ({
  YearArray,
  setshow,
  setYear,
  yearInput,
  setYearInput,
  curyear,
}: {
  YearArray: string[];
  setshow: React.Dispatch<React.SetStateAction<boolean>>;
  setYear: React.Dispatch<SetStateAction<string>>;
  yearInput: string;
  setYearInput: React.Dispatch<SetStateAction<string>>;
  curyear: string;
}) => {
  return (
    <>
      {YearArray.map((year) => {
        const isVisible =
          yearInput === "" ||
          year.includes(yearInput) ||
          year.toString().includes(yearInput);

        if (!isVisible) return null;

        return (
          <motion.div
            key={`year${year}`}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            className={`px-3 py-2 text-sm cursor-pointer rounded-md transition-colors duration-150 ${
              curyear === year
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"
            }`}
            onClick={() => {
              setYear(year);
              setYearInput("");
              setshow(false);
            }}
          >
            {year}
          </motion.div>
        );
      })}
    </>
  );
};
const Dobdropdown = ({
  name,
  setdob,
  dob,
}: {
  name: string;
  setdob: React.Dispatch<SetStateAction<string>>;
  dob: string;
}) => {
  const [month, setMonth] = useState<string>("Month");
  const [monthNum, setMonthNum] = useState<string>(
    dob.split("-")[1] == null || dob.split("-")[1] == ""
      ? "Month"
      : dob.split("-")[1]
  );
  const [day, setDay] = useState<string>(
    dob.split("-")[2] == null || dob.split("-")[2] == ""
      ? "Day"
      : dob.split("-")[2]
  );
  const [year, setYear] = useState<string>(
    dob.split("-")[0] == null || dob.split("-")[0] == ""
      ? "Year"
      : dob.split("-")[0]
  );
  const [monthShow, setMonthShow] = useState<boolean>(false); // dropdown states
  const [dayShow, setDayShow] = useState<boolean>(false); // dropdown states
  const [yearShow, setYearShow] = useState<boolean>(false); // dropdown states
  const [inputMonth, setInputMonth] = useState<string>("");
  const [inputDay, setInputDay] = useState<string>("");
  const [inputYear, setInputYear] = useState<string>("");

  const monthRef = useRef<HTMLDivElement>(null);
  const monthinputRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLDivElement>(null);

  const yearRef = useRef<HTMLDivElement>(null);

  const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
  const years = Array.from({ length: 105 }, (_, i) => (1920 + i).toString());

  useEffect(() => {
    MonthArray.map(({ monthTitle, monthValue }) => {
      if (monthValue === monthNum) {
        setMonth(monthTitle);
      }
    });
  }, [monthNum]);

  //Close month dropdown bar if user click outside the month dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (monthRef.current && !monthRef.current.contains(e.target as Node)) {
        setMonthShow(false);
        setInputMonth("");
      }
    };
    if (monthShow) {
      document.addEventListener("click", handleClick);
    } else {
      let found = false;
      MonthArray.map(({ monthTitle, monthValue }) => {
        if (
          !found &&
          inputMonth != "" &&
          (monthTitle.toLowerCase().includes(inputMonth.toLocaleLowerCase()) ||
            monthValue.includes(inputMonth))
        ) {
          setMonth(monthTitle);
          setMonthNum(monthValue.toString());
          found = true;
        }
      });
      setInputMonth("");
      return () => {
        document.removeEventListener("click", handleClick);
      };
    }
  }, [monthShow]);

  //Close day dropdown bar if user click outside the day dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dayRef.current && !dayRef.current.contains(e.target as Node)) {
        setDayShow(false);
        setInputDay("");
      }
    };
    if (dayShow) document.addEventListener("click", handleClick);
    else {
      days.map((dayTemp) => {
        if (inputDay === dayTemp) {
          setDay(dayTemp);
          setInputDay("");
        }
      });
      return () => {
        document.removeEventListener("click", handleClick);
      };
    }
  }, [dayShow]);

  //Close year dropdown bar if user click outside the year dropdown

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (yearRef.current && !yearRef.current.contains(e.target as Node)) {
        setYearShow(false);
        setInputYear("");
      }
    };
    if (yearShow) document.addEventListener("click", handleClick);
    else {
      years.map((yearsTemp) => {
        if (yearsTemp.includes(inputYear) && inputYear != "") {
          setYear(yearsTemp);
          setInputYear("");
        }
      });
      return () => {
        document.removeEventListener("click", handleClick);
      };
    }
  }, [yearShow]);

  //Year-Month-day
  useEffect(() => {
    if (year != "Year" && monthNum != "Month" && day != "Day")
      setdob(year + "-" + monthNum + "-" + day);
  }, [year, month, day]);

  useEffect(() => {
    if (inputMonth != "") {
      setMonthShow(true);
    } else if (inputDay != "") {
      setDayShow(true);
    } else if (inputYear != "") {
      setYearShow(true);
    }
  }, [inputMonth, inputDay, inputYear]);

  return (
    <div className="grid grid-cols-3 gap-2 h-full">
      {/* Month Dropdown */}
      <div className="relative h-full" ref={monthRef}>
        <div
          className="relative cursor-pointer"
          onClick={() => setMonthShow(!monthShow)}
        >
          <input
            className={`w-full h-12 px-3 py-2 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground focus:placeholder:text-transparent transition-colors duration-200 ${
              month !== "Month" ? "text-foreground" : "text-muted-foreground"
            }`}
            placeholder={month}
            value={inputMonth}
            onChange={(e) => {
              setInputMonth(e.target.value);
            }}
            onBlur={() => {
              setTimeout(() => {
                if (!monthRef.current?.contains(document.activeElement)) {
                  setMonthShow(false);
                }
              }, 150);
            }}
            maxLength={9}
            ref={monthinputRef}
          />
          <ChevronDown
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              monthShow ? "rotate-180" : ""
            }`}
          />
        </div>

        <AnimatePresence>
          {monthShow && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute w-60 md:w-auto top-full left-0 right-0 mt-2 bg-popover border border-solid border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto customScrollbar2"
            >
              <div className="p-2 space-y-1">
                <AnimatePresence>
                  <DropdownLinkMonths
                    MonthArray={MonthArray}
                    setshow={setMonthShow}
                    setMonth={setMonth}
                    monthInput={inputMonth}
                    setMonthInput={setInputMonth}
                    curmonth={month}
                    setMonthNum={setMonthNum}
                    monthNum={monthNum}
                  />
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Day Dropdown */}
      <div className="relative h-full" ref={dayRef}>
        <div
          className="relative cursor-pointer"
          onClick={() => setDayShow(!dayShow)}
        >
          <input
            className={`w-full h-12 px-3 py-2 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground focus:placeholder:text-transparent transition-colors duration-200 ${
              day !== "Day" ? "text-foreground" : "text-muted-foreground"
            }`}
            placeholder={day}
            value={inputDay}
            onChange={(e) => {
              setInputDay(e.target.value);
            }}
            onBlur={() => {
              setTimeout(() => {
                if (!dayRef.current?.contains(document.activeElement)) {
                  setDayShow(false);
                }
              }, 150);
            }}
            maxLength={2}
          />
          <ChevronDown
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              dayShow ? "rotate-180" : ""
            }`}
          />
        </div>

        <AnimatePresence>
          {dayShow && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute w-60 md:w-auto top-full -left-[100%] -translate-x-1/2 mt-2 bg-popover border border-solid border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto customScrollbar2"
            >
              <div className="p-2 grid grid-cols-4 gap-1">
                <AnimatePresence>
                  <DropdownLinkDays
                    DayArray={days}
                    setshow={setDayShow}
                    setDay={setDay}
                    dayInput={inputDay}
                    setDayInput={setInputDay}
                    curday={day}
                  />
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Year Dropdown */}
      <div className="relative h-full" ref={yearRef}>
        <div
          className="relative cursor-pointer"
          onClick={() => setYearShow(!yearShow)}
        >
          <input
            className={`w-full h-12 px-3 py-2 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground focus:placeholder:text-transparent transition-colors duration-200 ${
              year !== "Year" ? "text-foreground" : "text-muted-foreground"
            }`}
            placeholder={year}
            value={inputYear}
            onChange={(e) => {
              setInputYear(e.target.value);
            }}
            onBlur={() => {
              setTimeout(() => {
                if (!yearRef.current?.contains(document.activeElement)) {
                  setYearShow(false);
                }
              }, 150);
            }}
            maxLength={4}
          />
          <ChevronDown
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              yearShow ? "rotate-180" : ""
            }`}
          />
        </div>

        <AnimatePresence>
          {yearShow && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute w-60 md:w-auto top-full right-1 -translate-x-1/2 mt-2 bg-popover border border-solid border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto customScrollbar2"
            >
              <div className="p-2 grid grid-cols-3 gap-1">
                <AnimatePresence>
                  <DropdownLinkYears
                    YearArray={years}
                    setshow={setYearShow}
                    setYear={setYear}
                    yearInput={inputYear}
                    setYearInput={setInputYear}
                    curyear={year}
                  />
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default memo(Dobdropdown);
