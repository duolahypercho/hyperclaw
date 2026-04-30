import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { EyeOff, Eye, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

type resultType = {
  status: boolean;
  rCode: number;
  loading: boolean;
};

interface userInfoType {
  setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>;
  CurrentStepIndex: number;
  setResult: React.Dispatch<React.SetStateAction<resultType>>;
  result: resultType;
  first: string;
  setfirst: React.Dispatch<React.SetStateAction<string>>;
  last: string;
  setlast: React.Dispatch<React.SetStateAction<string>>;
  country: string;
  setcountry: React.Dispatch<React.SetStateAction<string>>;
  dob: string;
  setdob: React.Dispatch<React.SetStateAction<string>>;
  errorMail: boolean;
  setErrorMail: React.Dispatch<React.SetStateAction<boolean>>;
  Email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  setPassword: React.Dispatch<React.SetStateAction<string>>;
  password: string;
  setInternalError: React.Dispatch<React.SetStateAction<boolean>>;
  internalError: boolean;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  error: boolean;
  setError: React.Dispatch<React.SetStateAction<boolean>>;
  errorMessage: string;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
}

const UserInfo = (props: userInfoType) => {
  const [isPartComplete, setIsPartComplete] = useState<boolean>(false);
  const [passshow, setPassshow] = useState<string>("password"); //useState for password showing and hiding
  const [pattern, setPattern] = useState<boolean>(true); //Check if password follows the pattern
  //Year-Month-day
  useEffect(() => {
    const isEmpty = (input: string) => {
      const trimEle = input.trim();
      if (!trimEle || trimEle === "") return true;
      return false;
    };
    if (
      isEmpty(props.dob) ||
      isEmpty(props.country) ||
      isEmpty(props.first) ||
      isEmpty(props.last) ||
      isEmpty(props.Email) ||
      isEmpty(props.password)
    ) {
      setIsPartComplete(false);
    } else {
      setIsPartComplete(true);
    }
  }, [
    props.dob,
    props.country,
    props.first,
    props.last,
    props.Email,
    props.password,
  ]);
  useEffect(() => {
    checkPasswordLegit();
  }, [props.password]);
  const checkEmailExist = async () => {
    props.setResult({ ...props.result, loading: true });
    props.setInternalError(false);
    try {
      if (!props.editMode) {
        await sendOTP();
        props.setEditMode(true);
      }
      if (isPartComplete) props.setCurrentStepIndex(1);
      props.setResult({ ...props.result, loading: false });
    } catch (e: any) {
      console.error(e);
      props.setError(true);
      props.setErrorMessage(e.message);
      props.setResult({ ...props.result, loading: false });
    }
  };
  const checkPasswordLegit = () => {
    const pwd = props.password || "";
    setPattern(pwd.length >= 8);
  };

  const sendOTP = async () => {
    // Hosted email verification is disabled in Community Edition.
  };

  return (
    <div className="space-y-6">
      {/* Name Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label
            htmlFor="firstname"
            className="text-sm font-medium text-foreground/70"
          >
            First name
          </Label>
          <Input
            id="firstname"
            name="Firstname"
            value={props.first}
            type="text"
            required
            className="h-10 bg-background/50 border-2 transition-all duration-200 focus:bg-background border-border focus:border-primary hover:border-primary/50 shadow-sm"
            placeholder="First name"
            onChange={(e) => props.setfirst(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="lastname"
            className="text-sm font-medium text-foreground/70"
          >
            Last name
          </Label>
          <Input
            id="lastname"
            name="Lastname"
            value={props.last}
            type="text"
            required
            className="h-10 bg-background/50 border-2 transition-all duration-200 focus:bg-background border-border focus:border-primary hover:border-primary/50 shadow-sm"
            placeholder="Last name"
            onChange={(e) => props.setlast(e.target.value)}
          />
        </div>
      </div>

      {/* Email Field */}
      <div className="space-y-2">
        <Label
          htmlFor="email"
          className={`text-sm font-medium ${
            props.errorMail ? "text-destructive" : "text-foreground/70"
          }`}
        >
          {props.errorMail
            ? "Email - This mail is already in use by another user"
            : "Email address"}
        </Label>
        <div className="relative">
          <Input
            id="email"
            name="Email"
            type="email"
            required
            value={props.Email}
            className={`h-10 bg-background/50 border-2 transition-all duration-200 focus:bg-background shadow-sm ${
              props.errorMail
                ? "border-destructive focus:border-destructive"
                : "border-border focus:border-primary hover:border-primary/50"
            }`}
            placeholder="example@email.com"
            onClick={() => props.setErrorMail(false)}
            onChange={(e) => props.setEmail(e.target.value)}
          />
          <AnimatePresence>
            {props.errorMail && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-xs text-destructive mt-1"
              >
                This email is already in use
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Password Field */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="password"
            className="text-sm font-medium shadow-sm text-foreground/70"
          >
            Password{" "}
            <span className="text-muted-foreground text-xs font-normal">
              (min 8 characters)
            </span>
          </Label>
          <AnimatePresence>
            {props.password.length > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={`text-xs font-medium ${
                  props.password.length >= 8
                    ? "text-green-600"
                    : "text-muted-foreground"
                }`}
              >
                {props.password.length} characters
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="Password"
            type={passshow}
            required
            value={props.password}
            className={`h-10 bg-background/50 border-2 pr-12 transition-all duration-200 focus:bg-background shadow-sm ${
              props.password.length > 0 && !pattern
                ? "border-destructive focus:border-destructive"
                : "border-border focus:border-primary hover:border-primary/50"
            }`}
            placeholder="Enter your password"
            onChange={(e) => props.setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() =>
              setPassshow(passshow === "password" ? "text" : "password")
            }
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200 p-1"
          >
            {passshow === "password" ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <AnimatePresence>
          {props.password.length > 0 && props.password.length < 8 && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-xs text-muted-foreground"
            >
              {8 - props.password.length} more characters needed
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Submit Button */}
      <Button
        type="button"
        disabled={!isPartComplete || !pattern || props.result.loading}
        onClick={() => {
          checkPasswordLegit();
          checkEmailExist();
        }}
        className="w-full h-10 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <AnimatePresence mode="wait">
          {props.result.loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </motion.div>
          ) : (
            <motion.div
              key="next"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-2"
            >
              Next
            </motion.div>
          )}
        </AnimatePresence>
      </Button>

      {/* Login Link */}
      <div className="text-center !mt-3">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/auth/Login"
            className="text-primary hover:text-primary/80 transition-colors duration-200 font-medium underline"
          >
            Sign in
          </Link>
        </p>
      </div>

      {/* Terms and Privacy */}
      <div className="!mt-3">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          By clicking next, you agree to the{" "}
          <Link
            href="/docs/tos"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary font-medium hover:text-primary/80 transition-colors duration-200"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/docs/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium text-primary hover:text-primary/80 transition-colors duration-200"
          >
            Privacy Policy
          </Link>
          , including{" "}
          <Link
            href="/docs/hypercho-cookie"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium text-primary hover:text-primary/80 transition-colors duration-200"
          >
            Cookie Use
          </Link>
          .
        </p>
      </div>
    </div>
  );
};

export default UserInfo;
