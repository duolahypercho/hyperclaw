import { hyperchoApi } from "$/services/http.config";

const apiRouteUtils = (route: string) => {
  const baseURL = hyperchoApi.defaults.baseURL || "";
  return baseURL.endsWith("/")
    ? baseURL + route
    : baseURL + "/" + route;
};

export { apiRouteUtils };