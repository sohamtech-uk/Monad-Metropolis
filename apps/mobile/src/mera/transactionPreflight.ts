/** Pure policy plus injected read-only estimates. Never signs or sends a transaction. */
export type PaymentInfrastructure = Readonly<{
  ausdAddress: string;
  ausdFaucetAddress?: string | null;
  settlementRegistryAddress?: string | null;
}>;

export function assertPaymentRecipient(
  recipient: string,
  infrastructure: PaymentInfrastructure,
): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    throw new Error("Enter the recipient's Monad wallet address, not a token contract address.");
  }
  const address = recipient.toLowerCase();
  if (address === "0x" + "0".repeat(40)) {
    throw new Error("The zero address cannot receive this Cherry Pay payment.");
  }
  const forbidden: ReadonlyArray<readonly [string | null | undefined, string]> = [
    [infrastructure.ausdAddress, "the AUSD token contract"],
    [infrastructure.ausdFaucetAddress, "the Agora test-token faucet"],
    [infrastructure.settlementRegistryAddress, "the settlement registry"],
  ];
  for (const [candidate, label] of forbidden) {
    if (candidate && candidate.toLowerCase() === address) {
      throw new Error(
        "Recipient is " + label + ", not your payee's wallet. End this session, enter the intended recipient's verified Monad wallet address, and approve it again. No payment was submitted.",
      );
    }
  }
  // Do not ban arbitrary contract wallets: only the configured infrastructure.
}

export type EstimatedFees = Readonly<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}>;
export type CheckedGas = EstimatedFees & Readonly<{
  gas: bigint;
  type: "eip1559";
  gasPrice: undefined;
  blobs: undefined;
  blobVersionedHashes: undefined;
  maxFeePerBlobGas: undefined;
  kzg: undefined;
  authorizationList: undefined;
}>;

export function formatMon(wei: bigint): string {
  if (wei < 0n) throw new Error("MON balance cannot be negative.");
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return whole.toString() + (fraction ? "." + fraction : "");
}

export function requireGasBudget(
  balance: bigint,
  gas: bigint,
  fees: EstimatedFees,
  action: string,
  payer: string,
): CheckedGas {
  if (balance < 0n || gas <= 0n || fees.maxFeePerGas <= 0n ||
      fees.maxPriorityFeePerGas < 0n || fees.maxPriorityFeePerGas > fees.maxFeePerGas) {
    throw new Error("Unable to obtain a valid MON transaction-fee estimate. Nothing was signed; retry the fee check.");
  }
  const required = gas * fees.maxFeePerGas;
  if (balance < required) {
    throw new Error(
      "Not enough MON for gas to " + action + ". Available: " + formatMon(balance) +
      " MON; maximum fee budget for this transaction: " + formatMon(required) +
      " MON; shortfall: " + formatMon(required - balance) + " MON. Fund sender " +
      payer + " with Monad testnet MON and refresh balances. AUSD cannot pay this gas fee. " +
      "Request Agora test AUSD adds tokens, not MON. No transaction was signed by this check.",
    );
  }
  // Simulation returns a transaction-type union. Pin the actual write to type 2
  // and explicitly clear fields from incompatible legacy/blob/7702 envelopes.
  return Object.freeze({
    gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    type: "eip1559", gasPrice: undefined, blobs: undefined,
    blobVersionedHashes: undefined, maxFeePerBlobGas: undefined,
    kzg: undefined, authorizationList: undefined,
  });
}

function isInsufficientNativeBalance(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 10 && current && typeof current === "object"; depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    const item = current as Record<string, unknown>;
    for (const key of ["shortMessage", "details", "message"]) {
      if (typeof item[key] === "string" &&
          /signer had insufficient balance|insufficient funds|insufficient balance|exceeds the balance/i.test(item[key])) {
        return true;
      }
    }
    current = item.cause;
  }
  return false;
}

export async function checkContractGas(options: Readonly<{
  estimateGas: () => Promise<bigint>;
  estimateFees: () => Promise<EstimatedFees>;
  getBalance: () => Promise<bigint>;
  action: string;
  payer: string;
}>): Promise<CheckedGas> {
  try {
    const [gas, fees] = await Promise.all([options.estimateGas(), options.estimateFees()]);
    const balance = await options.getBalance();
    return requireGasBudget(balance, gas, fees, options.action, options.payer);
  } catch (error) {
    if (isInsufficientNativeBalance(error)) {
      // Do not render a signed transaction/RPC payload as payment instructions.
      throw new Error(
        "Not enough native MON to " + options.action + ". Fund sender " + options.payer +
        " on Monad testnet, then refresh balances. Your AUSD balance cannot pay gas; " +
        "the Agora AUSD faucet also requires MON. No transaction was signed by this check.",
      );
    }
    throw error;
  }
}
