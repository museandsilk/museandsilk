import "./admin.css";

// Admin-only styles live here so storefront visitors never download them.
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
