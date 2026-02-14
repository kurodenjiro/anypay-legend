import { Suspense } from "react";
import SellFlow from "@/components/SellFlow";

export default function SellPage() {
    return (
        <Suspense fallback={<div className="text-sm text-gray-400">Loading sell flow...</div>}>
            <SellFlow />
        </Suspense>
    );
}
