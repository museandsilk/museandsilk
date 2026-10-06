import { CampaignManager } from "./campaign-manager";
import { HelpBox } from "../../_ui/client";

export const dynamic = "force-dynamic";

export default function AdminCampaignPage() {
  return (
    <>
      <HelpBox id="banners">
        <ol>
          <li>Add a wide picture (and a tall one for phones if you like) and the words you want on top.</li>
          <li>Banners show in order — the first one is the first customers see.</li>
          <li>You can switch a banner off without deleting it.</li>
        </ol>
      </HelpBox>
      <CampaignManager />
    </>
  );
}
