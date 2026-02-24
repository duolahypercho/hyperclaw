import { hyperchoApi } from "./http.config";

export const getProduct = async ({ productId }: { productId: string }) =>
  hyperchoApi.get(`/Product/${productId}`);
