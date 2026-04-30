import { useInterim } from "../../Providers/InterimProv";
import { memo,Dispatch, SetStateAction, useState, FormEvent } from "react";
import Router from "next/router";
import { BiArrowBack, BiMenu, BiSearch } from "react-icons/bi";
import { MdClose } from "react-icons/md";

type SearchFieldPropsType = {
    setShowSearch: Dispatch<SetStateAction<boolean>>;
    showSearch: boolean;
}
const SearchField = ({showSearch, setShowSearch}: SearchFieldPropsType) => {
  const { mobileScreen } = useInterim();
  const [searchValue, setSearchValue] = useState<string>("");

  //submit the search value
  const handleSubmit = (e: FormEvent<EventTarget>) => {
    e.preventDefault();
    if (searchValue) {
      Router.push(`/Search?value=${searchValue}`);
    }
  };

  if (!showSearch && mobileScreen) return <></>;
  return (
    <form
      className="center"
      onSubmit={handleSubmit}
    >
      {mobileScreen ? (
        <button
          className="back"
          onClick={() => setShowSearch(false)}
        >
          <BiArrowBack />
        </button>
      ) : null}
      <div className="searchCont">
        <input
          type="text"
          name="searchField"
          className="searchField"
          placeholder="Search..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          autoComplete="off"
        />
        {searchValue && (
          <button
            className=""
            onClick={() => setSearchValue("")}
          >
            <MdClose />
          </button>
        )}
      </div>
      <button
        type="submit"
        className="submit"
        disabled={searchValue == ""}
      >
        <BiSearch />
      </button>
    </form>
  );
};

export default memo(SearchField);
