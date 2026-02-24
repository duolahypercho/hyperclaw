import Link from "next/link";
import { useEffect, useState } from "react";
import { getLayout } from "../../../layouts/AuthLayout";
import { Mail, ArrowRight, Loader2 } from "lucide-react";
import { sendReset } from "../../../services/user";
import Head from "next/head";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";

const Index = () => {
  const [result, setResult] = useState({
    status: false,
    rCode: 200,
    loading: false,
  }); //useState for result gotten after signup process finished (either failed or success)
  const [errorMail, setErrorMail] = useState<boolean>(false); //for possible mail error
  const [errorMessage, setErrorMessage] = useState<string>(""); //for possible mail error
  const [done, setDone] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");
  const { toast } = useToast();
  //function to handle submit
  const handleSubmit = async (e: any) => {
    //function to submit data;
    e.preventDefault(); //prevent reload
    await sendmail(email); //call the signup function
  };

  //function to sendmail to user
  const sendmail = async (Email: any) => {
    setResult({ ...result, loading: true }); //set status to true so as to show pop up
    try {
      const sendmail = await sendReset(Email); //send mail to user
      const { status } = await sendmail.data;

      //check if mail exist
      if (status !== 200) {
        setResult({ status: false, rCode: 403, loading: false }); //stop loading ui and show error
        setErrorMessage(`This user doesn't exist`);
        setErrorMail(true); //show error message
        return;
      }
      //success
      else {
        setDone(true);
        setResult({ status: true, rCode: 200, loading: false });
      }
    } catch (error) {
      setErrorMessage(`This not you it's us`);
      setErrorMail(true); //show error message
      setResult({ status: true, rCode: 404, loading: false });
      //an error occurred
    }
  };

  useEffect(() => {
    if (errorMail) {
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      setErrorMail(false);
      setErrorMessage("");
    }
  }, [errorMail]);
  
  return (
    <>
      <Head>
        <title>Reset Your Password | Hypercho Account Recovery</title>
        <meta
          name="description"
          content="Easily reset your Hypercho password. Regain access to your account and continue exploring the innovative world of AI tools and products."
        />
        <link rel="icon" href="https://hypercho.com/favicon.ico" />
        {/* Note: viewport meta tag is handled automatically by Next.js */}
        <meta charSet="UTF-8" />
        <meta
          property="og:title"
          content="Reset Your Password | Hypercho Account Recovery"
        />
        <meta
          property="og:description"
          content="Easily reset your Hypercho password. Regain access to your account and continue exploring the innovative world of AI tools and products."
        />
        <meta property="og:image" content="https://hypercho.com/opImage.jpg" />
        <meta
          property="og:url"
          content="https://hypercho.com/auth/Resetpassword"
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Reset Your Password | Hypercho Account Recovery"
        />
        <meta
          name="twitter:description"
          content="Easily reset your Hypercho password. Regain access to your account and continue exploring the innovative world of AI tools and products."
        />
        <meta name="twitter:image" content="https://hypercho.com/opImage.jpg" />
      </Head>
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
              {!done ? "Reset your password" : "Check your email"}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {!done
                ? "Supply your email below to change your password"
                : "We've sent a reset link to your email address"}
            </p>
          </motion.div>

          {/* Form Container */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-card/50 backdrop-blur-xl border border-solid border-border/50 rounded-2xl p-6 shadow-2xl"
          >
            <AnimatePresence mode="wait">
              {!done ? (
                <motion.form
                  key="reset-form"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleSubmit}
                  className="space-y-6"
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
                        autoComplete="email"
                        value={email}
                        className={`h-12 bg-background/50 border-2 transition-all duration-200 focus:bg-background ${
                          errorMail
                            ? "border-destructive focus:border-destructive"
                            : "border-border focus:border-primary hover:border-primary/50"
                        }`}
                        placeholder="your@email.com"
                        onClick={() => setErrorMail(false)}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errorMail) setErrorMail(false);
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
                            {errorMessage || "This user doesn't exist"}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={result.loading}
                    className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 group"
                  >
                    <AnimatePresence mode="wait">
                      {result.loading ? (
                        <motion.div
                          key="loading"
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
                          key="submit"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="flex items-center gap-2"
                        >
                          Get Link
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Button>

                  {/* Back to Login Link */}
                  <div className="text-center pt-4">
                    <p className="text-sm text-muted-foreground">
                      Remember your password?{" "}
                      <Link
                        href="/auth/Login"
                        className="text-primary hover:text-primary/80 transition-colors duration-200 font-medium"
                      >
                        Back to login
                      </Link>
                    </p>
                  </div>
                </motion.form>
              ) : (
                <motion.div
                  key="success-message"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="text-center space-y-6"
                >
                  {/* Email Icon */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="w-20 h-20 mx-auto bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center mb-6"
                  >
                    <Mail className="w-10 h-10 text-primary" />
                  </motion.div>

                  {/* Success Message */}
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Please check the email address
                    </p>
                    <p className="font-medium text-foreground break-all">
                      {email}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      to reset your password
                    </p>
                  </div>

                  {/* Resend Button */}
                  <Button
                    onClick={() => setDone(false)}
                    variant="outline"
                    className="w-full h-12 border-2 hover:bg-primary/5 transition-all duration-200"
                  >
                    Resend Email
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
};

Index.getLayout = getLayout;
export default Index;
