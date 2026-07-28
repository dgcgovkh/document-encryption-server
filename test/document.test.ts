import { beforeAll, describe, expect, it } from "vitest";
import {
	buildDocumentData,
	createCustomUrl,
	formatUrl,
	SUPPORTED_KEY_TYPES,
	wrap,
} from "../src/document.js";
import { HttpError } from "../src/errors.js";
import type { AppContext } from "../src/config.js";
import { context, MINIMAL_CONFIG } from "./helpers.js";

let ctx: AppContext;
let minimal: AppContext;

beforeAll(async () => {
	ctx = await context();
	minimal = await context(MINIMAL_CONFIG);
});

describe("formatUrl", () => {
	it("substitutes placeholders", () => {
		expect(formatUrl("https://x.test/{{id}}?key={{key}}", { id: "A", key: "B" })).toBe(
			"https://x.test/A?key=B",
		);
	});

	it("url-encodes substituted values", () => {
		expect(formatUrl("https://x.test/{{id}}", { id: "a b/c&d" })).toBe(
			"https://x.test/a%20b%2Fc%26d",
		);
	});

	it("tolerates whitespace inside the placeholder", () => {
		expect(formatUrl("https://x.test/{{ id }}", { id: "A" })).toBe(
			"https://x.test/A",
		);
	});

	it("throws when a referenced key is absent", () => {
		expect(() => formatUrl("https://x.test/{{missing}}", { id: "A" })).toThrow(
			/Key: "missing" doesn't exist/,
		);
	});

	it("throws when a referenced key is null", () => {
		expect(() => formatUrl("https://x.test/{{id}}", { id: null })).toThrow(
			/doesn't exist/,
		);
	});

	it("leaves a template without placeholders untouched", () => {
		expect(formatUrl("https://x.test/plain")).toBe("https://x.test/plain");
	});
});

describe("buildDocumentData", () => {
	it("merges the configured template into the payload", () => {
		const result = buildDocumentData(ctx, { id: "DOC-1" });

		expect(result.id).toBe("DOC-1");
		expect(result.issuers).toEqual(ctx.config.template.issuers);
	});

	it("lets the template win over caller-supplied fields", () => {
		const result = buildDocumentData(ctx, { id: "DOC-1", issuers: ["mine"] });

		expect(result.issuers).toEqual(ctx.config.template.issuers);
	});

	it("attaches a hashed $identity when the factory returns a value", () => {
		const result = buildDocumentData(ctx, { id: "DOC-1", nid: "12345" });

		expect(result.$identity).toEqual({ number: expect.stringMatching(/^[0-9a-f]{64}$/) });
	});

	it("hashes the identity deterministically", () => {
		const a = buildDocumentData(ctx, { id: "A", nid: "12345" });
		const b = buildDocumentData(ctx, { id: "B", nid: "12345" });

		expect(a.$identity).toEqual(b.$identity);
	});

	it("does not attach $identity when the factory returns null", () => {
		expect(buildDocumentData(ctx, { id: "DOC-1" }).$identity).toBeUndefined();
	});

	it("skips identity entirely when none is configured", () => {
		expect(buildDocumentData(minimal, { id: "DOC-1" }).$identity).toBeUndefined();
	});

	it("converts a factory failure into a 400", () => {
		try {
			buildDocumentData(ctx, { id: "D", nid: "BAD" });
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(HttpError);
			expect((e as HttpError).status).toBe(400);
			expect((e as HttpError).body).toEqual({
				message: "INVALID_DATA",
				errors: [{ message: "bad nid" }],
			});
		}
	});
});

describe("wrap", () => {
	it("produces a v2 wrapped document", () => {
		const wrapped = wrap({ id: "DOC-1", issuers: [] });

		expect(wrapped.version).toBe("https://schema.openattestation.com/2.0/schema.json");
		expect(wrapped.signature.type).toBe("SHA3MerkleProof");
		expect(wrapped.signature.targetHash).toMatch(/^[0-9a-f]{64}$/);
		expect(wrapped.signature.merkleRoot).toBe(wrapped.signature.targetHash);
		expect(wrapped.signature.proof).toEqual([]);
	});

	it("salts data so identical inputs hash differently", () => {
		const a = wrap({ id: "DOC-1", issuers: [] });
		const b = wrap({ id: "DOC-1", issuers: [] });

		expect(a.signature.targetHash).not.toBe(b.signature.targetHash);
	});
});

describe("createCustomUrl", () => {
	it("builds the url and a png qr code", () => {
		const result = createCustomUrl(ctx, { id: "DOC-1" }, "KEY");

		expect(result?.url).toBe("https://verify.example.com/d/DOC-1?key=KEY");
		expect(result?.qrcode_data).toMatch(/^data:image\/png;base64,/);
	});

	it("returns undefined when custom_url is not configured", () => {
		expect(createCustomUrl(minimal, { id: "DOC-1" }, "KEY")).toBeUndefined();
	});
});

describe("SUPPORTED_KEY_TYPES", () => {
	it("contains exactly the two documented types", () => {
		expect([...SUPPORTED_KEY_TYPES].sort()).toEqual([
			"OPEN-ATTESTATION-TYPE-1",
			"VERIFY-GOV-KH-1.0",
		]);
	});
});
