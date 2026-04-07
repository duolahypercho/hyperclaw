import { useRouter } from "next/router";
import { FormEvent, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { getLayout } from "../../layouts/AuthLayout";
import Head from "next/head";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
import { GoogleIcon } from "$/components/Iconsvg";
import { FieldSeparator } from "@/components/ui/field";

const Login = () => {
  const router = useRouter();
  const [errorPassword, setErrorPassword] = useState<string>(""); //for possible password error
  const [errorMail, setErrorMail] = useState<string>(""); //for possible mail error
  const [error, setError] = useState<boolean>(false); //for possible error
  const [loading, setLoading] = useState<boolean>(false); //useState for loadingstate
  const [passShow, setPassShow] = useState<boolean>(true); //useState for password visibility
  const [passed, setPassed] = useState<boolean>(false); //useState for checking of the user passed the auth
  const [errorMessage, setErrorMessage] = useState<string>(""); //for error message
  const [googleLoading, setGoogleLoading] = useState<boolean>(false); //useState for Google sign-in loading
  const { toast } = useToast();

  // Handle URL error parameters from NextAuth redirects
  useEffect(() => {
    const urlError = router.query.error as string;
    if (urlError) {
      toast({
        title: "Authentication Error",
        description: urlError,
        variant: "destructive",
      });
      // Clear the error from URL after displaying it
      router.replace("/auth/Login", undefined, { shallow: true });
    }
  }, [router.query.error, toast, router]);

  useEffect(() => {
    if (error) {
      toast({
        title: "Login Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [error, errorMessage, toast]);

  // Handle Google sign-in
  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);

      // Clear any previous errors from URL (e.g., failed credentials auth)
      if (router.query.error) {
        await router.replace("/auth/Login", undefined, { shallow: true });
      }

      await signIn("google", {
        callbackUrl: "/dashboard", // Redirect to dashboard after successful login
      });
    } catch (error) {
      console.error("Google sign-in error:", error);
      setGoogleLoading(false);
      toast({
        title: "Google Sign-In Failed",
        description: "Unable to sign in with Google. Please try again.",
        variant: "destructive",
      });
    }
  };

  //function to submit the data;
  const submitdata = async (e: FormEvent<EventTarget>) => {
    e.preventDefault();
    setLoading(true); //initialize loading state

    // Clear any previous errors from URL (e.g., failed Google auth)
    if (router.query.error) {
      await router.replace("/auth/Login", undefined, { shallow: true });
    }

    const maindata = Object.fromEntries(
      new FormData(e.target as HTMLFormElement).entries()
    ); // get all data from all enteries
    //use nextAuth sign in functionaity to sign in user with credential supplied

    const data = await signIn("credentials", {
      email: maindata.email,
      password: maindata.password,
      redirect: false,
    });
    responsehandling(data);
  };

  //function with conditionals to handle the result of the signin request
  const responsehandling = (data: any) => {
    const error = data.error;
    setLoading(false);
    //if the signup is a success redirect them
    if (error === null) {
      //redirect to dashboard if account is verified
      setPassed(true);
      router.push("/dashboard");
    }
    //if the email or password is incorrect
    else if (error === "Invalid email or password") {
      setError(true);
      setErrorMessage("Invalid email or password");
      const timeout = setTimeout(() => {
        setError(false);
      }, 5000);
      return () => clearTimeout(timeout);
    } else {
      setError(true);
      setErrorMessage("Something went wrong, try again");
      const timeout = setTimeout(() => {
        setError(false);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  };

  return (
    <>
      <Head>
        <title>
          Login to Hypercho | Access the AI Tools & Products Marketplace
        </title>
        <meta
          name="description"
          content="Log in to your Hypercho account to access a world of AI tools and products. Collaborate, innovate, and elevate your projects with the power of AI."
        />
        <link rel="icon" href="https://hypercho.com/favicon.ico" />
        {/* Note: viewport meta tag is handled automatically by Next.js */}
        <meta charSet="UTF-8" />
        <meta
          property="og:title"
          content="Login to Hypercho | Access the AI Tools & Products Marketplace"
        />
        <meta
          property="og:description"
          content="Log in to your Hypercho account to access a world of AI tools and products. Collaborate, innovate, and elevate your projects with the power of AI."
        />
        <meta property="og:image" content="https://hypercho.com/opImage.jpg" />
        <meta property="og:url" content="https://hypercho.com/auth/Login" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Login to Hypercho | Access the AI Tools & Products Marketplace"
        />
        <meta
          name="twitter:description"
          content="Log in to your Hypercho account to access a world of AI tools and products. Collaborate, innovate, and elevate your projects with the power of AI."
        />
        <meta name="twitter:image" content="https://hypercho.com/opImage.jpg" />
      </Head>
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-background via-background to-background/95 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/10 rounded-full blur-2xl animate-pulse delay-1000" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="pt-[4rem] pb-[4rem] md:pt-6 md:pb-6 w-full max-w-md mx-auto p-6 relative z-10 flex flex-col items-center justify-center"
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

          {/* Login Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full bg-card backdrop-blur-xl border border-solid border-border/50 rounded-2xl p-6 shadow-2xl space-y-3"
          >
            <div className="text-center">
              <h1 className="text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Welcome back
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Start interact with your own customized AI
              </p>
            </div>
            <Button
              variant="outline"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading || passed}
              className="w-full gap-2 hover:bg-primary/5 transition-all duration-200"
            >
              <AnimatePresence mode="wait">
                {googleLoading ? (
                  <motion.div
                    key="google-loading"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2"
                  >
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing in with Google...
                  </motion.div>
                ) : (
                  <motion.div
                    key="google-button"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2"
                  >
                    <GoogleIcon size={20} />
                    Login with Google
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
            <FieldSeparator contentClassName="bg-card">
              Or continue with
            </FieldSeparator>
            <form
              onSubmit={submitdata}
              className="space-y-6"
              autoComplete="true"
            >
              {/* Email Field */}
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className={`text-sm font-medium ${
                    errorMail ? "text-destructive" : "text-foreground/70"
                  }`}
                >
                  Email address
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className={`h-10 bg-background/50 border-2 transition-all duration-200 focus:bg-background shadow-sm ${
                      errorMail
                        ? "border-destructive focus:border-destructive"
                        : "border-border focus:border-primary hover:border-primary/50"
                    }`}
                    placeholder="your@email.com"
                    onClick={() => setErrorMail("")}
                    onChange={() => {
                      if (errorMail) setErrorMail("");
                    }}
                  />
                  <AnimatePresence>
                    {errorMail && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-xs text-destructive mt-1"
                      >
                        {errorMail}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex flex-row justify-between">
                  <Label
                    htmlFor="password"
                    className={`text-sm font-medium ${
                      errorPassword ? "text-destructive" : "text-foreground/70"
                    }`}
                  >
                    Password
                  </Label>
                  {/* Forgot Password */}
                  <Link
                    href="/auth/Resetpassword"
                    className="text-sm text-primary hover:text-primary/80 transition-colors duration-200 font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative w-full">
                  <Input
                    id="password"
                    name="password"
                    type={passShow ? "password" : "text"}
                    required
                    autoComplete="current-password"
                    className={`h-10 bg-background/50 border-2 pr-12 transition-all duration-200 focus:bg-background shadow-sm w-full ${
                      errorPassword
                        ? "border-destructive focus:border-destructive"
                        : "border-border focus:border-primary hover:border-primary/50"
                    }`}
                    placeholder="Enter your password"
                    onClick={() => setErrorPassword("")}
                    onChange={() => {
                      if (errorPassword) setErrorPassword("");
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setPassShow(!passShow)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-200 p-1 z-10"
                  >
                    {passShow ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <AnimatePresence>
                  {errorPassword && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-xs text-destructive mt-1"
                    >
                      {errorPassword}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Login Button */}
              <Button
                type="submit"
                disabled={loading || passed}
                className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground font-medium rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 group"
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
                      Redirecting...
                    </motion.div>
                  ) : loading ? (
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
                      key="login"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex items-center gap-2"
                    >
                      Login
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>

              {/* Sign Up Link */}
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Don&apos;t have an account?{" "}
                <Link
                  href="/auth/Signup"
                  className="text-primary hover:text-primary/80 transition-colors duration-200 font-medium underline"
                >
                  Register now!
                </Link>
              </p>
            </form>
          </motion.div>

          <span className="text-sm text-muted-foreground mt-8 text-center w-full">
            By clicking continue, you agree to our{" "}
            <a
              href="https://hypercho.com/docs/tos"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors duration-200 font-medium underline"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="https://hypercho.com/docs/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors duration-200 font-medium underline"
            >
              Privacy Policy
            </a>
            .
          </span>
        </motion.div>
      </div>
    </>
  );
};
Login.getLayout = getLayout;
export default Login;
