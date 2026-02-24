
import { entrepriseApi } from "./http.config";

export const createAssistantAPI = async () =>
  entrepriseApi.post(`/Assistant/createAssistant`);

export const fetchAssistantAPI = async () =>
  entrepriseApi.get(`/Assistant/fetchAssistant`);

export const editAssistantAPI = async ({
  formData,
  Personality,
}: {
  formData: object;
  Personality: object;
}) =>
  entrepriseApi.post(`/Assistant/editAssistant`, {
    formData,
    Personality,
  });