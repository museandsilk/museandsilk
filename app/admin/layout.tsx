import "./admin.css";
import { cookies } from "next/headers";
import { Icon } from "./_ui/icons";

// Admin-only styles live here so storefront visitors never download them.
// Comfort settings (light / night colours, larger text) are remembered in cookies and applied on the server
// so the page never flashes the wrong colours.
export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const themeCookie = jar.get("adm-theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "night" || themeCookie === "auto" ? themeCookie : "auto";
  const text = jar.get("adm-text")?.value === "large" ? "large" : "normal";
  return (
    <div className="adm" data-theme={theme} data-text={text}>
      {children}
      {/* The panel is built for a laptop or desktop; on a phone this friendly screen replaces it (see admin.css). */}
      <div className="adm-small-screen" role="note">
        <div>
          <Icon name="laptop" size={56} />
          <h1>Please open this on a laptop or computer</h1>
          <p>The shop manager is made for a bigger screen, so that you can see orders, photos and numbers clearly. Open this same address on your laptop and sign in there.</p>
          <p>Customers can still see your shop on their phones as usual.</p>
        </div>
      </div>
    </div>
  );
}
