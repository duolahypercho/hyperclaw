import Link from "next/link";
import { memo } from "react";
import { FaRocket, FaTools, FaBook } from "react-icons/fa";
import { MdPolicy } from "react-icons/md";
import { useRouter } from "next/router";

//types for sidebar values
type sidebarContextType = {
  link: string;
  name: string;
  text: string;
};

const SidebarContextDefaultvalues: sidebarContextType[] = [
  {
    link: "/overview",
    name: "overview",
    text: "Overview",
  },
  {
    link: "/introduction",
    name: "introduction",
    text: "Introduction",
  },
];
const SidebarContextDefaultvalues2: sidebarContextType[] = [
  {
    link: "/privacy",
    name: "privacy",
    text: "Privacy Policy",
  },

  {
    link: "/tos",
    name: "tos",
    text: "Terms of Service",
  },
  {
    link: "/hypercho-cookies",
    name: "hypercho-cookies",
    text: "Cookie Use",
  },
];
const SidebarContextDefaultvalues3: sidebarContextType[] = [
  {
    link: "/what-is-ai",
    name: "what-is-ai",
    text: "What is AI?",
  },

  {
    link: "/how-AI-is-shaping-our-lives",
    name: "how-AI-is-shaping-our-lives",
    text: "How AI is Shaping Our Lives",
  },
  {
    link: "/finding-ai-solution",
    name: "finding-ai-solution",
    text: "Finding AI Solutions",
  },
];
const SidebarContextDefaultvalues4: sidebarContextType[] = [
  {
    link: "/entreprise-overview",
    name: "entreprise-overview",
    text: "Overview",
  },
  {
    link: "/entreprise-guidelines",
    name: "entreprise-guidelines",
    text: "Guidelines",
  },
];

const MainListElements = ({
  title,
  Lists,
  page,
  Icon,
  docsID,
}: {
  title: string;
  Lists: sidebarContextType[];
  page: string;
  Icon: JSX.Element;
  docsID: string;
}) => {
  return (
    <>
      <div className="title">
        {Icon}
        <span>{title}</span>
      </div>
      {Lists.map(({ name, link, text }) => {
        return (
          <Link
            key={name}
            href={`/docs${link}`}
            passHref
            style={{ width: "100%", textDecoration: "none" }}
          >
            <li
              className={
                page === `/docs${link}` || docsID === name ? "active" : ""
              }
            >
              <p>{text}</p>
            </li>
          </Link>
        );
      })}
    </>
  );
};

const Sidebarelements = () => {
  const router = useRouter();
  const page = router.pathname;
  const docsID = router.query.docsID as string;
  return (
    <div className="ulwrapper customScrollbar2">
      <ul className="active">
        {
          <MainListElements
            title={"Get started"}
            Lists={SidebarContextDefaultvalues}
            page={page}
            docsID={docsID}
            Icon={<FaRocket className="icon" />}
          />
        }{" "}
        <hr />
        {
          <MainListElements
            title={"Guide"}
            Lists={SidebarContextDefaultvalues3}
            page={page}
            docsID={docsID}
            Icon={<FaBook className="icon" />}
          />
        }{" "}
        <hr />
        {
          <MainListElements
            title={"Entreprise"}
            Lists={SidebarContextDefaultvalues4}
            page={page}
            docsID={docsID}
            Icon={<FaTools className="icon" />}
          />
        }
        <hr />
        {
          <MainListElements
            title={"Policy"}
            Lists={SidebarContextDefaultvalues2}
            page={page}
            docsID={docsID}
            Icon={<MdPolicy className="icon" />}
          />
        }
        <hr />
      </ul>
    </div>
  );
};

export default memo(Sidebarelements);
