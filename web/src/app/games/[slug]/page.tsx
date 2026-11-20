import { Suspense } from "react";
import StoreHeader from "../../StoreHeader";
import StoreBottomNav from "../../StoreBottomNav";
import { PopularProductsSection } from "../../StoreSections";
import { StoreStatus } from "../../StoreUI";
import RequestGameCta from "../../RequestGameCta";

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <main className="storefront store-game">
    <StoreHeader variant="interior" />
    <Suspense fallback={<div className="store-container store-section"><StoreStatus>Loading game...</StoreStatus></div>}>
      <PopularProductsSection key={slug} gameSlug={slug} />
    </Suspense>
    <RequestGameCta compact />
    <StoreBottomNav />
  </main>;
}
