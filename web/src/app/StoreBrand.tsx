import Image from "next/image";
import Link from "next/link";

export default function StoreBrand({ variant = "wordmark" }: { variant?: "wordmark" | "mark" }) {
  return <Link href="/" aria-label="Ruang Digital home" className={`store-brand store-brand-${variant}`}>
    <Image src="/ruang-digital-reference-logo.png" alt="Ruang Digital" width={229} height={111} unoptimized />
  </Link>;
}
