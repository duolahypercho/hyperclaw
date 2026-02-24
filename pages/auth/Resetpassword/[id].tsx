import { NextPage } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, EyeOff, ArrowRight, Loader2, AlertCircle, Home } from "lucide-react";
import { useRouter } from "next/router";
import { getLayout } from "../../../layouts/AuthLayout";
import { verifyReset, resetPassAuth } from "../../../services/user";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
interface Props {
  finalres: {
    status: number;
    message: string;
    userID?: string;
  };
}

const Resetpassword = (props: Props) => {
  const router = useRouter();
  const { message, status, userID } = props.finalres;
  const [passshow, setPassshow] = useState<string>("password"); //useState for password showing and hiding
  const [password, setPassword] = useState(""); //usestate for password
  const [confirmPassword, setConfirmPassword] = useState(""); //usestate for confirm password
  const [match, setMatch] = useState(true); //useState for the status of password matching confirm password
  const [loading, setLoading] = useState<boolean>(false); //useState for loadingstate
  const [pattern, setPattern] = useState<boolean>(true); //Check if password follows the pattern
  const [passError, setPassError] = useState<string>(""); //Error Message for password verfication
  const [isPartComplete, setIsPartComplete] = useState<boolean>(false);

  useEffect(() => {
    const isEmpty = (input: string) => {
      const trimEle = input.trim();
      if (!trimEle || trimEle === "") return true;
      return false;
    };
    if (isEmpty(password) || isEmpty(confirmPassword)) {
      setIsPartComplete(false);
    } else {
      setIsPartComplete(true);
    }
  }, [password, confirmPassword]);

  //function to handle submit
  const handleSubmit = async (e: any) => {
    //function to submit data;

    e.preventDefault(); //prevent reload
    const checkMatch = password === confirmPassword;
    if (checkMatch) {
      const maindata = Object.fromEntries(new FormData(e.target).entries()); // get all data from all enteries
      await changePassword(maindata); //call the signup function
      return;
    }
    setMatch(false);
    //reset input fields to their default
  };

  //function to request for another otp
  const changePassword = async (maindata: any) => {
    //function to resend otp

    setLoading(true);
    const resMain: any = await resetPassAuth(userID, password);
    await resMain.data;
    router.push(`/auth/Login`);
  };

  if (message === "OTP matches") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-background/95 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/10 rounded-full blur-2xl animate-pulse delay-1000" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md mx-auto p-6 relative z-10"
        >
          {/* Logo/Brand */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-center mb-8"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-lg overflow-clip bg-transparent">
              <HyperchoIcon className="h-full w-full" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Reset Password
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Input your new password
            </p>
          </motion.div>

          {/* Form Container */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-card/50 backdrop-blur-xl border border-solid border-border/50 rounded-2xl p-6 shadow-2xl"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Password Field */}
              <div className="space-y-2">
                <Label 
                  htmlFor="password" 
                  className={`text-sm font-medium ${!pattern ? 'text-destructive' : 'text-foreground/70'}`}
                >
                  {!pattern && passError ? `Password - ${passError}` : "Password"}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="Password"
                    type={passshow === "password" ? "password" : "text"}
                    required
                    value={password}
                    className={`h-12 bg-background/50 border-2 pr-12 transition-all duration-200 focus:bg-background ${
                      !pattern 
                        ? 'border-destructive focus:border-destructive' 
                        : 'border-border focus:border-primary hover:border-primary/50'
                    }`}
                    placeholder="Enter your new password"
                    onChange={(e) => setPassword(e.target.value)}
                    pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*_=+\-]).{8,21}$"
                    title="Must be 8 - 21 characters and contain at least one number, one symbol, one uppercase, one lowercase letter and no spaces."
                  />
                  <button
                    type="button"
                    onClick={() => setPassshow(passshow === "password" ? "text" : "password")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200 p-1"
                  >
                    {passshow === "password" ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <Label 
                  htmlFor="confirmPassword" 
                  className={`text-sm font-medium ${!match ? 'text-destructive' : 'text-foreground/70'}`}
                >
                  {!match ? "Confirm Password - Password doesn't match" : "Confirm Password"}
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={passshow === "password" ? "password" : "text"}
                    required
                    value={confirmPassword}
                    className={`h-12 bg-background/50 border-2 transition-all duration-200 focus:bg-background ${
                      !match 
                        ? 'border-destructive focus:border-destructive' 
                        : 'border-border focus:border-primary hover:border-primary/50'
                    }`}
                    placeholder="Confirm your new password"
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onClick={() => setMatch(true)}
                  />
                  <AnimatePresence>
                    {!match && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-xs text-destructive mt-1"
                      >
                        Password doesn&apos;t match
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={!isPartComplete || loading}
                className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex items-center gap-2"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </motion.div>
                  ) : (
                    <motion.div
                      key="submit"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex items-center gap-2"
                    >
                      Submit
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </form>
          </motion.div>
        </motion.div>
      </div>
    );
  }
  
  // Invalid/Expired Link Page
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-background/95 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/10 rounded-full blur-2xl animate-pulse delay-1000" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md mx-auto p-6 relative z-10"
      >
        {/* Logo/Brand */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-lg overflow-clip bg-transparent">
            <HyperchoIcon className="h-full w-full" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Link Invalid
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            This reset link has expired or isn&apos;t valid
          </p>
        </motion.div>

        {/* Error Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl text-center space-y-6"
        >
          {/* Error Icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-20 h-20 mx-auto bg-gradient-to-br from-destructive/20 to-destructive/10 rounded-full flex items-center justify-center mb-6"
          >
            <AlertCircle className="w-10 h-10 text-destructive" />
          </motion.div>

          {/* Action Buttons */}
          <div className="space-y-4">
            <Link href="/" className="block">
              <Button 
                variant="outline" 
                className="w-full h-12 border-2 hover:bg-primary/5 transition-all duration-200 group"
              >
                <Home className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform duration-200" />
                Go back home
              </Button>
            </Link>
            
            <Link href="/auth/Resetpassword" className="block">
              <Button 
                className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 group"
              >
                Request another link
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
Resetpassword.getLayout = getLayout;
export default Resetpassword;

export async function getServerSideProps(context: any) {
  const { id } = context.params;
  try {
    const res = await verifyReset(id);
    const finalres = await res.data;
    return {
      props: { finalres },
    };
  } catch (error) {
    return {
      props: {
        finalres: { status: 404, message: "Link is invalid or has expired" },
      },
    };
  }
}
