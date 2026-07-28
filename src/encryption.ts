/**
 * Vendored from https://github.com/Open-Attestation/oa-encryption (Apache-2.0).
 *
 * Behaviour and wire format are unchanged; the node-forge dependency has been
 * replaced with Node's built-in `crypto` to drop an unpatched transitive
 * advisory. Documents are UTF-8 encoded, base64'd, then encrypted with AES-GCM
 * — the ciphertext, iv and tag are base64, the key is hex.
 */
import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	type CipherGCM,
	type DecipherGCM,
} from "node:crypto";

export const ENCRYPTION_PARAMETERS = {
	algorithm: "AES-GCM" as const,
	keyLength: 256,
	ivLength: 96,
	tagLength: 128,
	version: "OPEN-ATTESTATION-TYPE-1",
};

const TAG_LENGTH_BYTES = ENCRYPTION_PARAMETERS.tagLength / 8;

function cipherName(key: Buffer): string {
	switch (key.length) {
		case 16:
			return "aes-128-gcm";
		case 24:
			return "aes-192-gcm";
		case 32:
			return "aes-256-gcm";
		default:
			throw new Error(`Invalid key length: ${key.length} bytes`);
	}
}

export const generateEncryptionKey = (
	keyLengthInBits: number = ENCRYPTION_PARAMETERS.keyLength,
): string => randomBytes(keyLengthInBits / 8).toString("hex");

const generateIv = (
	ivLengthInBits: number = ENCRYPTION_PARAMETERS.ivLength,
): string => randomBytes(ivLengthInBits / 8).toString("base64");

export const encodeDocument = (document: string): string =>
	Buffer.from(document, "utf8").toString("base64");

export const decodeDocument = (encoded: string): string =>
	Buffer.from(encoded, "base64").toString("utf8");

export interface IEncryptionResults {
	cipherText: string;
	iv: string;
	tag: string;
	key: string;
	type: string;
}

export const encryptString = (
	document: string,
	key?: string,
): IEncryptionResults => {
	if (typeof document !== "string") {
		throw new Error("encryptString only accepts strings");
	}

	const encryptionKey = key ?? generateEncryptionKey();
	const keyBuffer = Buffer.from(encryptionKey, "hex");
	const iv = generateIv();

	const cipher = createCipheriv(
		cipherName(keyBuffer),
		keyBuffer,
		Buffer.from(iv, "base64"),
	) as CipherGCM;

	const cipherText = Buffer.concat([
		cipher.update(Buffer.from(encodeDocument(document), "latin1")),
		cipher.final(),
	]).toString("base64");

	return {
		cipherText,
		iv,
		tag: cipher.getAuthTag().toString("base64"),
		key: encryptionKey,
		type: ENCRYPTION_PARAMETERS.version,
	};
};

export const decryptString = ({
	cipherText,
	tag,
	iv,
	key,
	type,
}: IEncryptionResults): string => {
	if (type !== ENCRYPTION_PARAMETERS.version) {
		throw new Error(
			`Expecting version ${ENCRYPTION_PARAMETERS.version} but got ${type}`,
		);
	}

	const keyBuffer = Buffer.from(key, "hex");
	const decipher = createDecipheriv(
		cipherName(keyBuffer),
		keyBuffer,
		Buffer.from(iv, "base64"),
	) as DecipherGCM;

	const tagBuffer = Buffer.from(tag, "base64");
	if (tagBuffer.length !== TAG_LENGTH_BYTES) {
		throw new Error("Error decrypting message");
	}
	decipher.setAuthTag(tagBuffer);

	let decrypted: Buffer;
	try {
		decrypted = Buffer.concat([
			decipher.update(Buffer.from(cipherText, "base64")),
			decipher.final(),
		]);
	} catch {
		throw new Error("Error decrypting message");
	}

	return decodeDocument(decrypted.toString("latin1"));
};
