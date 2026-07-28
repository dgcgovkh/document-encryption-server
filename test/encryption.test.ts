import { describe, expect, it } from "vitest";
import {
	decodeDocument,
	decryptString,
	encodeDocument,
	encryptString,
	ENCRYPTION_PARAMETERS,
	generateEncryptionKey,
	type IEncryptionResults,
} from "../src/encryption.js";
import vectors from "./fixtures/oa-encryption-vectors.json" with { type: "json" };

const KEY_256 = "4f".repeat(32);

describe("golden vectors from @govtechsg/oa-encryption", () => {
	it.each(vectors.cases)(
		"decrypts a $name payload produced by the original library",
		({ plaintext, cipherText, iv, tag, type }) => {
			expect(decryptString({ cipherText, iv, tag, type, key: vectors.key })).toBe(
				plaintext,
			);
		},
	);
});

describe("encryptString", () => {
	it.each([
		["ascii", "hello world"],
		["json", JSON.stringify({ id: "DOC-1", nested: { a: [1, 2, 3] } })],
		["unicode", "ភាសាខ្មែរ 🇰🇭 café"],
		["empty", ""],
		["large", "x".repeat(100_000)],
	])("round-trips %s", (_name, plaintext) => {
		expect(decryptString(encryptString(plaintext))).toBe(plaintext);
	});

	it("emits the documented wire format", () => {
		const result = encryptString("payload");

		expect(result.type).toBe("OPEN-ATTESTATION-TYPE-1");
		expect(Buffer.from(result.iv, "base64")).toHaveLength(
			ENCRYPTION_PARAMETERS.ivLength / 8,
		);
		expect(Buffer.from(result.tag, "base64")).toHaveLength(
			ENCRYPTION_PARAMETERS.tagLength / 8,
		);
		expect(result.key).toMatch(/^[0-9a-f]{64}$/);
	});

	it("uses the supplied key verbatim", () => {
		expect(encryptString("payload", KEY_256).key).toBe(KEY_256);
	});

	it("produces a distinct iv per call", () => {
		const ivs = new Set(
			Array.from({ length: 25 }, () => encryptString("same", KEY_256).iv),
		);
		expect(ivs.size).toBe(25);
	});

	it.each([
		["aes-128", 16],
		["aes-192", 24],
		["aes-256", 32],
	])("supports %s keys", (_name, bytes) => {
		const key = "ab".repeat(bytes);
		expect(decryptString(encryptString("payload", key))).toBe("payload");
	});

	it("rejects non-string input", () => {
		expect(() => encryptString(42 as unknown as string)).toThrow(
			"encryptString only accepts strings",
		);
	});

	it("rejects an unsupported key length", () => {
		expect(() => encryptString("payload", "ab".repeat(20))).toThrow(
			/Invalid key length/,
		);
	});
});

describe("decryptString", () => {
	const encrypted = (): IEncryptionResults => encryptString("payload", KEY_256);

	it("rejects a tampered ciphertext", () => {
		const result = encrypted();
		const bytes = Buffer.from(result.cipherText, "base64");
		bytes[0] ^= 0xff;
		expect(() =>
			decryptString({ ...result, cipherText: bytes.toString("base64") }),
		).toThrow("Error decrypting message");
	});

	it("rejects a tampered tag", () => {
		expect(() =>
			decryptString({ ...encrypted(), tag: Buffer.alloc(16, 1).toString("base64") }),
		).toThrow("Error decrypting message");
	});

	it("rejects a truncated tag rather than passing it to the cipher", () => {
		expect(() =>
			decryptString({ ...encrypted(), tag: Buffer.alloc(8).toString("base64") }),
		).toThrow("Error decrypting message");
	});

	it("rejects the wrong key", () => {
		expect(() => decryptString({ ...encrypted(), key: "1a".repeat(32) })).toThrow(
			"Error decrypting message",
		);
	});

	it("rejects an unknown version", () => {
		expect(() => decryptString({ ...encrypted(), type: "NOPE" })).toThrow(
			/Expecting version OPEN-ATTESTATION-TYPE-1 but got NOPE/,
		);
	});
});

describe("helpers", () => {
	it("round-trips documents through base64", () => {
		expect(decodeDocument(encodeDocument("ភាសា 🇰🇭"))).toBe("ភាសា 🇰🇭");
	});

	it("generates keys of the requested size", () => {
		expect(generateEncryptionKey()).toHaveLength(64);
		expect(generateEncryptionKey(128)).toHaveLength(32);
	});
});
