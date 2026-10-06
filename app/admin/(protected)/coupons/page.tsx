import { CouponsManager } from "./coupons-manager";
import { HelpBox } from "../../_ui/client";

export const dynamic = "force-dynamic";

export default function AdminCouponsPage() {
  return (
    <>
      <HelpBox id="coupons">
        <ol>
          <li>Press <strong>Add coupon</strong>, choose a code (like EID10) and how much it takes off.</li>
          <li>You can limit it to orders above a certain amount, or to a number of uses, or to dates.</li>
          <li>Switch a code off any time — customers can no longer use it.</li>
        </ol>
      </HelpBox>
      <CouponsManager />
    </>
  );
}
