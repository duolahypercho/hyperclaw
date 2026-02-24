import { NextApiRequest, NextApiResponse } from "next";
import { unstable_getServerSession } from "next-auth";
import { getSession } from "next-auth/react";
import createOptions  from "./auth/[...nextauth]";

//get channel data
const helper = async (req: NextApiRequest, res: NextApiResponse) => {
  //@ts-ignore
  const session = await unstable_getServerSession(req, res, createOptions(req));
  const session2 = await getSession({ req });

  return res.status(200).json({ message: `update done successfully` });
  //if user isnt logged in
};
export default helper;
