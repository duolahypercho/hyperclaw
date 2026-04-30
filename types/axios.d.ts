import "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    commentId?: string;
    replyId?: string;
    idType?: "user" | "channel";
    id?: string;
    userId?: string;
    historyId?: string;
  }
}
