import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		sveltekit(),
		nodePolyfills({
			include: ['buffer', 'events'],
			globals: {
				Buffer: true,
				global: true,
				process: true,
			},
		}),
	],
	optimizeDeps: {
		include: ['viem', '@privy-io/react-auth', 'react', 'react-dom']
	}
});
