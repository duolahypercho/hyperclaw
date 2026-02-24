import { FetchState } from ".";

export interface homeStateTypes {
  homeList0: FetchState;
  homeList1: FetchState;
  homeList2: FetchState;
  homeList3: FetchState;
  homeList4: FetchState;
  homeList5: FetchState;
  homeList6: FetchState;
  homeList7: FetchState;
  homeList8: FetchState;
  homeList9: FetchState;
}
export interface homeFetchStepTypes {
  homeList0: number;
  homeList1: number;
  homeList2: number;
  homeList3: number;
  homeList4: number;
  homeList5: number;
  homeList6: number;
  homeList7: number;
  homeList8: number;
  homeList9: number;
}

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | "friend";
}
