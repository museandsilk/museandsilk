import Image from "next/image";
import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/admin-auth";
import { LogoutButton } from "./logout-button";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/collections", label: "Categories & Collections" },
  { href: "/admin/delivery", label: "Delivery Zones" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/campaign", label: "Campaign" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminUser("/admin");

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-mark" aria-label="Muse & Silk, view store">
          <Image src="/logo.png" alt="" width={48} height={48} priority />
        </Link>
        <nav>
          {navItems.map((item, index) => (
            <Link key={item.href} href={item.href}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-user">
          <span>{(user.displayName ?? user.email).slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user.displayName ?? user.email}</strong>
            <small>{user.role}</small>
          </div>
        </div>
        <LogoutButton />
      </aside>
      {children}
    </main>
  );
}
