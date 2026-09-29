import { parseAbi, type Address, type Hex } from "viem";

const CHERRY_SETTLEMENT_REGISTRY_ABI = parseAbi([
  "event BusinessPaymentCorrelated(bytes32 indexed paymentReference, bytes32 indexed paymentTxHash, address indexed payer, address recipient, address asset, uint256 amount, uint64 recordedAt)",
  "function recordSettlement(bytes32 paymentReference, bytes32 paymentTxHash, address recipient, address asset, uint256 amount)",
  "function hasSettlement(address payer, bytes32 paymentReference) view returns (bool)",
  "function settlementFor(address payer, bytes32 paymentReference) view returns (bytes32 paymentTxHash, address recordedPayer, address recipient, address asset, uint256 amount, uint64 recordedAt)",
  "function correlationKey(address payer, bytes32 paymentReference) pure returns (bytes32)",
]);

type SettlementCorrelationStatus =
  | "confirmed"
  | "not_configured"
  | "failed";

type SettlementCorrelationResult = Readonly<{
  status: SettlementCorrelationStatus;
  registryAddress: Address | null;
  paymentReference: Hex;
  paymentTxHash: Hex;
  correlationTxHash: Hex | null;
  correlationBlockNumber: bigint | null;
  correlationUrl: string | null;
  error: string | null;
}>;

export { CHERRY_SETTLEMENT_REGISTRY_ABI };
export type {
  SettlementCorrelationResult,
  SettlementCorrelationStatus,
};
