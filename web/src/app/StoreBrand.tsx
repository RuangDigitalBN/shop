import Image from "next/image";
import Link from "next/link";

export default function StoreBrand({ variant = "wordmark" }: { variant?: "wordmark" | "mark" }) {
  return <Link href="/" aria-label="Ruang Digital home" className={`store-brand store-brand-${variant}`}>
    <Image src={variant === "mark" ? "/ruang-digital-mark.svg" : "/ruang-digital-logo.svg"} alt="Ruang Digital" width={variant === "mark" ? 80 : 390} height={variant === "mark" ? 80 : 76} unoptimized />
  </Link>;
}
