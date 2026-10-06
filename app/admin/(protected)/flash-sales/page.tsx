import { FlashSalesManager } from "./flash-sales-manager";
import { HelpBox } from "../../_ui/client";

export const dynamic = "force-dynamic";

export default function AdminFlashSalesPage() {
  return (
    <>
      <HelpBox id="flash">
        <ol>
          <li>Press <strong>New sale</strong>, give it a name, choose the discount and when it starts and ends.</li>
          <li>Choose all products, or just the ones you pick.</li>
          <li>It turns on and off by itself. The shop shows the lower price and a countdown, and shoppers who saved the item get an alert.</li>
        </ol>
      </HelpBox>
      <FlashSalesManager />
    </>
  );
}
