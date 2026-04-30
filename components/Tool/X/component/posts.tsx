import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BadgeCheck,
  BarChart2,
  Heart,
  MessageCircle,
  Repeat2,
  Edit,
  Trash,
} from "lucide-react";
import { motion } from "framer-motion";
import { xType, TwitterAccountType, AIPostType } from "../types";
import { useX } from "../provider/xProvider";
import { useStatusTimer } from "$/hooks/useStatusTimer";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "$/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PostCardProps {
  post: xType;
  index: number;
  twitterAccount: TwitterAccountType;
}

interface SinglePostItemProps {
  singlePost: AIPostType;
  post: xType;
  postIndex: number;
  twitterAccount: TwitterAccountType;
  handleEditPostClick: (postId: string) => void;
  setClickedPost: (postId: string) => void;
  setDeleteDialogOpen: (open: boolean) => void;
}

// New child component
const SinglePostItem = ({
  singlePost,
  post,
  postIndex,
  twitterAccount,
  handleEditPostClick,
  setClickedPost,
  setDeleteDialogOpen,
}: SinglePostItemProps) => {
  const singleTimeDisplay = useStatusTimer({
    date: singlePost.postedAt,
    status: singlePost.status,
    scheduledDate: post.scheduledAt,
  });
  return (
    <div className="flex gap-3 relative" key={singlePost._id}>
      <div className="flex-shrink-0">
        <Avatar className="w-10 h-10 rounded-full">
          <AvatarImage
            src={
              twitterAccount?.profileImageUrl ||
              "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"
            }
            alt="Profile"
          />
          <AvatarFallback className="bg-foreground/10 rounded-full">
            {twitterAccount?.username?.charAt(0).toUpperCase() || "X"}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <div className="flex items-center gap-1 mb-0.5">
          <div className="flex items-center gap-1 w-full">
            <span className="font-semibold text-foreground/90 whitespace-nowrap">
              {twitterAccount?.name || "Your Name"}
            </span>
            {twitterAccount?.verified && (
              <BadgeCheck className="w-4 h-4 fill-blue-400 flex-shrink-0 stroke-background" />
            )}
            <span className="truncate ml-1 flex items-center gap-2">
              <span className="text-foreground/50">
                @{twitterAccount?.username || "username"}
              </span>
              {singlePost.status === "active" ? (
                <span className={`text-foreground/50`}>
                  · {singleTimeDisplay.text}
                </span>
              ) : (
                <span
                  className={cn(
                    `text-foreground/50 font-medium`,
                    singleTimeDisplay.color
                  )}
                >
                  · {singlePost.status}
                </span>
              )}
            </span>
          </div>
        </div>

        <p className="text-foreground/80 whitespace-pre-wrap break-words cursor-text font-medium">
          {singlePost.content}
        </p>
        {/* Add a status indicator for non-posted states */}
        {(singlePost.status === "scheduled" ||
          singlePost.status === "failed") && (
          <div
            className={`mt-2 text-xs ${singleTimeDisplay.color} flex items-center gap-2`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                singlePost.status === "scheduled"
                  ? "bg-blue-400"
                  : singlePost.status === "failed"
                  ? "bg-red-500"
                  : ""
              }`}
            />
            {singlePost.status === "scheduled" && post.scheduledAt && (
              <span>
                Scheduled for {new Date(post.scheduledAt).toLocaleString()}
              </span>
            )}
            {singlePost.status === "failed" && (
              <span>Failed to post - Please try again</span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between mt-3 text-foreground/50">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 hover:text-primary transition-colors">
                  <MessageCircle className="w-4 h-4" />
                  <span className="text-xs flex items-center gap-1">
                    {singlePost.metrics?.comments}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Predicted replies</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 hover:text-green-500 transition-colors">
                  <Repeat2 className="w-4 h-4" />
                  <span className="text-xs flex items-center gap-1">
                    {singlePost.metrics?.shares}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Predicted retweets</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 hover:text-red-500 transition-colors">
                  <Heart className="w-4 h-4" />
                  <span className="text-xs flex items-center gap-1">
                    {singlePost.metrics?.likes}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Predicted likes</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 hover:text-primary transition-colors">
                  <BarChart2 className="w-4 h-4" />
                  <span className="text-xs flex items-center gap-1">
                    {singlePost.metrics?.impressions}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Predicted impressions</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex items-center gap-2">
            {singlePost.status !== "active" &&
              singlePost.status !== "inprogress" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:text-blue-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditPostClick(post._id);
                  }}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              )}
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-400 active:text-red-300"
              onClick={(e) => {
                e.stopPropagation();
                setClickedPost(singlePost._id);
                setDeleteDialogOpen(true);
              }}
            >
              <Trash className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      {/* Thread connection line between avatars */}
      {post.postId.length > 0 && postIndex < post.postId.length - 1 && (
        <div
          className="!ml-0 absolute left-[21px] top-[44px] w-0.5 bg-border z-0"
          style={{
            height: `calc(100% - 48px)`, // starts at bottom of avatar
          }}
        />
      )}
    </div>
  );
};

interface EmptyPostTemplateProps {
  twitterAccount: TwitterAccountType;
  postId: string;
}

const EmptyPostTemplate = ({
  twitterAccount,
  postId,
}: EmptyPostTemplateProps) => {
  const { handleEditPostClick } = useX();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-start gap-3 p-4 border border-dashed border-primary/10 bg-background/60 rounded-lg min-h-[80px]"
    >
      <div className="flex-shrink-0 flex items-start justify-start">
        <Avatar className="w-10 h-10 rounded-full">
          <AvatarImage
            src={
              twitterAccount?.profileImageUrl ||
              "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"
            }
            alt="Profile"
            className="rounded-full"
          />
          <AvatarFallback className="bg-foreground/10 rounded-full">
            {twitterAccount?.username?.charAt(0).toUpperCase() || "X"}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center  gap-1">
          <span className="font-semibold text-foreground/90 whitespace-nowrap">
            {twitterAccount?.name || "Account"}
          </span>
          {twitterAccount?.verified && (
            <BadgeCheck className="w-4 h-4 fill-blue-400 flex-shrink-0 stroke-background" />
          )}
          <span className="text-foreground/50 ml-1">
            @{twitterAccount?.username || "username"}
          </span>
        </div>
        <div className="text-foreground/50 text-sm italic mt-1 flex justify-start items-start gap-2 flex-col">
          <span className="animate-pulse">
            No content yet. Start by adding a post!
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => handleEditPostClick(postId)}>
              Edit Template
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const PostCard = ({ post, index, twitterAccount }: PostCardProps) => {
  const { toast } = useToast();
  const { deletePost, handleEditPostClick } = useX();
  const [clickedPost, setClickedPost] = useState<string>("");

  // Add state for dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.1 }}
        className="p-4 border border-solid border-primary/10 hover:bg-foreground/5 transition-all"
      >
        {post.postId.length === 0 ? (
          <EmptyPostTemplate
            twitterAccount={twitterAccount}
            postId={post._id}
          />
        ) : (
          post.postId.map((singlePost, postIndex) => (
            <SinglePostItem
              key={singlePost._id}
              singlePost={singlePost}
              post={post}
              postIndex={postIndex}
              twitterAccount={twitterAccount}
              handleEditPostClick={handleEditPostClick}
              setClickedPost={setClickedPost}
              setDeleteDialogOpen={setDeleteDialogOpen}
            />
          ))
        )}
      </motion.div>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Post?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-foreground/80 text-sm">
            Are you sure you want to delete this post? This action cannot be
            undone.
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteDialogOpen(false);
                setClickedPost("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deletePost(clickedPost);
                setDeleteDialogOpen(false);
                setClickedPost("");
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

interface PostsListProps {
  postsList: xType[];
  twitterAccount: TwitterAccountType;
}

/**
 * PostCard component displays an individual post card with status, metrics, and interactions
 *
 * @param {Object} props - Component props
 * @param {AIPostType} props.post - The post data to display
 * @param {number} props.index - The index of the post in the list
 * @param {TwitterAccountType} props.twitterAccount - The associated Twitter account
 * @param {Function} [props.onSelect] - Callback function when post is selected
 * @param {boolean} props.isTemplate - Whether the post is a template
 * @param {Function} [props.onDeletePost] - Callback function when post is deleted
 * @param {Function} [props.onEditPost] - Callback function when post is edited
 * @returns {JSX.Element} A motion-animated post card component
 *
 * @example
 * <PostCard
 *   post={postData}
 *   index={0}
 *   twitterAccount={twitterAccount}
 *   onSelect={() => handleSelect(0)}
 * />
 */
export const PostsList = ({ postsList, twitterAccount }: PostsListProps) => {
  return (
    <div className="">
      {postsList.map((post, index) => (
        <PostCard
          key={`${post._id}-${index}`}
          post={post}
          index={index}
          twitterAccount={twitterAccount}
        />
      ))}
    </div>
  );
};

export default PostsList;
