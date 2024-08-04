import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";

const useUmi = () => {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;

  if (!rpc) {
    alert("No NEXT_PUBLIC_RPC_URL provided in ENV");
    throw new Error("No NEXT_PUBLIC_RPC_URL provided in ENV");
  }

  const wallet = useWallet();

  const umi = useMemo(
    () => createUmi(rpc).use(walletAdapterIdentity(wallet)),
    // add any additional program imports here
    // example:
    // .use(mplTokenMetadata())
    [rpc, wallet]
  );

  return umi;
};
export default useUmi;
