"use client";

import { toggleWishlist, useWishlist } from "@/lib/wishlist";

/** Heart toggle. `variant="card"` floats over a product image; `"inline"` sits beside text. */
export function WishlistButton({ productId, name, variant = "card" }: { productId: string; name: string; variant?: "card" | "inline" }) {
  const saved = useWishlist().includes(productId);
  return (
    <button
      type="button"
      className={`wish-btn wish-${variant}${saved ? " is-saved" : ""}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      onClick={(event) => {
        // The card image is a link – don't navigate when the heart is tapped.
        event.preventDefault();
        event.stopPropagation();
        toggleWishlist(productId);
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M12 21s-7.5-4.6-10.2-9.1C.2 8.9 1.4 5 5 4c2.4-.7 4.6.4 7 3 2.4-2.6 4.6-3.7 7-3 3.6 1 4.8 4.9 3.2 7.9C19.5 16.4 12 21 12 21z" strokeLinejoin="round" />
      </svg>
      {variant === "inline" && <span>{saved ? "Saved to wishlist" : "Add to wishlist"}</span>}
    </button>
  );
}
