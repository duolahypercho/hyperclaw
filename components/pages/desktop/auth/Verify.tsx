import React from "react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { OtpInput } from "./";
import { sendVerify, verifyOTP } from "../../../../services/user";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, RefreshCw, Edit3 } from "lucide-react";

interface Response {
  status: number;
  message: string;
}

type resultType = {
  status: boolean;
  rCode: number;
  loading: boolean;
};
interface verifyType {
  setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>;
  CurrentStepIndex: number;
  setResult: React.Dispatch<React.SetStateAction<resultType>>;
  result: resultType;
  internalError: boolean;
  email: string;
  setDone: React.Dispatch<React.SetStateAction<boolean>>;
  error: boolean;
  setError: React.Dispatch<React.SetStateAction<boolean>>;
  errorMessage: string;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
}

const Verify = (props: verifyType) => {
  // const { status, data } = useSession();
  const customEmail: string =
    props.email.length > 25
      ? `${props.email.substring(0, 25)}...`
      : props.email;
  const router = useRouter();
  const [otpError, setotpError] = useState<string>(""); //for possible mail error
  const [otpSent, setotpSent] = useState<boolean>(false); //useState for checking if otp was sent ot not
  const [loading, setLoading] = useState<boolean>(false); //useState for loadingstate
  const [verifying, setVerifying] = useState<boolean>(false); // to start the verifying of otp process
  const [numInputs, setNumInputs] = useState<string>("");
  const [passed, setPassed] = useState<boolean>(false); //useState for checking of the user passed the auth
  const [isPartComplete, setIsPartComplete] = useState<boolean>(false);
  const resendTimeoutRef = useRef<number | null>(null);
  const resendIntervalRef = useRef<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const onChange = (value: string) => {
    setNumInputs(value);
  };
  useEffect(() => {
    return () => {
      if (resendTimeoutRef.current) {
        clearTimeout(resendTimeoutRef.current);
      }
      if (resendIntervalRef.current) {
        clearInterval(resendIntervalRef.current);
      }
    };
  }, []);
  useEffect(() => {
    const isEmpty = (input: string) => {
      const trimEle = input.trim();
      if (!trimEle || trimEle === "") return true;
      return false;
    };
    const isFull = (input: string) => {
      const trimElem = input.trim();
      if (trimElem.length === 6) return true;
      return false;
    };
    if (isEmpty(numInputs) || !isFull(numInputs)) {
      setIsPartComplete(false);
    } else {
      setIsPartComplete(true);
    }
  }, [numInputs]);
  const resend = async () => {
    //function to resend otp
    setLoading(true);
    try {
      const resMain: any = await sendVerify(props.email);
      const res: Response = resMain.data;

      //function to control what happens after otp is sent
      setLoading(false);
      if (resMain.status === 200) {
        //create an error message of there is an error
        setotpSent(true);
        setotpError("");
        // hide the resend button for 60 seconds, then show it again
        if (resendTimeoutRef.current) {
          clearTimeout(resendTimeoutRef.current);
        }
        resendTimeoutRef.current = window.setTimeout(() => {
          setotpSent(false);
          setCooldownSeconds(0);
          if (resendIntervalRef.current) {
            clearInterval(resendIntervalRef.current);
            resendIntervalRef.current = null;
          }
          resendTimeoutRef.current = null;
        }, 60000);

        // start countdown timer
        setCooldownSeconds(60);
        if (resendIntervalRef.current) {
          clearInterval(resendIntervalRef.current);
        }
        resendIntervalRef.current = window.setInterval(() => {
          setCooldownSeconds((prev) => {
            if (prev <= 1) {
              if (resendIntervalRef.current) {
                clearInterval(resendIntervalRef.current);
                resendIntervalRef.current = null;
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        //hide the resend otp button for 60secs
        setotpError(res.message);
      }
    } catch (error: any) {
      //create an error message of there is an error
      setLoading(false);
      setotpError(error.message);
    }
  };

  const checkOTP = async (otp: number) => {
    setVerifying(true);
    try {
      const res = await verifyOTP(props.email, otp);
      const data: Response = await res.data;
      setVerifying(false);
      if (data.status === 200) {
        //redirect back to login
        props.setDone(true);
        setPassed(true);
      } else {
        setotpError(data.message);
        props.setError(true);
        props.setErrorMessage(data.message);
      }
    } catch (e: any) {
      setVerifying(false);
      props.setError(true);
      props.setErrorMessage(e.message);
    }
  };
  return (
    <div className="space-y-6">
      {/* Email Info */}
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Please enter the OTP sent to
        </p>
        <p className="font-medium text-foreground break-all">{props.email}</p>
        <button
          type="button"
          onClick={() => {
            props.setCurrentStepIndex(props.CurrentStepIndex - 1);
          }}
          className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors duration-200 font-medium"
        >
          <Edit3 size={14} />
          Edit email
        </button>
      </div>

      {/* OTP Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          checkOTP(~~numInputs);
        }}
        className="space-y-6"
      >
        {/* OTP Input */}
        <div className="space-y-4">
          <OtpInput
            value={numInputs}
            valueLength={6}
            onChange={onChange}
            setotpError={setotpError}
            otpError={otpError}
          />

          <AnimatePresence>
            {otpError && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-xs text-destructive text-center"
              >
                {otpError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Verify Button */}
        <Button
          type="submit"
          disabled={!isPartComplete || verifying || passed}
          className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <AnimatePresence mode="wait">
            {passed ? (
              <motion.div
                key="redirecting"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Setting up your hyperclaw...
              </motion.div>
            ) : verifying ? (
              <motion.div
                key="verifying"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </motion.div>
            ) : (
              <motion.div
                key="verify"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2"
              >
                Verify OTP
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </form>

      {/* Help Section */}
      <div className="text-center space-y-4 mt-2 border-t border-border/50">
        <p className="text-xs text-muted-foreground">
          Didn&apos;t see your OTP? Check your spam folder
        </p>

        {/* Resend OTP */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Hyperclaw is sending OTP...
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {otpSent ? (
                <motion.div
                  key="sent"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="text-xs text-green-600 font-medium space-y-1"
                >
                  <div>OTP sent to {customEmail}</div>
                  {cooldownSeconds > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      Resend available in{" "}
                      {String(Math.floor(cooldownSeconds / 60)).padStart(
                        2,
                        "0"
                      )}
                      :{String(cooldownSeconds % 60).padStart(2, "0")}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="resend"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <button
                    type="button"
                    onClick={resend}
                    className="inline-flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors duration-200 font-medium"
                  >
                    <RefreshCw size={14} />
                    Request new OTP
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};
export default Verify;
