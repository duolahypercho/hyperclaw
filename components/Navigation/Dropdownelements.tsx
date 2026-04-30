import { memo,useEffect } from "react";
import { signOut } from "next-auth/react";
import { MdAccountCircle, MdOutlineAccountCircle, MdCreate, MdSettings, MdOutlineSettings } from "react-icons/md";
import { RiVideoAddLine } from "react-icons/ri";
import { AiOutlineLogout } from "react-icons/ai";
import Link from "next/link";
import { IoMdAddCircleOutline } from "react-icons/io";
import { TbTools } from "react-icons/tb";

interface dropdownElementType {
  show: boolean;
  setshow: React.Dispatch<React.SetStateAction<boolean>>;
  active: string;
}

type dropdownContentType = {
  link: string;
  name: string;
  icon: JSX.Element;
  icon2: JSX.Element;
};

// Icon is outline version, Icon2 is filled version
const DropdownContentValues: dropdownContentType[] = [
  {
    link: "/Settings",
    name: "Settings",
    icon: <MdOutlineSettings className="icon"/>,
    icon2: <MdSettings className="icon"/>,
  },
];

const DropdownLinkElements = ({ Lists, setshow, active}: { Lists: dropdownContentType[],setshow:React.Dispatch<React.SetStateAction<boolean>>, active:string}) => {
  
  return (
    <>
      {Lists.map(({ name, icon, link }) => {
        return (
          <a key={name} href={link} style={{width:"100%", textDecoration:"none"}}>
            <li className={`link ${active===name.toLocaleLowerCase()?"active":""}`} onClick={()=>setshow(false)}>
              {icon}
              <p>{name}</p>
            </li>
          </a>
        );
      })}
    </>
  );
};

const Dropdownelements = ({ show ,setshow, active}: dropdownElementType) => {

  return (
    <div className={`dropdownMenu ${show && "dropdownMenu_open"} dropdownGrid`}>
      <div className="dropdownLinks">
        <DropdownLinkElements Lists={DropdownContentValues} setshow={setshow} active={active}/>
      </div>
      <div className="dropdownLinks" style={{ borderBottom: "none" }}>
        <li className="link" onClick={() => signOut()}>
          <AiOutlineLogout className="icon" />
          <p>Log Out</p>
        </li>
      </div>
    </div>
  );
};

export default Dropdownelements;
