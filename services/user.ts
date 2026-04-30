import { hyperchoApi } from "./http.config";

export const sendVerify = (email: string) =>
  hyperchoApi.post(`/auth/Send_verify`, {
    email: email,
  });

export const verifyOTP = (email: string, otp: number) =>
  hyperchoApi.post(`/auth/Verify_verify`, {
    email: email,
    otp,
  });

export const verifyReset = (id: string) =>
  hyperchoApi.post(`/auth/Verify_reset`, {
    string: id,
  });

export const sendReset = (email: string) =>
  hyperchoApi.post(`/auth/Send_reset`, {
    email: email,
  });

export const loginAuth = (email: string, Password: FormDataEntryValue) =>
  hyperchoApi.post(`/login/User`, {
    email,
    Password,
  });

export const resetPassAuth = (userId: string | undefined, newpass: string) =>
  hyperchoApi.post(`/reset/User`, {
    Password: newpass,
    userId: userId,
  });

export const registerAuth = (
  first: string,
  last: string,
  dob: string,
  password: string,
  email: string,
  country: string
) =>
  hyperchoApi.post(`/Signup/User`, {
    Firstname: first,
    Lastname: last,
    DOB: dob,
    Password: password,
    email: email,
    Country: country,
  });

export const googleAuth = (
  email: string,
  firstname: string,
  lastname: string,
  image: string
) =>
  hyperchoApi.post(`/auth/google`, {
    email,
    firstName: firstname,
    lastName: lastname,
    profilePicture: image,
  });

export const updateUserProfile = ({
  profilePic,
  username,
  aboutme,
  firstName,
  lastName,
  banner,
  country,
  dob,
}: {
  profilePic?: string;
  username?: string;
  aboutme?: string;
  firstName?: string;
  lastName?: string;
  banner?: string;
  country?: string;
  dob?: string;
}) =>
  hyperchoApi.post(`/Settings/Profile/`, {
    profilePic,
    username,
    aboutme,
    firstName,
    lastName,
    banner,
    country,
    dob,
  });

export const getUserinfoApi = ({
  type_value,
  type,
}: {
  type_value: string;
  type: "email" | "id";
}) => hyperchoApi.get(`/User/info/${type_value}?type=${type}`);

export const getUserInfo = () => hyperchoApi.get(`/User/info/`);

export const enrollNewsLetter = ({ email }: { email: string }) =>
  hyperchoApi.post(`/User/enrollNewsLetter`, {
    email: email,
  });

export const removeNewsLetter = ({ email }: { email: string }) =>
  hyperchoApi.post(`/User/removeNewsLetter`, {
    email: email,
  });

export const contactUsForm = (data: any) =>
  hyperchoApi.post(`/Contact/sales`, {
    data: data,
  });

export const addToWaitingList = ({
  name,
  email,
}: {
  name: string;
  email: string;
}) =>
  hyperchoApi.post(`/Contact/waitlist`, {
    name: name,
    email: email,
  });

// Membership types kept so consumers (UI badges, rate-limit hints) compile in
// both Community and Cloud builds. In Community Edition the membership is
// always treated as free / unlimited and there is no Stripe billing portal.
export interface MembershipPackage {
  name: string;
  maxToken: number;
  generate_response_daily: number;
}

export interface UserMembership {
  startDate: string | Date;
  endDate: string | Date;
  package: MembershipPackage;
  isFreePlan: boolean;
  customerId: string; // Stripe customer ID — only set in Cloud builds
}

export const getUserMembership = () =>
  hyperchoApi.get<HyperchoResponse<UserMembership>>(`/User/membership`);
