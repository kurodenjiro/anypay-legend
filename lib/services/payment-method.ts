const TAG_SEPARATOR = "::";

export type ParsedPaymentMethod = {
    raw: string;
    method: string;
    accountTag: string;
    hasAccountTag: boolean;
};

function normalizeMethod(value: string): string {
    return String(value || "").trim().toLowerCase();
}

export function encodePaymentMethodWithTag(
    method: string,
    accountTag?: string | null,
): string {
    const normalizedMethod = normalizeMethod(method);
    if (!normalizedMethod) return "";

    const normalizedTag = String(accountTag || "").trim().replace(/\s+/g, " ");
    if (!normalizedTag) return normalizedMethod;
    const cappedTag = normalizedTag.slice(0, 120);

    return `${normalizedMethod}${TAG_SEPARATOR}${cappedTag}`;
}

export function parsePaymentMethod(rawValue: string | null | undefined): ParsedPaymentMethod {
    const raw = String(rawValue || "").trim();
    if (!raw) {
        return {
            raw: "",
            method: "",
            accountTag: "",
            hasAccountTag: false,
        };
    }

    const separatorIndex = raw.indexOf(TAG_SEPARATOR);
    if (separatorIndex < 0) {
        return {
            raw,
            method: normalizeMethod(raw),
            accountTag: "",
            hasAccountTag: false,
        };
    }

    const method = normalizeMethod(raw.slice(0, separatorIndex));
    const accountTag = raw.slice(separatorIndex + TAG_SEPARATOR.length).trim();

    return {
        raw,
        method: method || normalizeMethod(raw),
        accountTag,
        hasAccountTag: accountTag.length > 0,
    };
}
