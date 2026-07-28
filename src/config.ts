import fs from "node:fs/promises";
import { Ajv, type ValidateFunction } from "ajv";
import { loadImage, type Image } from "@napi-rs/canvas";
import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";
import type { SomeJSONSchema } from "ajv/dist/types/json-schema.js";

export const CONFIG_FILE = "server-config.json";

export interface ServerConfig {
	schema: SomeJSONSchema;
	template: {
		issuers: Array<{ url: string; [key: string]: unknown }>;
		[key: string]: unknown;
	};
	id_field: string;
	qrcode?: string;
	custom_url?: string;
	identity?: { factory: string };
}

export interface AppContext {
	config: ServerConfig;
	validate: ValidateFunction;
	quickJS: QuickJSWASMModule;
	qrcodeBackground: Image | null;
}

function assertValid(config: ServerConfig): void {
	const missing = (["schema", "template", "id_field"] as const).filter(
		(key) => config[key] == null,
	);

	if (missing.length > 0) {
		throw new Error(`${CONFIG_FILE} is missing: ${missing.join(", ")}`);
	}

	if (!Array.isArray(config.template.issuers) || !config.template.issuers[0]) {
		throw new Error(`${CONFIG_FILE} requires at least one template issuer`);
	}

	if (!URL.canParse(config.template.issuers[0].url ?? "")) {
		throw new Error(
			`${CONFIG_FILE} requires a valid url on the first template issuer`,
		);
	}
}

export async function loadContext(
	configFile = CONFIG_FILE,
): Promise<AppContext> {
	const config: ServerConfig = JSON.parse(
		await fs.readFile(configFile, "utf8"),
	);
	assertValid(config);

	if (config.custom_url != null && config.qrcode == null) {
		throw new Error(
			`${CONFIG_FILE} sets "custom_url" but no "qrcode" background image`,
		);
	}

	return {
		config,
		validate: new Ajv().compile(config.schema),
		quickJS: await getQuickJS(),
		qrcodeBackground: config.qrcode ? await loadImage(config.qrcode) : null,
	};
}
