"use client";

import { Icon } from "../../../../_ui/icons";

export function PrintButton() {
  return (
    <button type="button" className="a-btn a-btn-primary" onClick={() => window.print()}>
      <Icon name="print" /> Print slip
    </button>
  );
}
