import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { CONFIG } from "@/lib/constants";

const RPC_URL = CONFIG.rpcUrl;
const PROGRAM_ID = new PublicKey(CONFIG.kicktickProgramId);
console.log("PROGRAM_ID", PROGRAM_ID.toBase58());

function deriveConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("config")],
    programId,
  );
}

export function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const { publicKey, connected } = useWallet();
  console.log("publicKey", publicKey?.toBase58(), "connected", connected);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setIsAdmin(false);
      return;
    }

    async function check() {
      try {
        const connection = new Connection(RPC_URL, "confirmed");
        const [configPda] = deriveConfigPda(PROGRAM_ID);
        console.log("configPda", configPda.toBase58());

        const accountInfo = await connection.getAccountInfo(configPda);
        console.log("accountInfo exists:", !!accountInfo);

        if (!accountInfo) {
          console.log("Config PDA not found!");
          setIsAdmin(false);
          return;
        }

        console.log("accountInfo data length:", accountInfo.data.length);
        const adminPubkey = new PublicKey(accountInfo.data.slice(8, 40));
        console.log("adminPubkey", adminPubkey.toBase58());
        console.log("publicKey equals admin:", publicKey?.equals(adminPubkey));
        setIsAdmin(publicKey !== null && publicKey.equals(adminPubkey));
      } catch (err) {
        console.error("check() error:", err);
        setIsAdmin(false);
      }
    }

    check();
  }, [publicKey, connected]);

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">Checking admin access...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-400 mb-2">Access Denied</h2>
          <p className="text-gray-400 text-sm">
            Connected wallet is not the contract admin.
            <br />
            Connect the admin wallet to access this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
