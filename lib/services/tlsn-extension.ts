type TlsnPluginRecord = Record<string, unknown>;

type TlsnExtensionClient = {
    getPlugins?: () => unknown;
    listPlugins?: () => unknown;
    installPlugin?: (pluginUrl: string) => unknown;
    addPlugin?: (pluginUrl: string) => unknown;
    execCode?: (code: string) => unknown;
    request?: (...args: unknown[]) => unknown;
    plugins?: unknown;
};

export type TlsnWisePluginStatus = {
    extensionInstalled: boolean;
    pluginInstalled: boolean;
    pluginUrl: string;
    message?: string;
};

export type TlsnInstallResult = {
    ok: boolean;
    message?: string;
};

export const TLSN_EXTENSION_REPO_URL =
    "https://github.com/tlsnotary/tlsn-extension";
export const TLSN_CHROME_WEBSTORE_URL =
    "https://chromewebstore.google.com/detail/gnoglgpcamodhflknhmafmjdahcejcgg";

function asPluginArray(value: unknown): TlsnPluginRecord[] {
    if (Array.isArray(value)) {
        return value.filter((entry): entry is TlsnPluginRecord =>
            !!entry && typeof entry === "object",
        );
    }

    if (!value || typeof value !== "object") return [];

    const record = value as Record<string, unknown>;
    const nestedCandidates = [
        record.plugins,
        record.items,
        record.results,
        record.data,
    ];

    for (const candidate of nestedCandidates) {
        if (!Array.isArray(candidate)) continue;
        const parsed = candidate.filter((entry): entry is TlsnPluginRecord =>
            !!entry && typeof entry === "object",
        );
        if (parsed.length > 0) return parsed;
    }

    // Handle map-like responses: { "<id>": { ...plugin } }
    const values = Object.values(record).filter((entry): entry is TlsnPluginRecord =>
        !!entry && typeof entry === "object",
    );
    return values;
}

function readClientFromWindow(): TlsnExtensionClient | null {
    if (typeof window === "undefined") return null;

    const candidateWindow = window as Window & {
        tlsn?: unknown;
        tlsnExtension?: unknown;
        tlsn_extension?: unknown;
        __TLSN_EXTENSION__?: unknown;
    };

    const candidate =
        candidateWindow.tlsn
        || candidateWindow.tlsnExtension
        || candidateWindow.tlsn_extension
        || candidateWindow.__TLSN_EXTENSION__;

    if (!candidate || typeof candidate !== "object") return null;
    return candidate as TlsnExtensionClient;
}

function getPluginId(value: TlsnPluginRecord): string {
    const raw =
        value.url
        || value.pluginUrl
        || value.source
        || value.src
        || value.path
        || value.name
        || value.id
        || "";

    return String(raw).trim().toLowerCase();
}

function isWisePluginRecord(value: TlsnPluginRecord, pluginUrl: string): boolean {
    const normalizedTarget = pluginUrl.toLowerCase();
    const normalizedTargetLeaf = normalizedTarget.split("/").pop() || "wise.js";
    const pluginId = getPluginId(value);
    if (!pluginId) return false;

    return (
        pluginId.includes("wise transfer prover")
        || pluginId.includes(normalizedTarget)
        || pluginId.endsWith("/wise.js")
        || pluginId.includes(normalizedTargetLeaf)
    );
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string") return error;
    return "Unknown TLSN extension error";
}

function hasExecCodeRuntime(client: TlsnExtensionClient): boolean {
    return typeof client.execCode === "function";
}

async function readInstalledPlugins(client: TlsnExtensionClient): Promise<TlsnPluginRecord[]> {
    const methods: Array<(() => unknown) | undefined> = [
        typeof client.getPlugins === "function" ? () => client.getPlugins?.() : undefined,
        typeof client.listPlugins === "function" ? () => client.listPlugins?.() : undefined,
    ];

    for (const method of methods) {
        if (!method) continue;
        try {
            const output = await Promise.resolve(method());
            const plugins = asPluginArray(output);
            if (plugins.length > 0) return plugins;
        } catch {
            // continue with next method
        }
    }

    return asPluginArray(client.plugins);
}

type InstallCall = {
    canInvoke: (client: TlsnExtensionClient) => boolean;
    invoke: (client: TlsnExtensionClient) => unknown;
};

function resolveInstallCalls(pluginUrl: string): InstallCall[] {
    return [
        {
            canInvoke: (client) => typeof client.installPlugin === "function",
            invoke: (client) => client.installPlugin?.(pluginUrl),
        },
        {
            canInvoke: (client) => typeof client.addPlugin === "function",
            invoke: (client) => client.addPlugin?.(pluginUrl),
        },
        {
            canInvoke: (client) => typeof client.request === "function",
            invoke: (client) => client.request?.({ method: "plugins.install", params: { url: pluginUrl } }),
        },
        {
            canInvoke: (client) => typeof client.request === "function",
            invoke: (client) => client.request?.("plugins.install", { url: pluginUrl }),
        },
        {
            canInvoke: (client) => typeof client.request === "function",
            invoke: (client) => client.request?.("install_plugin", { url: pluginUrl }),
        },
    ];
}

export function getWisePluginSourceUrl(): string {
    if (typeof window === "undefined") return "/plugins/wise.js";
    return `${window.location.origin}/plugins/wise.js`;
}

export async function getTlsnWisePluginStatus(
    pluginUrl = getWisePluginSourceUrl(),
): Promise<TlsnWisePluginStatus> {
    const client = readClientFromWindow();
    if (!client) {
        return {
            extensionInstalled: false,
            pluginInstalled: false,
            pluginUrl,
            message: "TLSN extension was not detected in this browser.",
        };
    }

    const runtimeReady = hasExecCodeRuntime(client);

    try {
        const plugins = await readInstalledPlugins(client);
        const listedInRegistry = plugins.some((plugin) => isWisePluginRecord(plugin, pluginUrl));
        const installed = listedInRegistry || runtimeReady;
        const message = listedInRegistry
            ? "Wise TLSN plugin is installed."
            : runtimeReady
                ? "TLSN extension detected. Wise plugin is ready via runtime execution."
                : "TLSN extension detected, but Wise plugin is not installed.";

        return {
            extensionInstalled: true,
            pluginInstalled: installed,
            pluginUrl,
            message,
        };
    } catch (error: unknown) {
        if (runtimeReady) {
            return {
                extensionInstalled: true,
                pluginInstalled: true,
                pluginUrl,
                message:
                    "TLSN extension detected. Plugin registry check failed, but runtime execution is available.",
            };
        }

        return {
            extensionInstalled: true,
            pluginInstalled: false,
            pluginUrl,
            message: `TLSN extension detected but plugin check failed: ${toErrorMessage(error)}`,
        };
    }
}

export async function installTlsnWisePlugin(
    pluginUrl = getWisePluginSourceUrl(),
): Promise<TlsnInstallResult> {
    const client = readClientFromWindow();
    if (!client) {
        return {
            ok: false,
            message: "TLSN extension is not installed.",
        };
    }

    const runtimeReady = hasExecCodeRuntime(client);
    const installCalls = resolveInstallCalls(pluginUrl);
    let attempted = false;

    for (const installCall of installCalls) {
        if (!installCall.canInvoke(client)) continue;
        attempted = true;

        try {
            await Promise.resolve(installCall.invoke(client));
            return { ok: true };
        } catch {
            // try next candidate API
        }
    }

    if (runtimeReady) {
        return {
            ok: true,
            message: "TLSN extension runtime is available. Explicit plugin installation is optional.",
        };
    }

    if (!attempted) {
        return {
            ok: false,
            message: "TLSN extension was detected, but no plugin install API is available.",
        };
    }

    return {
        ok: false,
        message: "Failed to install Wise plugin through TLSN extension APIs.",
    };
}
