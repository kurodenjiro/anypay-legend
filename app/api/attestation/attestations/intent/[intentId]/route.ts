import { NextResponse } from "next/server";
import { getAttestationByIntent } from "@/lib/server/attestation-service";

export const runtime = "nodejs";

interface RouteParams {
    params: Promise<{ intentId?: string }> | { intentId?: string };
}

export async function GET(_request: Request, { params }: RouteParams) {
    const resolved = await Promise.resolve(params);
    const intentId = decodeURIComponent(String(resolved.intentId || "")).trim();
    const record = getAttestationByIntent(intentId);
    if (!record) {
        return NextResponse.json(
            { error: "attestation not found for intent" },
            { status: 404 },
        );
    }
    return NextResponse.json(record);
}
