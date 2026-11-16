import { Suspense } from "react";
import StoreIcon from "./StoreIcons";
import StoreBottomNav from "./StoreBottomNav";
import { GamesSection, PopularProductsSection } from "./StoreSections";
import StoreHeader from "./StoreHeader";
import StoreBrand from "./StoreBrand";
import { StoreStatus } from "./StoreUI";

export default function Home() {
  return (
    <main className="storefront store-home">
      <StoreHeader />
      <section className="store-hero store-container">
        <div className="store-hero-content">
          <p className="store-eyebrow">Top-up games in Brunei</p>
          <h1>LEVEL UP<br /><span>YOUR GAME</span></h1>
          <p className="store-hero-copy"><span className="store-desktop-copy">Fast, secure, and hassle-free top-ups<br />for your favourite games.</span><span className="store-mobile-copy">Top up, play more.</span></p>
          <a href="#popular" className="store-action">Shop Now <span aria-hidden="true">→</span></a>
        </div>
      </section>
      <section className="store-trust store-container" aria-label="Shopping with Ruang Digital">
        {[["bolt", "Fast Checkout", "Simple steps to place your order"], ["shield", "Secure Payment", "Safe and trusted checkout"], ["support", "Local Support", "Real support, close to home"]].map(([icon, title, copy]) => <div key={title}><StoreIcon name={icon} size={32} /><div><h2>{title}</h2><p>{copy}</p></div></div>)}
      </section>
      <GamesSection />
      <Suspense fallback={<div className="store-container"><StoreStatus>Loading products...</StoreStatus></div>}><PopularProductsSection /></Suspense>
      <section id="how-it-works" className="store-how">
        <div className="store-container store-how-grid">
          <div><p className="store-eyebrow">Simple and straightforward</p><h2>Less worry.<br /><span>More gaming.</span></h2><p>Choose your item, check the details, then follow the checkout steps to place your order.</p></div>
          <ol>{[["Find your product", "Choose a game, top-up or digital item."], ["Review your order", "Check your selection and player details."], ["Place your order", "Complete payment and send your receipt."]].map(([title, body], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
        </div>
      </section>
      <StoreBottomNav />
      <footer className="store-container store-footer"><div><StoreBrand /><p>Your game. Your world. Your space.</p></div><p>© 2026 Ruang Digital. All rights reserved.</p></footer>
    </main>
  );
}
