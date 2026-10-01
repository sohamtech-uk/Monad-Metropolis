const DEFAULT_RP_ID = "metropolis.cherrymoney.co.uk";

const browserHost =
  typeof globalThis.location?.hostname === "string"
    ? globalThis.location.hostname.trim()
    : "";

const rpId =
  browserHost === "" || browserHost === "localhost"
    ? browserHost || DEFAULT_RP_ID
    : browserHost;

export { rpId };
