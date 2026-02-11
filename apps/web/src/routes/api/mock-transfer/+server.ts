import { json } from '@sveltejs/kit';

export function GET() {
    return json({
        status: 'success',
        txId: 'TXN-88293-XP2',
        amount: 1000000,
        currency: 'VND',
        receiver: {
            name: 'NGUYEN VAN A',
            account: '001100223344'
        },
        timestamp: new Date().toISOString()
    });
}
