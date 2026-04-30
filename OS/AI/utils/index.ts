const apiRouteUtils = (route: string) => {
  const baseURL =
    process.env.NEXT_PUBLIC_COPANION_RUNTIME_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:9979"
      : "http://127.0.0.1:9979");
  return baseURL.endsWith("/")
    ? baseURL + route
    : baseURL + "/" + route;
};

export { apiRouteUtils };