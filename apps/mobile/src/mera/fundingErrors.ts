/** Read nested RPC errors without leaking request payloads/signatures to the UI.
 * These messages do not sponsor gas, create funds or trigger a retry.
 */
export function fundingErrorMessage(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  const messages: string[] = [];
  for (let depth = 0; depth < 8 && current != null && !seen.has(current); depth++) {
    seen.add(current);
    if (typeof current === "string") { messages.push(current.slice(0, 12000)); break; }
    if (typeof current !== "object") break;
    const item = current as Record<string, unknown>;
    for (const field of ["name", "message", "shortMessage", "details"]) {
      if (typeof item[field] === "string") messages.push((item[field] as string).slice(0, 12000));
    }
    current = item.cause;
  }
  const text = messages.join("\n");
  const nativeFundsError = /signer had insufficient balance|insufficient funds for gas|insufficientfundserror|no MON for gas|MON balance for gas|no Base ETH for|insufficient native balance/i.test(text);
  if (!nativeFundsError) return null;
  if (/requestFunds|AUSD testnet faucet|Agora AUSD.*faucet/i.test(text)) {
    return "The AUSD faucet request cannot be sent because this sender does not have enough MON for its network fee. This is a testnet funding transaction, not a failed passkey or an Aurora payment. Stop retrying the faucet. Aurora is a separate Base USDC → Monad USDC route with destination gas handled in its quote. Reuse the same previously funded passkey; creating a new one can open a different empty wallet.";
  }
  if (/mainnet\.base\.org|Base ETH|chain.?8453/i.test(text)) {
    return "The source transfer needs Base ETH for its network fee. This passkey-on-Base mode is not sponsored. The external wallet/exchange option avoids funding the Cherry passkey wallet, but that source wallet or exchange can still charge a fee. Aurora handles the destination-chain gas, not this direct source transfer.";
  }
  if (/monad|MON for gas|MON balance for gas/i.test(text)) {
    return "This direct Monad transaction needs MON for its network fee; it is not an Aurora-sponsored transaction. Reuse the same previously funded wallet. For the separate Base USDC → Monad USDC route, open Pay from any chain; do not repeat this transaction assuming Aurora will pay its gas.";
  }
  return "The sender does not have enough native network currency for this transaction's gas fee. This is a transaction-funding issue, not a passkey-creation failure. Check the network, the sender address and the payment route before trying again; the Aurora key does not sponsor unrelated transactions.";
}
