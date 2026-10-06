import { DeliveryManager } from "./delivery-manager";
import { HelpBox } from "../../_ui/client";

export const dynamic = "force-dynamic";

export default function AdminDeliveryPage() {
  return (
    <>
      <HelpBox id="delivery">
        <ol>
          <li>Add an area for each delivery price, and type the city names it covers.</li>
          <li>Set the price and how many days delivery takes — customers see this at checkout.</li>
          <li>Free delivery above a certain order value is set in <strong>Settings</strong>.</li>
        </ol>
      </HelpBox>
      <DeliveryManager />
    </>
  );
}
