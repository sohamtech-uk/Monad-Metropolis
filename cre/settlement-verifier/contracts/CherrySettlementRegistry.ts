import {
  decodeFunctionResult,
  encodeFunctionData,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  bytesToHex,
  encodeCallMsg,
  EVMClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
} from "@chainlink/cre-sdk";

export const CHERRY_SETTLEMENT_REGISTRY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "payer", type: "address" },
      { internalType: "bytes32", name: "paymentReference", type: "bytes32" }
    ],
    name: "settlementFor",
    outputs: [
      { internalType: "bytes32", name: "paymentTxHash", type: "bytes32" },
      { internalType: "address", name: "recordedPayer", type: "address" },
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint64", name: "recordedAt", type: "uint64" }
    ],
    stateMutability: "view",
    type: "function"
  }
] as const;

export type SettlementForResult = readonly [
  paymentTxHash: Hex,
  recordedPayer: Address,
  recipient: Address,
  asset: Address,
  amount: bigint,
  recordedAt: bigint
];

export class CherrySettlementRegistry {
  constructor(
    private readonly client: EVMClient,
    public readonly address: Address,
  ) {}

  settlementFor(
    runtime: Runtime<unknown>,
    payer: Address,
    paymentReference: Hex,
  ): SettlementForResult {
    const callData = encodeFunctionData({
      abi: CHERRY_SETTLEMENT_REGISTRY_ABI,
      functionName: "settlementFor",
      args: [payer, paymentReference],
    });

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: this.address,
          data: callData,
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result();

    return decodeFunctionResult({
      abi: CHERRY_SETTLEMENT_REGISTRY_ABI,
      functionName: "settlementFor",
      data: bytesToHex(result.data),
    }) as SettlementForResult;
  }
}
