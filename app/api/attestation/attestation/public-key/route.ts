import { NextResponse } from "next/server";
import { getAttestationPublicKeyView } from "@/lib/server/attestation-service";

export const runtime = "nodejs";

export async function GET() {
    return NextResponse.json(getAttestationPublicKeyView());
}
