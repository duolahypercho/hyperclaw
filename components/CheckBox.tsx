import React from "react";
import { AiOutlineCheck } from "react-icons/ai";

export const CheckBox = ({value,setValue,hoverTitle,text}:{value:boolean;setValue:React.Dispatch<React.SetStateAction<boolean>>,hoverTitle:string,text:string}) => {
    return (
        <div className="settingButton" data-title={hoverTitle} onClick={()=>{setValue(!value)}}>
            <span>{text}</span>
            <div className= "customeCheckBox">
                <input className={`${value&&"checkBoxActive"}`} checked={value} onChange={(e)=>setValue(e.target.checked)} type="checkbox" />
                {value&&<AiOutlineCheck className="checks" size={"1.2rem"} fontWeight={'bold'}/>}
            </div>
        </div>
    );
};