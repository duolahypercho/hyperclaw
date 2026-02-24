import { defaultCountries, usePhoneInput } from "react-international-phone";
import React from "react";
import { HyperchoInput } from ".";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  PhoneOnChange: (phone: string) => void;
}

const PhoneInput: React.FC<InputProps> = ({
  value,
  PhoneOnChange,
  ...restProps
}) => {
  const { inputValue, handlePhoneValueChange, inputRef, country, setCountry } =
    usePhoneInput({
      value,
      countries: defaultCountries,
      onChange: (data) => {
        PhoneOnChange(data.phone);
      },
    });

  return (
    <HyperchoInput
      color="primary"
      placeholder="Phone number"
      value={inputValue}
      onChange={handlePhoneValueChange}
      type="tel"
      ref={inputRef}
      {...restProps}
    />
  );
};

PhoneInput.displayName = "PhoneInput";
export default PhoneInput;
