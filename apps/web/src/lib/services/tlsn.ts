// Interface for the Browser Extention
interface TLSNExtension {
    connect(): Promise<void>;
    prove(request: any, config: any): Promise<any>;
}

declare global {
    interface Window {
        tlsn?: TLSNExtension;
    }
}

export class TLSNService {
    async connect(): Promise<boolean> {
        if (typeof window === 'undefined' || !window.tlsn) {
            throw new Error("TLSN Extension not found");
        }
        await window.tlsn.connect();
        return true;
    }

    // Generic method to prove any request
    async generateProof(
        intent: any,
        requestConfig: {
            url: string,
            method: string,
            headers: Record<string, string>,
            body?: string
        },
        notaryConfig: { verificationUrl: string } // e.g. the notary server
    ): Promise<any> {
        if (!window.tlsn) throw new Error("TLSN Extension not disconnected");

        const proof = await window.tlsn.prove(
            {
                url: requestConfig.url,
                method: requestConfig.method,
                headers: requestConfig.headers,
                body: requestConfig.body || ""
            },
            {
                verifierUrl: notaryConfig.verificationUrl,
                proxyUrl: `ws://${new URL(notaryConfig.verificationUrl).host}/verify?ignore=${new URL(requestConfig.url).host}`,
                maxRecvData: 4096,
                maxSentData: 1024,
                handlers: [
                    // Standard reveal of what was sent/received
                    { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
                    { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },

                    // TRUSTED TIMESTAMP: Reveal the 'Date' header from the Bank Server
                    // This solves the "Commitment Time" problem by proving the server time.
                    {
                        type: 'RECV',
                        part: 'HEADERS',
                        action: 'REVEAL',
                        params: { type: 'header', key: 'Date' }
                    },

                    // Dynamic Revealing based on Intent

                    // Dynamic Revealing based on Intent
                    // We reveal specific JSON paths that match the intent (like Amount)
                    {
                        type: 'RECV',
                        part: 'BODY',
                        action: 'REVEAL',
                        params: { type: 'json', path: 'amount' }
                    }
                    // In a real implementation, we would add more dynamic handlers here
                ]
            }
        );

        return proof;
    }
}

export const tlsnService = new TLSNService();
