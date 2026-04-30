export interface User {
  _id: string;
  profilePic: string;
  username: string;
}

export interface ChannelMini extends Omit<Channel, "_id"> {
  _id?: string;
}

export interface OneProductTypes {
  name: string;
  productID: string;
  createdAt: Date;
  logo: string;
  category: string[];
  tagline: string;
}

export interface mainProductTypes extends OneProductTypes {
  historyId?: string;
  updatedAt?: string;
}

export interface businessData {
  businessAccountName: string;
  businessBanner: string;
  businessName: string;
  businessPic: string;
  businessPhoneNumber: string;
  businessEmail: string;
  businessAddress: string;
  businessDescription: string;
  businessWebsite: string;
  _id: string;
}

export interface memoryType {
  type: "longQuestion" | "shortQuestion" | "boolean" | "multipleChoice";
  name: string;
  description: string;
  value: string;
  boolean: boolean;
  option: string[];
  showPreview: boolean;
}

export interface ChatbotData {
  //Insert the chatbot data here
  chatid: string;
  title: string;
  description: string;
  coverPhoto: string;
  welcomeMessage: string;
  chatbotId: string;
  prompt: string;
  chatModel: string;
  conversation: {
    _id: string;
    content: string;
    role: "user" | "assistant";
  }[];
  memory: memoryType[];
}

export interface PersonalityData {
  name: string;
  description: string;
  coverPhoto: string;
  WelcomeMessage: string;
  status: string;
  chatbotModel: string;
  tag: string;
  characteristics: {
    Personality: string;
    Tone: string;
    Background: string;
    Interests: string;
  };
}

export interface explorationData {
  businessID: string;
  businessName: string;
  businessDescription: string;
  businessAddress: string;
  businessPhoneNumber: string;
  businessEmail: string;
  businessWebsite: string;
}

export interface BusinessDataType {
  businessName: string;
  businessWebsite: string;
  businessEmail: string;
  businessAddress: string;
  businessPhoneNumber: string;
  businessDescription: string;
  businessID: string;
}

export interface userInfoTypes {
  email: string;
  profilePic: string;
  channel?: channelData;
  Firstname: string;
  Lastname: string;
  username: string;
  aboutme: string;
}

export interface categoryType {
  genreID: number;
  type: string;
}
