import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { getSession, signIn } from "next-auth/react";
import { getLayout } from "../../layouts/AuthLayout";
import { UserInfo, Verify } from "../../components/pages/desktop/auth";
import { registerAuth } from "../../services/user";
import Head from "next/head";
import { useInterim } from "../../Providers/InterimProv";
import { motion, AnimatePresence } from "framer-motion";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
interface Response {
  status: number;
  message: string;
}
type resultType = {
  status: boolean;
  rCode: number;
  loading: boolean;
};

const Signup = () => {
  const router = useRouter(); //from next router
  const [result, setResult] = useState<resultType>({
    status: false,
    rCode: 200,
    loading: false,
  });
  //useState for result gotten after signup process finished (either failed or success)
  const [errorMail, setErrorMail] = useState<boolean>(false); //for possible mail error
  const [password, setPassword] = useState<string>(""); //usestate for password
  const [passed, setPassed] = useState<boolean>(false); //useState for checking if the preocess was a success
  const [internalError, setInternalError] = useState<boolean>(false);
  const [Email, setEmail] = useState<string>("");
  const [first, setfirst] = useState<string>("");
  const [last, setlast] = useState<string>("");
  const [country, setcountry] = useState<string>("NA");
  const [dob, setdob] = useState<string>("2000-01-01");
  const [CurrentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [done, setDone] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false); //for possible error
  const [errorMessage, setErrorMessage] = useState<string>(""); //for error message
  const hasSignedUpRef = useRef<boolean>(false); //ref to track if signup has been initiated

  //function to signUpUsers
  const signUpUser = useCallback(async () => {
    setResult((prev) => ({ ...prev, loading: true }));
    setInternalError(false);
    try {
      const postdata = await registerAuth(
        first,
        last,
        dob,
        password,
        Email,
        country
      );
      const {
        status,
        message,
        error,
      }: { status: number; message: string; error?: string } =
        await postdata.data;
      //check if mail exist
      if (status === 401) {
        setResult({ status: false, rCode: 403, loading: false }); //stop loading ui and show error
        window.scrollTo(0, 0); //scroll to top
        setErrorMail(true); //show error message
        return;
      }
      //success
      else if (status === 200) {
        const data = await signIn("credentials", {
          email: Email,
          password: password,
          redirect: false,
        });

        setResult({ status: false, rCode: 200, loading: true });
        setPassed(true);
        router.push("/dashboard");
      } else {
        setInternalError(true);
        setTimeout(() => {
          setInternalError(true);
        }, 4000);
        setResult({ status: true, rCode: 404, loading: false });
      }
    } catch (error) {
      console.error(error);
      setResult({ status: true, rCode: 404, loading: false });
      //an error occurred
    }
  }, [first, last, dob, password, Email, country, router]);

  useEffect(() => {
    if (done && !passed && !hasSignedUpRef.current) {
      hasSignedUpRef.current = true;
      signUpUser();
    }
  }, [done, signUpUser, passed]);

  useEffect(() => {
    if (internalError) {
      setError(true);
      setErrorMessage("Try again later, we are on it!");
    }
  }, [internalError]);

  const signupPage = () => {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-background via-background to-background/95 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/10 rounded-full blur-2xl animate-pulse delay-1000" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-screen overflow-y-auto md:h-auto md:overflow-y-visible pt-[4rem] pb-[4rem] md:pt-6 md:pb-6 w-full max-w-2xl mx-auto p-6 relative z-10"
        >
          {/* Logo/Brand */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-center mb-8"
          >
            <div className="hidden md:flex w-16 h-16 mx-auto mb-4 rounded-2xl items-center justify-center shadow-lg overflow-clip bg-transparent">
              <HyperchoIcon className="h-full w-full" />
            </div>
          </motion.div>

          {/* Form Container */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-card/50 backdrop-blur-xl border border-solid border-border/50 rounded-2xl p-6 shadow-2xl space-y-3"
          >
            <div className="text-center">
              <h1 className="text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {CurrentStepIndex === 0
                  ? "Let's get started!"
                  : "Verify your email"}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                {CurrentStepIndex === 0
                  ? "Create an account and meet your hyperclaw"
                  : "We've sent a verification code to your email"}
              </p>
            </div>
            <AnimatePresence mode="wait">
              {CurrentStepIndex === 0 && (
                <motion.div
                  key="userinfo"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <UserInfo
                    setCurrentStepIndex={setCurrentStepIndex}
                    CurrentStepIndex={CurrentStepIndex}
                    setResult={setResult}
                    result={result}
                    first={first}
                    setfirst={setfirst}
                    last={last}
                    setlast={setlast}
                    country={country}
                    setcountry={setcountry}
                    dob={dob}
                    setdob={setdob}
                    Email={Email}
                    setEmail={setEmail}
                    errorMail={errorMail}
                    setErrorMail={setErrorMail}
                    password={password}
                    setPassword={setPassword}
                    internalError={internalError}
                    setInternalError={setInternalError}
                    editMode={editMode}
                    setEditMode={setEditMode}
                    error={error}
                    setError={setError}
                    errorMessage={errorMessage}
                    setErrorMessage={setErrorMessage}
                  />
                </motion.div>
              )}
              {CurrentStepIndex === 1 && (
                <motion.div
                  key="verify"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Verify
                    setCurrentStepIndex={setCurrentStepIndex}
                    CurrentStepIndex={CurrentStepIndex}
                    setResult={setResult}
                    result={result}
                    internalError={internalError}
                    email={Email}
                    setDone={setDone}
                    error={error}
                    setError={setError}
                    errorMessage={errorMessage}
                    setErrorMessage={setErrorMessage}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Sign Up | Enhance Your Productivity and Peace of Mind</title>

        <meta
          name="description"
          content="Join Hypercho today to discover AI tools that improve your workflow and bring peace of mind. Achieve more effectively while feeling mentally refreshed."
        />

        <link rel="icon" href="https://hypercho.com/favicon.ico" />

        {/* Note: viewport meta tag is handled automatically by Next.js */}

        <meta charSet="UTF-8" />

        <meta
          property="og:title"
          content="Sign Up for Hypercho | Enhance Your Productivity and Peace of Mind"
        />
        <meta
          property="og:description"
          content="Join Hypercho today to discover AI tools that improve your workflow and bring peace of mind. Achieve more effectively while feeling mentally refreshed."
        />
        <meta property="og:image" content="https://hypercho.com/opImage.jpg" />
        <meta property="og:url" content="https://hypercho.com/auth/Signup" />
        <meta property="og:type" content="website" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Sign Up for Hypercho | Enhance Your Productivity and Peace of Mind"
        />
        <meta
          name="twitter:description"
          content="Join Hypercho today to discover AI tools that improve your workflow and bring peace of mind. Achieve more effectively while feeling mentally refreshed."
        />
        <meta name="twitter:image" content="https://hypercho.com/opImage.jpg" />

        <link rel="canonical" href="https://hypercho.com/auth/Signup" />

        <meta name="robots" content="index, follow" />
        <meta
          name="keywords"
          content="AI tools, AI marketplace, Hypercho, mental well-being, productivity tools, innovation, AI products, peace of mind"
        />
      </Head>
      {signupPage()}
    </>
  );
};
Signup.getLayout = getLayout;
export default Signup;
