"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; countKey?: "orders" | "refunds" | "stock"; exact?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { items: [{ href: "/admin", label: "Home", icon: "home", exact: true }] },
  {
    label: "Sell",
    items: [
      { href: "/admin/orders", label: "Orders", icon: "orders", countKey: "orders" },
      { href: "/admin/refunds", label: "Refunds", icon: "refund", countKey: "refunds" },
      { href: "/admin/products", label: "Products", icon: "box" },
      { href: "/admin/stock", label: "Stock", icon: "grid", countKey: "stock" },
      { href: "/admin/collections", label: "Categories", icon: "folder" },
    ],
  },
  {
    label: "Grow",
    items: [
      { href: "/admin/flash-sales", label: "Flash sales", icon: "bolt" },
      { href: "/admin/coupons", label: "Discount codes", icon: "tag" },
      { href: "/admin/subscribers", label: "Email list", icon: "mail" },
    ],
  },
  {
    label: "Your website",
    items: [
      { href: "/admin/pictures", label: "Website pictures", icon: "image" },
      { href: "/admin/delivery", label: "Delivery charges", icon: "truck" },
      { href: "/admin/settings", label: "Settings", icon: "settings" },
    ],
  },
];

export const ALL_PAGES = NAV.flatMap((group) => group.items);

export function NavLinks({ counts }: { counts: Partial<Record<"orders" | "refunds" | "stock", number>> }) {
  const pathname = usePathname() || "";
  return (
    <nav className="adm-nav" aria-label="Main">
      {NAV.map((group, index) => (
        <div key={group.label ?? index} style={{ display: "grid", gap: 2 }}>
          {group.label && <p className="adm-nav-label">{group.label}</p>}
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const count = item.countKey ? counts[item.countKey] : 0;
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} prefetch={false}>
                <Icon name={item.icon} />
                {item.label}
                {count ? <span className="count" aria-label={`${count} waiting`}>{count > 99 ? "99+" : count}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
