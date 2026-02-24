import { hyperchoApi } from "$/services/http.config";

export const generateIdeaReport = async (data: {
  idea: string;
  userId?: string;
}) =>
  hyperchoApi.post(`/Tools/miniTool/ideaValidator`, data, {
    timeout: 120000, // Increased timeout to 120 seconds
  });

export const fetchIdeaData = async (id: string) =>
  hyperchoApi.get(`/Tools/miniTool/ideaValidator/${id}`);

export const getMyIdeas = async () =>
  hyperchoApi.get(`/Tools/miniTool/ideaValidator/recent`);

export const manageUserIdeas = async (data: {
  ideaId: string;
  action: "create" | "like" | "save" | "remove";
}) => hyperchoApi.post(`/Tools/miniTool/ideaValidator/manageUserIdeas`, data);

