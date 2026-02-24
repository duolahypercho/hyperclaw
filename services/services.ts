import { mediaApi, hyperchoApi, creatorApi } from "./http.config";


export const searchVideo_Api = ({ searchParam, next }: { searchParam: string; next?: number }) =>
  mediaApi.get(`/Video/search/all?searchParam=${searchParam}&next=${next || 0}`);

export const fetchTrendingProduct = (next?: number) => hyperchoApi.get(`/Product/list/trending?next=${next || 0}`);

export const fetchVideosByGenre = ({ Genre, next }: { Genre: number; next?: number }) =>hyperchoApi.get(`/Product/list/genre?Genre=${Genre}&next=${next || 0}`);

export const fetchCategory = () => hyperchoApi.get("/Product/category");
