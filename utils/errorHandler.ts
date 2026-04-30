import { toast } from "@/components/ui/use-toast";
import axios from "axios";

type ErrorResponse = {
  error?: string;
  message?: string;
  success?: boolean;
};

export const handleError = (
  error: unknown,
  defaultMessage = "An unexpected error occurred"
) => {
  if (axios.isAxiosError(error)) {
    // Handle Axios-specific errors
    const serverError = error.response?.data as ErrorResponse;
    console.error(
      "API Error:",
      serverError?.error || serverError?.message || error.message
    );
    toast({
      title: error.message || defaultMessage,
      description: serverError?.error || "Please try again",
      variant: "destructive",
    });
  } else if (error instanceof Error) {
    // Handle other Error instances
    console.error("Unexpected error:", error);
    toast({
      title: error.message || defaultMessage,
      description: "Please try again",
      variant: "destructive",
    });
  } else {
    // Handle unknown error types
    console.error("Unknown error:", error);
    toast({
      title: defaultMessage,
      description: "Please try again",
      variant: "destructive",
    });
  }
};
