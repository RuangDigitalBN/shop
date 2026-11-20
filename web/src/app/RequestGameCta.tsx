import Link from "next/link";
import StoreIcon from "./StoreIcons";

export default function RequestGameCta({ compact = false }: { compact?: boolean }) {
  const headingId = compact ? "request-game-collection-heading" : "request-game-home-heading";
  return <section className={`store-container store-request-cta${compact ? " store-request-cta-compact" : ""}`} aria-labelledby={headingId}>
    <div className="store-request-card">
      <div className="store-request-copy">
        <h2 id={headingId}>{compact ? "Can’t find another game?" : "Can’t find your game?"}</h2>
        <p>{compact ? "Tell us what you’d like to see next." : "Request a game or tell us what you’d like to see next."}</p>
      </div>
      <Link href="/requests" className="store-action">Request a Game <StoreIcon name="arrow-right" size={18} /></Link>
    </div>
  </section>;
}
