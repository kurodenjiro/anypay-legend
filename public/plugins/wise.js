/// <reference types="@tlsn/plugin-sdk/src/globals" />
/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react-hooks/exhaustive-deps */

const host = "localhost:3000";
const uiPath = "/tlsn-demo/payment";

const config = {
    name: "Wise Demo Transfer Verifier",
    description: "Verifies demo transfer details on TLSN demo payment page.",
    urls: [
        `http://${host}/*`,
        "http://localhost:3001/*",
        "https://*/*",
    ],
};

function getVerificationInput() {
    // Optional value injected by host app (same pattern as vpbank.plugin.ts).
    const value = (globalThis && globalThis.VERIFICATION_INPUT) || "";
    return String(value || "").trim();
}

function expandUI() {
    setState("isMinimized", false);
}

function minimizeUI() {
    setState("isMinimized", true);
}

function openDemoPage() {
    openWindow(`http://${host}${uiPath}`);
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

async function onClick() {
    const isRequestPending = useState("isRequestPending", false);
    if (isRequestPending) return;

    const memoVerified = useState("memoVerified", false);
    const paymentConfirmed = useState("paymentConfirmed", false);
    const cachedHeaderSeen = useState("headerSeen", false);

    if (!memoVerified || !paymentConfirmed) {
        done(
            JSON.stringify({
                error: "Confirm memo and payment details before generating proof.",
            }),
        );
        return;
    }

    setState("isRequestPending", true);

    try {
        const verificationInput = getVerificationInput();
        const payload = {
            status: "ok",
            provider: "wise-demo",
            flow: "tlsn_demo_payment_verifier",
            memoVerified: true,
            paymentConfirmed: true,
            pageDetected: !!cachedHeaderSeen,
            verificationInput,
            generatedAt: new Date().toISOString(),
        };

        done(JSON.stringify(payload));
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
    const verificationInput = getVerificationInput();

    if (!cachedHeaderSeen) {
        const [headerMsg] = useHeaders((headers) =>
            headers.filter((h) => h.url.includes(`http://${host}${uiPath}`)),
        );

        if (headerMsg) {
            setState("headerSeen", true);
        }
    }

    const ready = memoVerified && paymentConfirmed;
    const pageDetected = useState("headerSeen", false);

    useEffect(() => {
        if (!pageDetected) {
            openWindow(`http://${host}${uiPath}`);
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
                width: "300px",
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
                                marginBottom: "12px",
                                padding: "10px",
                                borderRadius: "6px",
                                backgroundColor: pageDetected ? "#d4edda" : "#f8d7da",
                                color: pageDetected ? "#155724" : "#721c24",
                                border: `1px solid ${pageDetected ? "#c3e6cb" : "#f5c6cb"}`,
                                fontWeight: "500",
                            },
                        },
                        [pageDetected ? "✓ Demo page detected" : "⚠ Demo page not detected"],
                    ),
                    verificationInput
                        ? div(
                            {
                                style: {
                                    marginBottom: "10px",
                                    fontSize: "12px",
                                    color: "#334155",
                                    wordBreak: "break-all",
                                },
                            },
                            [`Input: ${verificationInput}`],
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
