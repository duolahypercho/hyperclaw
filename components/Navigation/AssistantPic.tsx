import Image from "next/image";
import { useAssistant } from "../../Providers/AssistantProv";
import { getMediaUrl } from "../../utils";

const AssistantPic = (props: { show?: boolean }) => {
  const { personality } = useAssistant();
  return (
    <div
      className="userPic nonselect"
      style={{ borderRadius: `${props.show ? "20%" : ""}` }}
    >
      <div className="wrapper">
        {personality.coverPhoto === "" ? (
          <Image
            src="/favicon-32x32.ico"
            loading="eager"
            width={32}
            height={32}
            className="image"
            title="Hypercho"
            alt="Hypercho pic"
            fetchPriority={props.show ? "high" : "low"}
            style={{
              width: "100%",
              height: "100%",
            }}
          />
        ) : (
          <Image
            loading="eager"
            src={getMediaUrl(personality.coverPhoto)}
            alt="user_image"
            width={32}
            height={32}
            fetchPriority={props.show ? "high" : "low"}
            className="image"
            style={{
              width: "100%",
              height: "100%",
            }}
          />
        )}
      </div>
    </div>
  );
};

export default AssistantPic;
