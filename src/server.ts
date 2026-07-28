import fsSync from "node:fs";
import gracefulShutdown from "http-graceful-shutdown";
import { createApp } from "./app.js";
import { CONFIG_FILE, loadContext } from "./config.js";

const DEFAULT_PORT = 80;

if (!fsSync.existsSync(CONFIG_FILE)) {
	console.error(`${CONFIG_FILE} not found`);
	process.exit(1);
}

let ctx: Awaited<ReturnType<typeof loadContext>>;
try {
	ctx = await loadContext(CONFIG_FILE);
} catch (e) {
	console.error(`Failed to load ${CONFIG_FILE}:`, (e as Error).message);
	process.exit(1);
}

const port = Number.parseInt(process.env.PORT ?? "", 10) || DEFAULT_PORT;
const server = createApp(ctx).listen(port, () =>
	console.info(`http://0.0.0.0:${port}`),
);

gracefulShutdown(server);
