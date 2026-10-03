// Test-only browser entry. Built under build/live-graphics, never apps/mobile/dist.
// Permanent fixture banner: screenshots/recordings are not evidence of a real payment.
import React from "react";
import { createRoot } from "react-dom/client";
import { TransactionLiveCard } from "../apps/mobile/src/envio/TransactionLiveCard";
import type { TransferProgress } from "../apps/mobile/src/mera/transferProgress";
import { NETWORKS } from "../apps/mobile/src/envio/live";
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const payment: TransferProgress = {
  hash: hash(5), reference: hash(9), chainId: 10143, asset: NETWORKS["monad-testnet"].asset,
  sender: "0x" + "1".repeat(40), recipient: "0x" + "2".repeat(40), amount: 5_000_000n,
  submittedAtMs: Date.now() - 3000, receipt: null, correlation: null,
};
function Preview() {
  return <div style={{ maxWidth: 1220, margin: "0 auto", padding: 14, fontFamily: "Arial, sans-serif" }}>
    <div role="note" style={{ background: "#FFF0C3", color: "#604300", padding: 14, borderRadius: 10,
      fontWeight: 700, fontSize: 12, lineHeight: "18px", marginBottom: 14, position: "sticky", top: 0, zIndex: 10 }}>
      OFFLINE UI TEST FIXTURE — NOT A LIVE PAYMENT. Values supplied by the browser test.
    </div>
    <TransactionLiveCard progress={payment} active indexEndpoint="https://index-fixture.test/graphql" onIndexed={() => undefined} />
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
