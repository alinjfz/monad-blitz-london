import Image from "next/image";

type Props = {
  className?: string;
  showWordmark?: boolean;
  size?: number;
};

/** FocusBond mark + optional wordmark for nav and footer. */
export function BrandMark({ className = "", showWordmark = true, size = 28 }: Props) {
  return (
    <span className={`brand-mark ${className}`.trim()}>
      <Image
        src="/brand/icon.png"
        alt=""
        width={size}
        height={size}
        className="brand-mark-icon"
        priority
      />
      {showWordmark ? (
        <span className="brand">
          Focus<span>Bond</span>
        </span>
      ) : (
        <span className="sr-only">FocusBond</span>
      )}
    </span>
  );
}
