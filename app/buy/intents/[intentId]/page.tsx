import { Suspense } from "react";
import BuyFlow from "@/components/BuyFlow";

interface BuyIntentRoutePageProps {
    params: Promise<{ intentId?: string }> | { intentId?: string };
}

export default async function BuyIntentRoutePage({ params }: BuyIntentRoutePageProps) {
    const resolvedParams = await Promise.resolve(params);
    const intentId = decodeURIComponent(String(resolvedParams.intentId || "")).trim();
    return (
        <Suspense fallback={<div className="text-sm text-gray-400">Loading intent...</div>}>
            <BuyFlow initialIntentId={intentId} />
        </Suspense>
    );
}
