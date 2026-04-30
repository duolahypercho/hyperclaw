interface CancelProps {
  className: string;
  onClick: () => void;
}

const Cancel:React.FC<CancelProps> = ({className, onClick}) => {
  return (
    <div className={`${className}`} onClick={onClick}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 384 512"
        style={{ width: "1rem", fill: "#FFFFFF"}}
      >
        <path d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"></path>
      </svg>
    </div>
  );
};

export default Cancel;