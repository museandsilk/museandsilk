"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CardProduct } from "@/lib/commerce";
import { hasCustomerPushToken, pushSupport, registerCustomerPush, unregisterCustomerPush } from "@/lib/customer-push";
import { useLockedAction } from "@/lib/use-locked-action";
import { useWishlist } from "@/lib/wishlist";
import { ProductCard } from "../_components/store-components";

export function WishlistView() {
  const ids = useWishlist();
  const key = ids.join(",");
  const [products, setProducts] = useState<CardProduct[] | null>(null);
  const [alertsOn, setAlertsOn] = useState(false);
  const [support, setSupport] = useState<ReturnType<typeof pushSupport>>("unsupported");
  const [note, setNote] = useState("");
  const toggle = useLockedAction();

  useEffect(() => {
    // Browser-only capability / saved-subscription checks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(pushSupport());
    setAlertsOn(hasCustomerPushToken());
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProducts([]);
      return;
    }
    fetch(`/api/catalog/by-ids?ids=${key}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ products: CardProduct[] }>) : null))
      .then((data) => {
        if (!cancelled) setProducts(data?.products ?? []);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  async function switchAlerts() {
    await toggle.run(async () => {
      setNote("");
      if (alertsOn) {
        const ok = await unregisterCustomerPush();
        if (ok) setAlertsOn(false);
        else setNote("Couldn't turn alerts off — please try again.");
        return;
      }
      const result = await registerCustomerPush({ wishlist: ids, salesOptIn: true });
      if (result.ok) setAlertsOn(true);
      else setNote(result.error);
    });
  }

  const visible = (products ?? []).filter((product) => ids.includes(product.id));
  return (
    <section className="shop-shell">
      {support !== "unsupported" && (
        <div className="wish-alerts">
          <button type="button" className="button button-dark" disabled={toggle.pending || support === "blocked"} onClick={switchAlerts} aria-busy={toggle.pending}>
            {toggle.pending ? (
              <span className="busy-label">
                <i className="spinner spinner-light" /> Please wait…
              </span>
            ) : alertsOn ? (
              "Sale alerts: on — turn off"
            ) : (
              "Alert me when my wishlist goes on sale"
            )}
          </button>
          {support === "blocked" && <p className="form-message">Notifications are blocked in your browser settings.</p>}
          {note && <p className="form-message">{note}</p>}
        </div>
      )}

      {products === null && (
        <div className="product-grid" aria-busy="true">
          {ids.slice(0, 4).map((id) => (
            <div key={id} className="pcard">
              <div className="pcard-media skeleton" />
            </div>
          ))}
        </div>
      )}
      {products !== null && !visible.length && (
        <div className="cart-empty">
          <h2>Nothing saved yet.</h2>
          <p>Tap the heart on any piece to keep it here.</p>
          <Link className="button button-dark" href="/shop">
            Browse new arrivals
          </Link>
        </div>
      )}
      {visible.length > 0 && (
        <div className="product-grid">
          {visible.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
