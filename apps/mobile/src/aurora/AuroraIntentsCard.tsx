import { View, Text } from "react-native";
import { AuroraIntentsCard as AuroraExecutionForm } from "./AuroraExecutionForm";
import { Badge, Disclosure, Notice, ui } from "../experience/ui";

/** Route education only. The existing SDK, signer and execution form are unchanged. */
export function AuroraIntentsCard() {
  return <View style={{ gap: 18 }}>
    <View style={ui.card} testID="aurora-funding-boundary">
      <Badge>No MON top-up for Aurora destination execution</Badge>
      <Text accessibilityRole="header" style={ui.heading}>Pay from the money you already hold</Text>
      <Text style={ui.body}>Choose “Any wallet / exchange” below to fund the quoted Base USDC deposit directly from your existing source. Your Cherry passkey account does not need AUSD, MON or Base ETH in this mode.</Text>
      <Notice>You still need the payment amount in Base USDC at the source. A source-wallet network fee or exchange withdrawal fee can apply. Aurora quotes its destination gas and service costs; this is not a free payment.</Notice>
      <Disclosure title="Why does the other flow ask me to load money?">
        <Text style={ui.body}>Supplier payments uses a direct Monad Testnet AUSD transfer. Its AUSD faucet request and transfer need test MON. That flow does not call Aurora and is not made gasless by adding the Aurora API key.</Text>
        <Text style={ui.body}>“This passkey on Base” is another direct source-transfer option: it requires Base USDC and Base ETH in that passkey wallet. Source gas sponsorship has not been added to it.</Text>
      </Disclosure>
      <Disclosure title="Keep the same wallet between payments">
        <Text style={ui.body}>Use “Use existing passkey” and select the same credential. Creating another passkey, or recovering a different one, can open a different wallet address. Check the address before moving funds; signing in does not transfer balances between wallets.</Text>
        <Text style={ui.body}>Never put the AUSD or USDC token contract into Recipient. Use the recipient's verified wallet address on the destination network.</Text>
      </Disclosure>
    </View>
    <AuroraExecutionForm />
  </View>;
}
