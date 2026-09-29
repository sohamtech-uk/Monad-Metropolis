import {
  consensusIdenticalAggregation,
  cre,
  getNetwork,
  json,
  type CronPayload,
  type HTTPSendRequester,
  type Runtime,
  text,
} from "@chainlink/cre-sdk";
import {
  getAddress,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
  type Hex,
} from "viem";

import { CherrySettlementRegistry } from "./contracts/CherrySettlementRegistry";

type Config = {
  schedule: string;
  chainSelectorName: string;
  registryAddress: string;
  ausdAddress: string;
  ausdDecimals: number;
  envioGraphqlEndpoint: string;
  cherryMoneyBaseUrl: string;
};

type EnvioSettlement = {
  paymentReference: Hex;
  paymentTxHash: Hex;
  correlationTxHash: Hex;
  payer: Address;
  recipient: Address;
  asset: Address;
  amount: string;
  settledAt: string;
  registryAddress: Address;
  verified: boolean;
};

type CherryDraft = {
  id: string;
  payee: string;
  amount: number;
  reference: string;
  purpose: string;
  currency: string;
  status: "draft_only";
  moneyMoved: false;
  source: "cherry-money-production";
};

type CherryBootstrap = {
  connected: true;
  source: "cherry-money-production";
  company: {
    id: string;
    name: string;
    currency: string;
  };
  paymentDrafts: CherryDraft[];
};

type ReconciliationEvidence = {
  status: "ready_for_reconciliation" | "needs_attention" | "no_verified_settlement";
  generatedAt: string;
  settlement: EnvioSettlement | null;
  matchedDraft: CherryDraft | null;
  checks: {
    envioVerified: boolean;
    registryStateMatches: boolean;
    trustedAssetMatches: boolean;
    cherryDraftMatched: boolean;
    sourceAmountMatchesAusdWhenComparable: boolean | null;
  };
  notes: string[];
};

const ENVIO_QUERY = `
  query CreLatestVerifiedSettlement {
    Settlement(
      where: { verified: { _eq: true } }
      order_by: { settledAt: desc }
      limit: 1
    ) {
      paymentReference
      paymentTxHash
      correlationTxHash
      payer
      recipient
      asset
      amount
      settledAt
      registryAddress
      verified
    }
  }
`;

function fetchLatestVerifiedSettlement(
  requester: HTTPSendRequester,
  config: Config,
): string {
  const response = requester
    .sendRequest({
      url: config.envioGraphqlEndpoint,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: Buffer.from(
        JSON.stringify({
          query: ENVIO_QUERY,
        }),
      ).toString("base64"),
      cacheSettings: { store: true, maxAge: "10s" },
    })
    .result();

  if (response.statusCode >= 300) {
    throw new Error(
      "Envio GraphQL failed: " +
        response.statusCode.toString() +
        " " +
        text(response),
    );
  }

  const payload = json(response) as {
    data?: { Settlement?: EnvioSettlement[] };
    errors?: unknown[];
  };

  if (payload.errors && payload.errors.length > 0) {
    throw new Error("Envio GraphQL returned errors: " + JSON.stringify(payload.errors));
  }

  const settlement = payload.data?.Settlement?.[0] ?? null;
  return JSON.stringify(settlement);
}

function fetchCherryMoneyBootstrap(
  requester: HTTPSendRequester,
  config: Config,
  bearerToken: string,
): string {
  const baseUrl = config.cherryMoneyBaseUrl.replace(/\/$/, "");
  const response = requester
    .sendRequest({
      url: baseUrl + "/api/webmcp/bootstrap",
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: "Bearer " + bearerToken,
      },
      cacheSettings: { store: false },
    })
    .result();

  if (response.statusCode >= 300) {
    throw new Error(
      "Cherry Money bootstrap failed: " +
        response.statusCode.toString() +
        " " +
        text(response),
    );
  }

  const payload = json(response) as CherryBootstrap;

  if (
    payload.connected !== true ||
    payload.source !== "cherry-money-production" ||
    !Array.isArray(payload.paymentDrafts)
  ) {
    throw new Error("Cherry Money returned an unexpected bootstrap contract.");
  }

  return JSON.stringify(payload);
}

function paymentReferenceForDraft(draft: CherryDraft): Hex {
  return keccak256(
    toBytes(
      [
        "cherry-money-payment-draft",
        draft.id,
        draft.payee,
        draft.currency,
        Number(draft.amount).toFixed(2),
        draft.reference ?? "",
      ].join(":"),
    ),
  );
}

function addressesEqual(left: string, right: string): boolean {
  return getAddress(left) === getAddress(right);
}

function verifyOnChainRegistry(
  runtime: Runtime<Config>,
  config: Config,
  settlement: EnvioSettlement,
): boolean {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error("CRE network not found: " + config.chainSelectorName);
  }

  const evmClient = new cre.capabilities.EVMClient(
    network.chainSelector.selector,
  );
  const registry = new CherrySettlementRegistry(
    evmClient,
    getAddress(config.registryAddress),
  );

  const [
    paymentTxHash,
    recordedPayer,
    recipient,
    asset,
    amount,
  ] = registry.settlementFor(
    runtime,
    getAddress(settlement.payer),
    settlement.paymentReference,
  );

  return (
    paymentTxHash.toLowerCase() === settlement.paymentTxHash.toLowerCase() &&
    addressesEqual(recordedPayer, settlement.payer) &&
    addressesEqual(recipient, settlement.recipient) &&
    addressesEqual(asset, settlement.asset) &&
    amount === BigInt(settlement.amount)
  );
}

export function verifyLatestSettlement(
  runtime: Runtime<Config>,
  _payload?: CronPayload,
): string {
  const config = runtime.config;
  const httpClient = new cre.capabilities.HTTPClient();

  runtime.log("CRE: loading latest Envio-verified Monad settlement.");

  const settlementJson = httpClient
    .sendRequest(
      runtime,
      fetchLatestVerifiedSettlement,
      consensusIdenticalAggregation<string>(),
    )(config)
    .result();

  const settlement = JSON.parse(settlementJson) as EnvioSettlement | null;

  if (!settlement) {
    const empty: ReconciliationEvidence = {
      status: "no_verified_settlement",
      generatedAt: new Date().toISOString(),
      settlement: null,
      matchedDraft: null,
      checks: {
        envioVerified: false,
        registryStateMatches: false,
        trustedAssetMatches: false,
        cherryDraftMatched: false,
        sourceAmountMatchesAusdWhenComparable: null,
      },
      notes: ["Envio has not indexed a verified settlement yet."],
    };
    return JSON.stringify(empty, null, 2);
  }

  const envioVerified = settlement.verified === true;
  const trustedAssetMatches = addressesEqual(
    settlement.asset,
    config.ausdAddress,
  );
  const registryStateMatches = verifyOnChainRegistry(
    runtime,
    config,
    settlement,
  );

  runtime.log(
    "CRE: direct Monad registry read matches Envio=" +
      registryStateMatches.toString(),
  );

  const token = runtime
    .getSecret({ id: "CHERRY_MONEY_BEARER_TOKEN" })
    .result().value;

  const cherryJson = httpClient
    .sendRequest(
      runtime,
      fetchCherryMoneyBootstrap,
      consensusIdenticalAggregation<string>(),
    )(config, token)
    .result();

  const cherry = JSON.parse(cherryJson) as CherryBootstrap;
  const matchedDraft =
    cherry.paymentDrafts.find(
      (draft) =>
        paymentReferenceForDraft(draft).toLowerCase() ===
        settlement.paymentReference.toLowerCase(),
    ) ?? null;

  const cherryDraftMatched = matchedDraft !== null;

  let sourceAmountMatchesAusdWhenComparable: boolean | null = null;
  const notes: string[] = [];

  if (matchedDraft) {
    const currency = matchedDraft.currency.toUpperCase();

    if (currency === "USD" || currency === "AUSD") {
      const expected = parseUnits(
        Number(matchedDraft.amount).toFixed(2),
        config.ausdDecimals,
      );
      sourceAmountMatchesAusdWhenComparable =
        expected === BigInt(settlement.amount);

      if (!sourceAmountMatchesAusdWhenComparable) {
        notes.push(
          "USD/AUSD Cherry Money source amount does not match the AUSD settlement amount.",
        );
      }
    } else {
      notes.push(
        "Source currency is " +
          currency +
          "; FX reconciliation needs a separately persisted quote before accounting mutation.",
      );
    }
  } else {
    notes.push(
      "No active Cherry Money payment draft hashes to this settlement reference.",
    );
  }

  if (!registryStateMatches) {
    notes.push(
      "Direct Monad registry state does not match the Envio settlement.",
    );
  }

  if (!trustedAssetMatches) {
    notes.push(
      "Settlement asset is not the configured Agora AUSD contract.",
    );
  }

  const amountReady =
    sourceAmountMatchesAusdWhenComparable === true;

  const ready =
    envioVerified &&
    registryStateMatches &&
    trustedAssetMatches &&
    cherryDraftMatched &&
    amountReady;

  if (ready) {
    notes.push(
      "Deterministic checks passed. Evidence is ready for a future reviewed Cherry Money settlement callback.",
    );
  }

  const evidence: ReconciliationEvidence = {
    status: ready ? "ready_for_reconciliation" : "needs_attention",
    generatedAt: new Date().toISOString(),
    settlement,
    matchedDraft,
    checks: {
      envioVerified,
      registryStateMatches,
      trustedAssetMatches,
      cherryDraftMatched,
      sourceAmountMatchesAusdWhenComparable,
    },
    notes,
  };

  runtime.log(
    "CRE verification complete: status=" +
      evidence.status +
      " paymentReference=" +
      settlement.paymentReference,
  );

  return JSON.stringify(evidence, null, 2);
}

export function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handler(
      cron.trigger({ schedule: config.schedule }),
      verifyLatestSettlement,
    ),
  ];
}

export type {
  CherryBootstrap,
  CherryDraft,
  Config,
  EnvioSettlement,
  ReconciliationEvidence,
};
