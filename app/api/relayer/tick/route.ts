import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/contracts/near/relayer/config";
import { RelayerRunner } from "@/contracts/near/relayer/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let inFlightTick: Promise<unknown> | null = null;

function readBearerToken(request: NextRequest): string {
    const header = request.headers.get("authorization") || request.headers.get("Authorization");
    if (!header) return "";
    const [scheme, value] = header.split(" ");
    if (String(scheme || "").toLowerCase() !== "bearer") return "";
    return String(value || "").trim();
}

function readExpectedSecret(): string {
    return String(
        process.env.CRON_SECRET
        || process.env.RELAYER_CRON_SECRET
        || "",
    ).trim();
}

function isAuthorized(request: NextRequest): boolean {
    const expectedSecret = readExpectedSecret();
    if (!expectedSecret) return true;

    const bearer = readBearerToken(request);
    if (bearer && bearer === expectedSecret) return true;

    const tokenParam = request.nextUrl.searchParams.get("token");
    if (tokenParam && tokenParam.trim() === expectedSecret) return true;

    return false;
}

async function handleTick(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json(
            {
                ok: false,
                error: "Unauthorized",
                hint: "Set CRON_SECRET (or RELAYER_CRON_SECRET) and send Bearer token.",
            },
            { status: 401 },
        );
    }

    if (inFlightTick) {
        const activeResult = await inFlightTick;
        return NextResponse.json(
            {
                ok: true,
                reusedInFlightRun: true,
                result: activeResult,
            },
            { status: 200 },
        );
    }

    const tickPromise = (async () => {
        const config = loadConfig();
        const runner = await RelayerRunner.init(config);
        const result = await runner.runOnce();
        return {
            ...result,
            contractId: config.contractId,
            networkId: config.networkId,
            rpcUrl: config.rpcUrl,
            polledAt: new Date().toISOString(),
        };
    })();

    inFlightTick = tickPromise;
    try {
        const result = await tickPromise;
        return NextResponse.json({ ok: true, result }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
        console.log(`[relayer] tick failed: ${message}`);
        return NextResponse.json(
            {
                ok: false,
                error: message,
            },
            { status: 500 },
        );
    } finally {
        inFlightTick = null;
    }
}

export async function GET(request: NextRequest) {
    return handleTick(request);
}

export async function POST(request: NextRequest) {
    return handleTick(request);
}

