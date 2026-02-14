import { NextResponse } from "next/server";
import { getAttestationBySession } from "@/lib/server/attestation-service";

export const runtime = "nodejs";

interface RouteParams {
    params: Promise<{ sessionId?: string }> | { sessionId?: string };
}

export async function GET(_request: Request, { params }: RouteParams) {
    const resolved = await Promise.resolve(params);
    const sessionId = String(resolved.sessionId || "").trim();
    const record = getAttestationBySession(sessionId);
    if (!record) {
        return NextResponse.json(
            { error: "attestation not found for session" },
            { status: 404 },
        );
    }
    return NextResponse.json(record);
}
