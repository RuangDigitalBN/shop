import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, children, action }: { eyebrow: string; children: ReactNode; action?: ReactNode }) {
  return <div className="store-section-heading"><div><p className="store-eyebrow">{eyebrow}</p><h2>{children}</h2></div>{action}</div>;
}

export function StoreStatus({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p className={`store-status ${error ? "store-status-error" : ""}`} role={error ? "alert" : "status"}>{children}</p>;
}
