"use client";

import { useState } from "react";

// Decorative artwork: the adjacent product heading/link already provides its name.
export default function ProductArtwork({ src, name, loading = "lazy" }: {
  src: string | null | undefined; name: string; loading?: "lazy" | "eager";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const monogram = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? "").join("").toUpperCase() || "RD";
  return <span className="product-artwork" aria-hidden="true">
    {src && src !== failedSrc ? (
      // eslint-disable-next-line @next/next/no-img-element -- Existing public URLs; preserve unoptimized image behavior.
      <img src={src} alt="" loading={loading} decoding="async" onError={() => setFailedSrc(src)} />
    ) : <span className="product-artwork-monogram">{monogram}</span>}
  </span>;
}
