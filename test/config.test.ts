import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContext } from "../src/config.js";
import { FULL_CONFIG, MINIMAL_CONFIG } from "./helpers.js";

const VALID = {
	id_field: "id",
	schema: { type: "object", properties: { id: { type: "string" } } },
	template: { issuers: [{ name: "T", url: "https://t.test" }] },
};

async function writeConfig(config: unknown): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "cfg-"));
	const file = join(dir, "server-config.json");
	await writeFile(file, JSON.stringify(config));
	return file;
}

describe("loadContext", () => {
	it("loads the full configuration", async () => {
		const ctx = await loadContext(FULL_CONFIG);

		expect(ctx.config.id_field).toBe("id");
		expect(ctx.qrcodeBackground).not.toBeNull();
		expect(ctx.validate).toBeTypeOf("function");
		expect(ctx.quickJS).toBeDefined();
	});

	it("leaves the background null when no qrcode is configured", async () => {
		expect((await loadContext(MINIMAL_CONFIG)).qrcodeBackground).toBeNull();
	});

	it("compiles the schema once and reuses it", async () => {
		const { validate } = await loadContext(MINIMAL_CONFIG);

		expect(validate({ id: "A" })).toBe(true);
		expect(validate({})).toBe(false);
		expect(validate.errors?.[0]?.keyword).toBe("required");
	});

	it.each([
		["schema", { ...VALID, schema: undefined }],
		["template", { ...VALID, template: undefined }],
		["id_field", { ...VALID, id_field: undefined }],
	])("rejects a config missing %s", async (field, config) => {
		await expect(loadContext(await writeConfig(config))).rejects.toThrow(
			new RegExp(`missing: ${field}`),
		);
	});

	it.each([
		["a missing url", { name: "T" }],
		["a non-url string", { name: "T", url: "not a url" }],
	])("rejects an issuer with %s", async (_name, issuer) => {
		await expect(
			loadContext(
				await writeConfig({ ...VALID, template: { issuers: [issuer] } }),
			),
		).rejects.toThrow(/valid url on the first template issuer/);
	});

	it("rejects a template without issuers", async () => {
		await expect(
			loadContext(await writeConfig({ ...VALID, template: { issuers: [] } })),
		).rejects.toThrow(/at least one template issuer/);
	});

	it("rejects custom_url without a qrcode background", async () => {
		await expect(
			loadContext(
				await writeConfig({ ...VALID, custom_url: "https://t.test/{{id}}" }),
			),
		).rejects.toThrow(/sets "custom_url" but no "qrcode"/);
	});

	it("rejects a missing file", async () => {
		await expect(loadContext("does/not/exist.json")).rejects.toThrow();
	});

	it("rejects malformed json", async () => {
		const dir = await mkdtemp(join(tmpdir(), "cfg-"));
		const file = join(dir, "server-config.json");
		await writeFile(file, "{not json");

		await expect(loadContext(file)).rejects.toThrow(SyntaxError);
	});
});
