import { hyperchoApi } from "./http.config";

export interface PackageTypes {
  _id: string;
  name: string;
  description: string;
  price: number;
  features: string[];
  generate_response_daily: number;
  createdAt: Date;
  updatedAt: Date;
}

export const getPackage = async () =>
  hyperchoApi.get<HyperchoResponse<PackageTypes[]>>(`/Package`);
