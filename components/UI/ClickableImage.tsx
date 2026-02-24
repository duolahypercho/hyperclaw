import { X } from "lucide-react";
import { useState } from "react";
import Image from "next/image";

interface ClickableImageProps {
  src: string;
  alt?: string;
  className?: string;
}

const ClickableImage = ({
  src,
  alt = "",
  className = "",
}: ClickableImageProps) => {
  const [showOverlay, setShowOverlay] = useState(false);

  return (
    <>
      <div className="relative">
        <Image
          src={src}
          alt={alt}
          className={className}
          onClick={() => setShowOverlay(true)}
          style={{ cursor: "pointer" }}
          width={500}
          height={300}
          unoptimized
        />
      </div>

      {showOverlay && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
          onClick={() => setShowOverlay(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <Image
              src={src}
              alt={alt}
              className="max-w-full max-h-[90vh] object-contain"
              width={1200}
              height={800}
              unoptimized
            />
          </div>
          <div className="absolute top-3 right-3">
            <button onClick={() => setShowOverlay(false)}>
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ClickableImage;
