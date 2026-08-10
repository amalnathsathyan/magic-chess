const SOLANA_EXPLORER = "https://explorer.solana.com/tx";

export function solanaDevnetTxUrl(signature: string): string {
  return `${SOLANA_EXPLORER}/${signature}?cluster=devnet`;
}

export function magicBlockTxUrl(signature: string, rpcEndpoint: string): string {
  const endpoint = new URL(rpcEndpoint);
  if (
    endpoint.protocol !== "https:" ||
    (endpoint.hostname !== "magicblock.app" &&
      !endpoint.hostname.endsWith(".magicblock.app"))
  ) {
    throw new Error("Untrusted MagicBlock explorer endpoint");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  return `${SOLANA_EXPLORER}/${signature}?cluster=custom&customUrl=${encodeURIComponent(
    endpoint.toString().replace(/\/$/, "")
  )}`;
}
