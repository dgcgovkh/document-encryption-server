import { execFile as execFileCb, spawn, type ChildProcess } from "node:child_process";
import { copyFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFile = promisify(execFileCb);
const ROOT = process.cwd();
const ENTRY = resolve(ROOT, "dist/server.mjs");
const PORT = 8123;

async function workspace(config?: unknown): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "server-e2e-"));
	if (config !== undefined) {
		await writeFile(
			join(dir, "server-config.json"),
			JSON.stringify(config, null, 2),
		);
	}
	return dir;
}

function waitForExit(child: ChildProcess): Promise<{ code: number | null; stderr: string }> {
	let stderr = "";
	child.stderr?.on("data", (chunk) => {
		stderr += String(chunk);
	});
	return new Promise((resolveExit) =>
		child.on("exit", (code) => resolveExit({ code, stderr })),
	);
}

beforeAll(async () => {
	await execFile("npx", ["tsdown"], { cwd: ROOT });
}, 60_000);

describe("startup failures", () => {
	it("exits 1 when the config file is absent", async () => {
		const child = spawn("node", [ENTRY], { cwd: await workspace() });
		const { code, stderr } = await waitForExit(child);

		expect(code).toBe(1);
		expect(stderr).toContain("server-config.json not found");
	});

	it("exits 1 when the config is malformed", async () => {
		const dir = await workspace();
		await writeFile(join(dir, "server-config.json"), "{not json");
		const child = spawn("node", [ENTRY], { cwd: dir });
		const { code, stderr } = await waitForExit(child);

		expect(code).toBe(1);
		expect(stderr).toContain("Failed to load server-config.json");
	});

	it("exits 1 when required fields are missing", async () => {
		const child = spawn("node", [ENTRY], {
			cwd: await workspace({ id_field: "id" }),
		});
		const { code, stderr } = await waitForExit(child);

		expect(code).toBe(1);
		expect(stderr).toContain("missing: schema, template");
	});
});

describe("a running server", () => {
	let child: ChildProcess;

	beforeAll(async () => {
		const dir = await workspace();
		await copyFile(
			resolve(ROOT, "test/fixtures/full-config.json"),
			join(dir, "server-config.json"),
		);
		await copyFile(
			resolve(ROOT, "test/fixtures/qrcode-background.png"),
			join(dir, "background.png"),
		);
		// the fixture points at a repo-relative background; rewrite for this cwd
		const config = JSON.parse(
			await import("node:fs/promises").then((fs) =>
				fs.readFile(join(dir, "server-config.json"), "utf8"),
			),
		);
		config.qrcode = "background.png";
		await writeFile(
			join(dir, "server-config.json"),
			JSON.stringify(config, null, 2),
		);

		child = spawn("node", [ENTRY], {
			cwd: dir,
			env: { ...process.env, PORT: String(PORT) },
		});

		await new Promise<void>((ready, fail) => {
			const timer = setTimeout(() => fail(new Error("server never started")), 30_000);
			child.stdout?.on("data", (chunk) => {
				if (String(chunk).includes("http://")) {
					clearTimeout(timer);
					ready();
				}
			});
			child.on("exit", (code) => fail(new Error(`exited early with ${code}`)));
		});
	}, 45_000);

	afterAll(() => {
		child?.kill();
	});

	it("serves the encrypt endpoint end to end", async () => {
		const res = await fetch(`http://127.0.0.1:${PORT}/api/encrypt-document`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ data: { id: "E2E-1" } }),
		});
		const body = (await res.json()) as Record<string, string>;

		expect(res.status).toBe(200);
		expect(body.document_id).toBe("E2E-1");
		expect(body.qrcode_data).toMatch(/^data:image\/png;base64,/);
	});

	it("applies security headers and hides the framework", async () => {
		const res = await fetch(`http://127.0.0.1:${PORT}/api/encrypt-document`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ data: { id: "E2E-2" } }),
		});

		expect(res.headers.get("x-powered-by")).toBeNull();
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	});
});
