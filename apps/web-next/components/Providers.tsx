"use client";

import { useEffect } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { PrivyNearConnector } from "./PrivyNearConnector";

export default function Providers({ children }: { children: React.ReactNode }) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

    useEffect(() => {
        console.log("Privy App ID loaded:", appId ? "Yes (Hidden)" : "No");
    }, [appId]);

    return (
        <PrivyProvider
            appId={appId}
            config={{
                loginMethods: ["email", "wallet"],
                appearance: {
                    theme: "dark",
                    accentColor: "#676FFF",
                    showWalletLoginFirst: true,
                },
            }}
        >
            <PrivyNearConnector />
            {children}
        </PrivyProvider>
    );
}
