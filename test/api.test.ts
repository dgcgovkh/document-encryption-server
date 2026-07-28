import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	MINIMAL_CONFIG,
	startServer,
	unsalt,
	type TestServer,
} from "./helpers.js";

let server: TestServer;

beforeAll(async () => {
	server = await startServer();
});

afterAll(() => server.close());

const DATA = { id: "DOC-1", nid: "12345", name: "Test" };

describe.each([
	["/api", "v0"],
	["/api/v1", "v1"],
])("%s", (prefix, version) => {
	const encryptUrl = `${prefix}/encrypt-document`;
	const decryptUrl = `${prefix}/decrypt-document`;
	const qrcodeUrl = `${prefix}/qrcode`;

	describe("encrypt-document", () => {
		it("wraps, encrypts and returns the document", async () => {
			const res = await server.post(encryptUrl, { data: DATA });

			expect(res.status).toBe(200);
			expect(res.body.document_id).toBe("DOC-1");
			expect(res.body.document_key).toMatch(/^[0-9a-f]{64}$/);
			expect(res.body.encrypted_document.type).toBe("OPEN-ATTESTATION-TYPE-1");
		});

		it(`returns ${version} signature casing`, async () => {
			const res = await server.post(encryptUrl, { data: DATA });
			const expected =
				version === "v1"
					? ["merkle_root", "proof", "target_hash", "type"]
					: ["merkleRoot", "proof", "targetHash", "type"];

			expect(Object.keys(res.body.document_signature).sort()).toEqual(expected);
		});

		it(`returns ${version} encrypted_document casing`, async () => {
			const res = await server.post(encryptUrl, { data: DATA });
			const expected =
				version === "v1"
					? ["cipher_text", "iv", "tag", "type"]
					: ["cipherText", "iv", "tag", "type"];

			expect(Object.keys(res.body.encrypted_document).sort()).toEqual(expected);
		});

		it("honours a caller-supplied key", async () => {
			const key = "ab".repeat(32);
			const res = await server.post(encryptUrl, { data: DATA, document_key: key });

			expect(res.body.document_key).toBe(key);
		});

		it("issues a VERIFY-GOV-KH-1.0 document with a generated key", async () => {
			const res = await server.post(encryptUrl, {
				data: DATA,
				document_key_type: "VERIFY-GOV-KH-1.0",
			});

			expect(res.status).toBe(200);
			expect(res.body.document_key).toHaveLength(21);
			expect(res.body.encrypted_document.type).toBe("VERIFY-GOV-KH-1.0");
			expect(res.body.encrypted_document.cipherText).toBeTypeOf("string");
		});

		it("honours document_key_length", async () => {
			const res = await server.post(encryptUrl, {
				data: DATA,
				document_key_type: "VERIFY-GOV-KH-1.0",
				document_key_length: 32,
			});

			expect(res.body.document_key).toHaveLength(32);
		});

		it("rejects a caller-supplied gov-kh key shorter than the minimum", async () => {
			const res = await server.post(encryptUrl, {
				data: DATA,
				document_key_type: "VERIFY-GOV-KH-1.0",
				document_key: "short",
			});

			expect(res.status).toBe(400);
			expect(res.body.message).toBe("INVALID_DOCUMENT_KEY_LENGTH");
		});

		it("accepts a caller-supplied gov-kh key at the minimum length", async () => {
			const res = await server.post(encryptUrl, {
				data: DATA,
				document_key_type: "VERIFY-GOV-KH-1.0",
				document_key: "12345678901",
			});

			expect(res.status).toBe(200);
			expect(res.body.document_key).toBe("12345678901");
		});

		it("keeps the gov-kh signature in camelCase for both versions", async () => {
			const res = await server.post(encryptUrl, {
				data: DATA,
				document_key_type: "VERIFY-GOV-KH-1.0",
			});

			expect(Object.keys(res.body.document_signature).sort()).toEqual([
				"merkleRoot",
				"proof",
				"targetHash",
				"type",
			]);
		});

		it("includes the custom url and its qr code", async () => {
			const res = await server.post(encryptUrl, { data: DATA });

			expect(res.body.url).toMatch(
				/^https:\/\/verify\.example\.com\/d\/DOC-1\?key=[0-9a-f]{64}$/,
			);
			expect(res.body.qrcode_data).toMatch(/^data:image\/png;base64,/);
		});

		it.each([
			["missing data", {}, "INVALID_DATA"],
			["non-object data", { data: "nope" }, "INVALID_DATA"],
			["schema violation", { data: { nid: "x" } }, "INVALID_DATA"],
			[
				"non-string key",
				{ data: DATA, document_key: 123 },
				"INVALID_DOCUMENT_KEY",
			],
			[
				"unknown key type",
				{ data: DATA, document_key_type: "NOPE" },
				"INVALID_DOCUMENT_KEY_TYPE",
			],
			[
				"key length too low",
				{
					data: DATA,
					document_key_type: "VERIFY-GOV-KH-1.0",
					document_key_length: 5,
				},
				"INVALID_DOCUMENT_KEY_LENGTH",
			],
			[
				"key length too high",
				{
					data: DATA,
					document_key_type: "VERIFY-GOV-KH-1.0",
					document_key_length: 999,
				},
				"INVALID_DOCUMENT_KEY_LENGTH",
			],
		])("rejects %s", async (_name, body, message) => {
			const res = await server.post(encryptUrl, body);

			expect(res.status).toBe(400);
			expect(res.body.message).toBe(message);
		});

		it.each([
			["non-hex", "zz".repeat(32)],
			["too short", "ab"],
			["empty", ""],
			["odd length", "abc"],
		])("rejects a %s document_key with 400 rather than crashing", async (_n, key) => {
			const res = await server.post(encryptUrl, {
				data: DATA,
				document_key: key,
			});

			expect(res.status).toBe(400);
			expect(res.body.message).toBe("INVALID_DOCUMENT_KEY");
		});

		it.each([32, 48, 64])("accepts a %s-char hex key", async (len) => {
			const res = await server.post(encryptUrl, {
				data: DATA,
				document_key: "a".repeat(len),
			});

			expect(res.status).toBe(200);
		});

		it("reports schema validation errors", async () => {
			const res = await server.post(encryptUrl, { data: { nid: "x" } });

			expect(res.body.errors[0]).toMatchObject({
				keyword: "required",
				params: { missingProperty: "id" },
			});
		});

		it("hashes the identity number when the factory returns one", async () => {
			const res = await server.post(encryptUrl, { data: DATA });
			const key = res.body.document_key;
			const decrypted = await server.post(decryptUrl, {
				document_key: key,
				encrypted_document: res.body.encrypted_document,
			});

			expect(unsalt(decrypted.body.data.$identity.number)).toMatch(
				/^[0-9a-f]{64}$/,
			);
		});

		it("omits $identity when the factory returns null", async () => {
			const res = await server.post(encryptUrl, { data: { id: "NO-NID" } });
			const decrypted = await server.post(decryptUrl, {
				document_key: res.body.document_key,
				encrypted_document: res.body.encrypted_document,
			});

			expect(decrypted.body.data.$identity).toBeUndefined();
		});

		it("surfaces a fail() from the identity factory as INVALID_DATA", async () => {
			const res = await server.post(encryptUrl, {
				data: { id: "D", nid: "BAD" },
			});

			expect(res.status).toBe(400);
			expect(res.body).toEqual({
				message: "INVALID_DATA",
				errors: [{ message: "bad nid" }],
			});
		});
	});

	describe("decrypt-document", () => {
		it.each([
			["OPEN-ATTESTATION-TYPE-1", undefined],
			["VERIFY-GOV-KH-1.0", "VERIFY-GOV-KH-1.0"],
		])("round-trips a %s document", async (_name, keyType) => {
			const encrypted = await server.post(encryptUrl, {
				data: DATA,
				...(keyType ? { document_key_type: keyType } : {}),
			});

			const res = await server.post(decryptUrl, {
				document_key: encrypted.body.document_key,
				encrypted_document: encrypted.body.encrypted_document,
			});

			expect(res.status).toBe(200);
			expect(unsalt(res.body.data.id)).toBe("DOC-1");
			expect(res.body.signature.targetHash).toBeTypeOf("string");
		});

		it.each([
			["missing key", {}, "INVALID_DOCUMENT_KEY"],
			[
				"missing document",
				{ document_key: "ab".repeat(32) },
				"INVALID_ENCRYPTED_DOCUMENT",
			],
		])("rejects %s with 400", async (_name, body, message) => {
			const res = await server.post(decryptUrl, body);

			expect(res.status).toBe(400);
			expect(res.body.message).toBe(message);
		});

		it("reports a failed decryption as a client error, without a stack trace", async () => {
			const res = await server.post(decryptUrl, {
				document_key: "ab".repeat(32),
				encrypted_document: {
					cipherText: "AAAA",
					iv: "AAAAAAAAAAAAAAAA",
					tag: "AAAAAAAAAAAAAAAAAAAAAA==",
					type: "OPEN-ATTESTATION-TYPE-1",
				},
			});

			expect(res.status).toBe(400);
			expect(res.body).toEqual({ message: "DECRYPTION_FAILED" });
			expect(res.text).not.toContain("Error:");
			expect(res.text).not.toContain("<!DOCTYPE");
		});

		it.each([
			["an empty iv", { iv: "" }],
			["a missing iv", { iv: undefined }],
			["a non-string tag", { tag: 42 }],
			["a missing cipherText", { cipherText: undefined }],
		])("rejects %s with 400 rather than crashing", async (_name, override) => {
			const res = await server.post(decryptUrl, {
				document_key: "ab".repeat(32),
				encrypted_document: {
					cipherText: "AAAA",
					iv: "AAAAAAAAAAAAAAAA",
					tag: "AAAAAAAAAAAAAAAAAAAAAA==",
					type: "OPEN-ATTESTATION-TYPE-1",
					...override,
				},
			});

			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(
				/INVALID_ENCRYPTED_DOCUMENT|DECRYPTION_FAILED/,
			);
		});

		it("rejects a gov-kh document with a wrong key as a client error", async () => {
			const encrypted = await server.post(encryptUrl, {
				data: DATA,
				document_key_type: "VERIFY-GOV-KH-1.0",
			});

			const res = await server.post(decryptUrl, {
				document_key: "not-the-right-key",
				encrypted_document: encrypted.body.encrypted_document,
			});

			expect(res.status).toBe(400);
			expect(res.body).toEqual({ message: "DECRYPTION_FAILED" });
		});

	});

	describe("qrcode", () => {
		it("renders a png", async () => {
			const res = await server.post(qrcodeUrl, {
				qrcode_type: "png",
				document_ref: "REF1",
				document_key: "KEY1",
			});

			expect(res.status).toBe(200);
			expect(res.body.qrcode_data).toMatch(/^data:image\/png;base64,/);
			expect(res.body.url).toBe(
				"https://issuer.example.com/verify/REF1?key=KEY1",
			);
		});

		it("renders a pdf and accepts mixed-case types", async () => {
			const res = await server.post(qrcodeUrl, {
				qrcode_type: "PDF",
				document_ref: "REF1",
				document_key: "KEY1",
			});

			expect(res.status).toBe(200);
			expect(res.body.qrcode_data).toMatch(/^data:application\/pdf;base64,/);

			const pdf = Buffer.from(
				res.body.qrcode_data.split(",")[1] as string,
				"base64",
			);
			expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
		});

		it.each([
			["a query string", "x?evil=1"],
			["path traversal", "../../a"],
			["a fragment", "x#frag"],
			["a slash", "a/b"],
		])("escapes %s in document_ref", async (_name, ref) => {
			const res = await server.post(qrcodeUrl, {
				qrcode_type: "png",
				document_ref: ref,
				document_key: "KEY1",
			});
			const url = new URL(res.body.url);

			expect(res.status).toBe(200);
			expect(url.origin).toBe("https://issuer.example.com");
			expect(url.pathname).toBe(`/verify/${encodeURIComponent(ref)}`);
			expect(url.searchParams.get("key")).toBe("KEY1");
			expect([...url.searchParams.keys()]).toEqual(["key"]);
		});

		it.each([
			["missing type", { document_ref: "R", document_key: "K" }, "qrcode_type is required."],
			[
				"unsupported type",
				{ qrcode_type: "gif", document_ref: "R", document_key: "K" },
				"invalid qrcode_type. Only pdf or png is allowed!",
			],
			[
				"non-string ref",
				{ qrcode_type: "png", document_ref: 5, document_key: "K" },
				"document_ref is invalid!",
			],
			[
				"non-string key",
				{ qrcode_type: "png", document_ref: "R", document_key: 5 },
				"document_key is invalid!",
			],
		])("rejects %s", async (_name, body, message) => {
			const res = await server.post(qrcodeUrl, body);

			expect(res.status).toBe(400);
			expect(res.body).toEqual({ message });
		});
	});
});

describe("error handling", () => {
	it("returns JSON for malformed request bodies", async () => {
		const res = await server.postRaw("/api/encrypt-document", "{not json");

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ message: "INVALID_JSON" });
	});

	it("does not advertise the framework", async () => {
		const res = await server.post("/api/encrypt-document", { data: DATA });
		expect(res.status).toBe(200);
	});

	it("404s an unknown route without an HTML stack trace", async () => {
		const res = await server.post("/api/nope", {});

		expect(res.status).toBe(404);
		expect(res.text).not.toContain("at Object");
	});
});

describe("without a qrcode background", () => {
	let minimal: TestServer;

	beforeAll(async () => {
		minimal = await startServer(MINIMAL_CONFIG);
	});

	afterAll(() => minimal.close());

	it("still encrypts, omitting the custom url", async () => {
		const res = await minimal.post("/api/encrypt-document", {
			data: { id: "DOC-9" },
		});

		expect(res.status).toBe(200);
		expect(res.body.url).toBeUndefined();
		expect(res.body.qrcode_data).toBeUndefined();
	});

	it("reports the qrcode endpoint as unavailable", async () => {
		const res = await minimal.post("/api/qrcode", {
			qrcode_type: "png",
			document_ref: "R",
			document_key: "K",
		});

		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/server-config\.json is outdated/);
	});
});
