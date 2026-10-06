import { getPublicSettings } from "@/lib/commerce";
import { CurrencyProvider, CurrencySwitcher } from "./_components/currency";
import { WhatsAppIcon } from "./_components/icons";
import { StoreHeader } from "./_components/store-header";
import { ServiceWorkerRegistrar } from "./_components/sw-register";

/** Shell shared by every storefront page: display-currency context, the floating WhatsApp
 * shortcut (bottom-left) and the currency switcher (bottom-right), as on the benchmark site. */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPublicSettings();
  const digits = settings.whatsappNumber.replace(/[^\d]/g, "");
  const chat = settings.whatsappChatUrl || (digits ? `https://wa.me/${digits}` : "");
  return (
    <CurrencyProvider>
      <StoreHeader />
      {children}
      <a
        className="float-whatsapp"
        href={chat || "/contact"}
        target={chat ? "_blank" : undefined}
        rel="noreferrer"
        aria-label="Chat with us on WhatsApp"
      >
        <WhatsAppIcon size={26} />
      </a>
      <CurrencySwitcher />
      <ServiceWorkerRegistrar />
    </CurrencyProvider>
  );
}
