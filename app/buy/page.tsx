import { Suspense } from "react";
import BuyFlow from "@/components/BuyFlow";

export default function BuyPage() {
    return (
        <Suspense fallback={<div className="text-sm text-gray-400">Loading buy flow...</div>}>
            <BuyFlow />
        </Suspense>
    );
}
