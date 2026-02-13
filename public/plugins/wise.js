/// <reference types="@tlsn/plugin-sdk/src/globals" />
/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react-hooks/exhaustive-deps */

// Local TLSN verifier endpoints.
const VERIFIER_URL = "http://localhost:7047";
const PROXY_URL_BASE = "ws://localhost:7047/proxy?token=";

// Demo page host used for local proof generation.
const host = "localhost:3000";
const uiPath = "/tlsn-demo/payment";
const pageNeedle = `${host}${uiPath}`;

const config = {
    name: "Wise Demo Transfer Verifier",
    description: "Verifies demo transfer details using local TLSN verifier.",
    requests: [
        {
            method: "GET",
            host,
            pathname: uiPath,
            verifierUrl: VERIFIER_URL,
        },
    ],
    urls: [
        `http://${host}/*`,
        "http://localhost:3001/*",
    ],
};

function getVerificationInput() {
    const value = (globalThis && globalThis.VERIFICATION_INPUT) || "";
    return String(value || "").trim();
}

function pickFirst(input, keys) {
    if (!input || typeof input !== "object") return "";
    for (const key of keys) {
        const value = input[key];
        if (value === undefined || value === null) continue;
        const normalized = String(value).trim();
        if (normalized) return normalized;
    }
    return "";
}

function parseVerificationInput(rawInput) {
    const raw = String(rawInput || "").trim();
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const normalized = {};
            for (const [key, value] of Object.entries(parsed)) {
                normalized[String(key)] = String(value ?? "").trim();
            }
            return normalized;
        }
    } catch {
        // noop, fallback to query parsing
    }

    let query = raw;
    try {
        const url = new URL(raw);
        query = url.search.startsWith("?") ? url.search.slice(1) : "";
    } catch {
        if (raw.startsWith("?")) {
            query = raw.slice(1);
        }
    }

    const params = new URLSearchParams(query);
    const values = {};
    for (const [key, value] of params.entries()) {
        values[key] = value;
    }
    return values;
}

function buildProofContext() {
    const verificationInput = getVerificationInput();
    const parsed = parseVerificationInput(verificationInput);
    return {
        verificationInput,
        intentId: pickFirst(parsed, ["intentId", "intent_id", "intentHash", "intent_hash"]),
        memo: pickFirst(parsed, ["memo", "expectedMemo", "expected_memo"]),
        amount: pickFirst(parsed, ["amount", "expectedAmount", "expected_amount"]),
        currency: pickFirst(parsed, ["currency", "expectedCurrency", "expected_currency"]),
        platform: pickFirst(parsed, ["platform", "expectedPlatform", "expected_platform"]),
        tagname: pickFirst(parsed, ["tagname", "expectedTagname", "expected_tagname"]),
        seller: pickFirst(parsed, ["seller", "sellerId", "seller_id"]),
    };
}

function buildTargetUrl(context) {
    const params = new URLSearchParams();
    if (context.intentId) params.set("intentId", context.intentId);
    if (context.platform) params.set("platform", context.platform);
    if (context.tagname) params.set("tagname", context.tagname);
    if (context.memo) params.set("memo", context.memo);
    if (context.amount) params.set("amount", context.amount);
    if (context.currency) params.set("currency", context.currency);
    if (context.seller) params.set("seller", context.seller);
    const query = params.toString();
    return query ? `http://${host}${uiPath}?${query}` : `http://${host}${uiPath}`;
}

function expandUI() {
    setState("isMinimized", false);
}

function minimizeUI() {
    setState("isMinimized", true);
}

function openDemoPage() {
    const context = buildProofContext();
    const targetUrl = buildTargetUrl(context);
    openWindow(targetUrl);
}

function open() {
    openDemoPage();
}

function toggleMemoVerified() {
    const value = useState("memoVerified", false);
    setState("memoVerified", !value);
}

function togglePaymentConfirmed() {
    const value = useState("paymentConfirmed", false);
    setState("paymentConfirmed", !value);
}

function resetChecks() {
    setState("memoVerified", false);
    setState("paymentConfirmed", false);
}

function toErrorMessage(error) {
    if (error && typeof error === "object" && "message" in error) {
        return String(error.message || "Unknown verifier error");
    }
    if (typeof error === "string") return error;
    return "Unknown verifier error";
}

async function onClick() {
    const isRequestPending = useState("isRequestPending", false);
    if (isRequestPending) return;

    const memoVerified = useState("memoVerified", false);
    const paymentConfirmed = useState("paymentConfirmed", false);
    const pageDetected = useState("headerSeen", false);

    if (!memoVerified || !paymentConfirmed) {
        done(
            JSON.stringify({
                error: "Confirm memo and payment details before generating proof.",
            }),
        );
        return;
    }

    setState("isRequestPending", true);
    const context = buildProofContext();
    const targetUrl = buildTargetUrl(context);

    try {
        const headers = {
            Host: host,
            Connection: "close",
            "Accept-Encoding": "identity",
        };

        const resp = await prove(
            {
                url: targetUrl,
                method: "GET",
                headers,
            },
            {
                verifierUrl: VERIFIER_URL,
                proxyUrl: PROXY_URL_BASE + host,
                maxRecvData: 32768,
                maxSentData: 8192,
                sessionData: {
                    flow: "anypay-wise-demo-v1",
                    intentId: context.intentId,
                    expectedMemo: context.memo,
                    expectedAmount: context.amount,
                    expectedCurrency: context.currency,
                    expectedPlatform: context.platform || "wise",
                    expectedTagname: context.tagname,
                    seller: context.seller,
                    verificationInput: context.verificationInput,
                },
                handlers: [
                    { type: "SENT", part: "START_LINE", action: "REVEAL" },
                    { type: "RECV", part: "START_LINE", action: "REVEAL" },
                    {
                        type: "RECV",
                        part: "HEADERS",
                        action: "REVEAL",
                        params: { key: "content-type" },
                    },
                    {
                        type: "RECV",
                        part: "BODY",
                        action: "REVEAL",
                        params: { from: 0, to: 8192 },
                    },
                ],
            },
        );

        done(
            JSON.stringify({
                status: "ok",
                provider: "wise-demo",
                flow: "tlsn_demo_payment_verifier",
                memoVerified: true,
                paymentConfirmed: true,
                pageDetected: !!pageDetected,
                verificationInput: context.verificationInput,
                verification: {
                    verifierUrl: VERIFIER_URL,
                    proxyUrl: PROXY_URL_BASE + host,
                    targetUrl,
                },
                sessionData: {
                    intentId: context.intentId,
                    memo: context.memo,
                    amount: context.amount,
                    currency: context.currency,
                    platform: context.platform || "wise",
                    tagname: context.tagname,
                    seller: context.seller,
                },
                proof: resp,
                generatedAt: new Date().toISOString(),
            }),
        );
    } catch (error) {
        done(
            JSON.stringify({
                error: toErrorMessage(error),
                verification: {
                    verifierUrl: VERIFIER_URL,
                    proxyUrl: PROXY_URL_BASE + host,
                    targetUrl,
                },
            }),
        );
    } finally {
        setState("isRequestPending", false);
    }
}

function main() {
    const isMinimized = useState("isMinimized", false);
    const isRequestPending = useState("isRequestPending", false);
    const memoVerified = useState("memoVerified", false);
    const paymentConfirmed = useState("paymentConfirmed", false);
    const cachedHeaderSeen = useState("headerSeen", false);
    const context = buildProofContext();
    const targetUrl = buildTargetUrl(context);

    if (!cachedHeaderSeen) {
        const [headerMsg] = useHeaders((headers) =>
            headers.filter((h) => h.url.includes(pageNeedle)),
        );
        if (headerMsg) {
            setState("headerSeen", true);
        }
    }

    const ready = memoVerified && paymentConfirmed;
    const pageDetected = useState("headerSeen", false);

    useEffect(() => {
        if (!pageDetected) {
            openWindow(targetUrl);
        }
    }, []);

    if (isMinimized) {
        return div(
            {
                style: {
                    position: "fixed",
                    bottom: "20px",
                    right: "20px",
                    width: "60px",
                    height: "60px",
                    borderRadius: "50%",
                    backgroundColor: "#0ea5e9",
                    boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                    zIndex: "999999",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: "24px",
                    color: "white",
                },
                onclick: "expandUI",
            },
            ["W"],
        );
    }

    return div(
        {
            style: {
                position: "fixed",
                bottom: "0",
                right: "8px",
                width: "320px",
                borderRadius: "8px 8px 0 0",
                backgroundColor: "white",
                boxShadow: "0 -2px 10px rgba(0,0,0,0.1)",
                zIndex: "999999",
                fontSize: "14px",
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                overflow: "hidden",
            },
        },
        [
            div(
                {
                    style: {
                        background: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
                        padding: "12px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        color: "white",
                    },
                },
                [
                    div(
                        {
                            style: {
                                fontWeight: "600",
                                fontSize: "16px",
                            },
                        },
                        ["Wise Demo Verifier"],
                    ),
                    button(
                        {
                            style: {
                                background: "transparent",
                                border: "none",
                                color: "white",
                                fontSize: "20px",
                                cursor: "pointer",
                                padding: "0",
                                width: "24px",
                                height: "24px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            },
                            onclick: "minimizeUI",
                        },
                        ["-"],
                    ),
                ],
            ),
            div(
                {
                    style: {
                        padding: "16px",
                        backgroundColor: "#f8fafc",
                    },
                },
                [
                    div(
                        {
                            style: {
                                marginBottom: "10px",
                                padding: "10px",
                                borderRadius: "6px",
                                backgroundColor: pageDetected ? "#d4edda" : "#f8d7da",
                                color: pageDetected ? "#155724" : "#721c24",
                                border: `1px solid ${pageDetected ? "#c3e6cb" : "#f5c6cb"}`,
                                fontWeight: "500",
                                fontSize: "12px",
                            },
                        },
                        [pageDetected ? "✓ Demo page detected" : "⚠ Demo page not detected"],
                    ),
                    div(
                        {
                            style: {
                                marginBottom: "10px",
                                fontSize: "12px",
                                color: "#334155",
                                wordBreak: "break-all",
                            },
                        },
                        [`Verifier: ${VERIFIER_URL}`],
                    ),
                    context.verificationInput
                        ? div(
                            {
                                style: {
                                    marginBottom: "10px",
                                    fontSize: "12px",
                                    color: "#334155",
                                    wordBreak: "break-all",
                                },
                            },
                            [`Input: ${context.verificationInput}`],
                        )
                        : div(
                            {
                                style: {
                                    marginBottom: "10px",
                                    fontSize: "12px",
                                    color: "#64748b",
                                },
                            },
                            ["Input: (none)"],
                        ),
                    div(
                        {
                            style: {
                                display: "flex",
                                gap: "8px",
                                marginBottom: "8px",
                            },
                        },
                        [
                            button(
                                {
                                    style: {
                                        flex: "1",
                                        padding: "9px",
                                        borderRadius: "6px",
                                        border: memoVerified ? "1px solid #16a34a" : "1px solid #cbd5e1",
                                        backgroundColor: memoVerified ? "#dcfce7" : "white",
                                        color: memoVerified ? "#166534" : "#334155",
                                        cursor: "pointer",
                                        fontWeight: "600",
                                        fontSize: "12px",
                                    },
                                    onclick: "toggleMemoVerified",
                                },
                                [memoVerified ? "Memo OK" : "Memo Check"],
                            ),
                            button(
                                {
                                    style: {
                                        flex: "1",
                                        padding: "9px",
                                        borderRadius: "6px",
                                        border: paymentConfirmed ? "1px solid #16a34a" : "1px solid #cbd5e1",
                                        backgroundColor: paymentConfirmed ? "#dcfce7" : "white",
                                        color: paymentConfirmed ? "#166534" : "#334155",
                                        cursor: "pointer",
                                        fontWeight: "600",
                                        fontSize: "12px",
                                    },
                                    onclick: "togglePaymentConfirmed",
                                },
                                [paymentConfirmed ? "Payment OK" : "Payment Check"],
                            ),
                        ],
                    ),
                    div(
                        {
                            style: {
                                display: "flex",
                                gap: "8px",
                            },
                        },
                        [
                            button(
                                {
                                    style: {
                                        flex: "1",
                                        padding: "9px",
                                        borderRadius: "6px",
                                        border: "1px solid #cbd5e1",
                                        backgroundColor: "white",
                                        color: "#334155",
                                        cursor: "pointer",
                                        fontWeight: "600",
                                        fontSize: "12px",
                                    },
                                    onclick: "open",
                                },
                                ["Open Demo"],
                            ),
                            button(
                                {
                                    style: {
                                        flex: "1",
                                        padding: "9px",
                                        borderRadius: "6px",
                                        border: "1px solid #cbd5e1",
                                        backgroundColor: "white",
                                        color: "#334155",
                                        cursor: "pointer",
                                        fontWeight: "600",
                                        fontSize: "12px",
                                    },
                                    onclick: "resetChecks",
                                },
                                ["Reset"],
                            ),
                        ],
                    ),
                    button(
                        {
                            style: {
                                marginTop: "10px",
                                width: "100%",
                                padding: "12px",
                                borderRadius: "6px",
                                border: "none",
                                background: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
                                color: "white",
                                fontWeight: "700",
                                fontSize: "14px",
                                opacity: ready && !isRequestPending ? 1 : 0.55,
                                cursor: ready && !isRequestPending ? "pointer" : "not-allowed",
                            },
                            onclick: "onClick",
                        },
                        [isRequestPending ? "Generating Proof..." : "Generate Proof"],
                    ),
                ],
            ),
        ],
    );
}

const wise_plugin = {
    main,
    onClick,
    open,
    openDemoPage,
    resetChecks,
    toggleMemoVerified,
    togglePaymentConfirmed,
    expandUI,
    minimizeUI,
    config,
};

export {
    wise_plugin as default,
};
