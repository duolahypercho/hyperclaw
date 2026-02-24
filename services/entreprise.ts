import { entrepriseApi } from "./http.config";

export const entrepriseData_Api = (businessAccountName: string) => entrepriseApi.get(`/Entreprise/find/${businessAccountName}`);

