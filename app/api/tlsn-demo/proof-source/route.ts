import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalize(value: string | null): string {
    return String(value || "").trim();
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const intentId = normalize(url.searchParams.get("intentId"));
    const platform = normalize(url.searchParams.get("platform"));
    const tagname = normalize(url.searchParams.get("tagname"));
    const memo = normalize(url.searchParams.get("memo"));
    const amount = normalize(url.searchParams.get("amount"));
    const currency = normalize(url.searchParams.get("currency"));
    const seller = normalize(url.searchParams.get("seller"));

    return NextResponse.json(
        {
            intentId,
            platform,
            tagname,
            memo,
            amount,
            currency,
            seller,
            proof_source: "anypay_tlsn_demo_v1",
        },
        {
            headers: {
                "cache-control": "no-store",
            },
        },
    );
}
