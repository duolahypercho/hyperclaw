import { mediaApi, hyperchoApi, creatorApi } from "./http.config";
interface likedCommentAndReplyTypes {
  userId: string;
  videoRef: string;
}
interface likeCommentAndreplyTypes {
  videoRef: string;
  Ref: string;
  userId: string;
  type: boolean;
}
type undoLikeCommentAndreplyTypes = Omit<likeCommentAndreplyTypes, "videoRef" | "type">;
interface addCommentTpes {
  userId?: string;
  channelId?: string;
  videoRef: string;
  text: string;
}
interface addReplyTypes {
  channelId?: string;
  userId?: string;
  commentRef: string;
  videoRef: string;
  text: string;
}
interface deleteCommentAndReplyType {
  commentId?: string;
  replyId?: string;
  idType: "user" | "channel";
  id: string;
}

interface videoLikeTypes {
  userId: string;
  type?: boolean;
  Ref: string;
}
const idToUse = (userId?: string, channelId?: string): "user" | "channel" => {
  if (userId && !channelId) return "user";
  if (!userId && channelId) return "channel";
  if (userId && channelId) return "channel";
  return "user";
};


export const channelData_Api = (channelId: string) => mediaApi.get(`/Channel/find/${channelId}`);

export const OneVideoData_Api = (videoId: string) => mediaApi.get(`/Video/${videoId}`);

export const userLikeStatusForVideo_Api = ({ userId, Ref }: videoLikeTypes) =>
  hyperchoApi.post(`/LikeAndDislike/video/user`, {
    userId,
    Ref,
});

export const likeOrDislikeVideo_Api = ({ userId, Ref, type }: videoLikeTypes) =>
  hyperchoApi.post(`/LikeAndDislike/video`, {
    userId,
    Ref,
    type,
});

export const undoLikeOrDislikeVideo_Api = ({ userId, Ref }: videoLikeTypes) =>
  hyperchoApi.post(`/LikeAndDislike/video/undo`, {
    userId,
    Ref,
});


/* comments and replies */

export const Comments_Api = (videoId: string) => mediaApi.get(`Comments/${videoId}`);

export const CommentsCount_Api = (videoId: string) => mediaApi.get(`Comments/Count/${videoId}`);

export const addComment_Api = ({ userId, channelId, videoRef, text }: addCommentTpes) =>
  hyperchoApi.post(`/Comments/AddComment`, {
    ...(idToUse(userId, channelId) === "user" ? { userId } : null),
    ...(idToUse(userId, channelId) === "channel" ? { channelId } : null),
    videoRef,
    text,
  });

export const addReply_Api = ({ userId, channelId, videoRef, commentRef, text }: addReplyTypes) =>
  hyperchoApi.post(`/Comments/AddReply`, {
    ...(idToUse(userId, channelId) === "user" ? { userId } : null),
    ...(idToUse(userId, channelId) === "channel" ? { channelId } : null),
    videoRef,
    text,
    commentRef,
  });

export const deleteComment_Api = ({ commentId, idType, id }: deleteCommentAndReplyType) =>
  hyperchoApi.delete(`/Comments/Comment`, {
    commentId,
    idType,
    id,
  });

export const deleteReply_Api = ({ replyId, idType, id }: deleteCommentAndReplyType) =>
  hyperchoApi.delete(`/Comments/Reply`, {
    replyId,
    idType,
    id,
  });

export const allLikedComments_Api = ({ userId, videoRef }: likedCommentAndReplyTypes) =>
  hyperchoApi.post(`/LikeAndDislike/comment/user`, {
    userId,
    videoRef,
  });

export const allLikedReplies_Api = ({ userId, videoRef }: likedCommentAndReplyTypes) =>
  hyperchoApi.post(`/LikeAndDislike/reply/user`, {
    userId,
    videoRef,
  });
  
export const likeAndDislikeComment_Api = ({ videoRef, Ref, userId, type }: likeCommentAndreplyTypes) =>
  hyperchoApi.post(`/LikeAndDislike/comment`, {
    videoRef,
    Ref,
    userId,
    type,
  });

export const likeAndDislikeReply_Api = ({ videoRef, Ref, userId, type }: likeCommentAndreplyTypes) =>
  hyperchoApi.post(`/LikeAndDislike/reply`, {
    videoRef,
    Ref,
    userId,
    type,
  });

export const undoLikeAndDislikeComment_Api = ({ Ref, userId }: undoLikeCommentAndreplyTypes) =>
  hyperchoApi.post(`/LikeAndDislike/comment/undo`, {
    Ref,
    userId,
  });

export const undoLikeAndDislikeReply_Api = ({ Ref, userId }: undoLikeCommentAndreplyTypes) =>
  hyperchoApi.post(`/LikeAndDislike/reply/undo`, {
    Ref,
    userId,
  });
