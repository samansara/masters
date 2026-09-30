import { bindings, defineConfig, exports, triggers } from "cf/config";

const STAGING_DATABASE_ID = "60088837-cdb8-4677-ab26-dddf4e5ad2f7";

export default defineConfig(({ mode }) => {
	const staging = mode === "staging";
	const workerName = staging ? "masters-auction-staging" : "masters-auction";
	const queueName = staging ? "payout-calculations-staging" : "payout-calculations";
	return {
		worker: {
			name: workerName,
			compatibilityDate: "2024-06-01",
			entrypoint: "src/index.ts",
			placement: { mode: "smart" },
			observability: { enabled: true },
			...(staging ? {} : { domains: ["masters.samlikessports.com"] }),
			triggers: [
				triggers.queue({ name: queueName, maxBatchSize: 1, maxRetries: 3 }),
			],
			env: {
				GOLF_DATA_SOURCE: bindings.text("espn"),
				DB: bindings.d1({
					name: staging ? "masters-auction-db-staging" : "masters-auction-db",
					id: staging ? STAGING_DATABASE_ID : "74722455-987f-42b6-97c6-564a5bd71ae9",
				}),
				PAYOUT_QUEUE: bindings.queue({ name: queueName }),
				LIVE_UPDATES: bindings.durableObject({
					worker: workerName,
					exportName: "LiveUpdates",
				}),
			},
			exports: { LiveUpdates: exports.durableObject({ storage: "sqlite" }) },
		},
	};
});
