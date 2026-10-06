import type { Metadata } from "next";
import { StoreFooter } from "../_components/store-footer";
import { WishlistView } from "./wishlist-view";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false, follow: true } };

export default function WishlistPage() {
  return (
    <main className="page-fade-in">
      <header className="listing-head">
        <h1 className="page-title">Wishlist</h1>
        <p>Pieces you&apos;ve saved on this device.</p>
      </header>
      <WishlistView />
      <StoreFooter />
    </main>
  );
}
