import { NextResponse } from "next/server";
import {
    createAttestationFromWebhook,
    type VerifierWebhookPayload,
    validateWebhookSecret,
} from "@/lib/server/attestation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
    if (!validateWebhookSecret(request.headers)) {
        return NextResponse.json(
            { error: "invalid webhook secret" },
            { status: 401 },
        );
    }

    let payload: VerifierWebhookPayload;
    try {
        payload = (await request.json()) as VerifierWebhookPayload;
    } catch {
        return NextResponse.json(
            { error: "invalid JSON body" },
            { status: 400 },
        );
    }

    try {
        const record = createAttestationFromWebhook(payload);
        return NextResponse.json(record);
    } catch (error: unknown) {
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "failed to create attestation",
            },
            { status: 400 },
        );
    }
}
