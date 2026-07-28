import type { Request, Response } from "express";
import camelcaseKeys from "camelcase-keys";
import { decrypt } from "objectcipher";
import { decryptString, type IEncryptionResults } from "../encryption.js";
import { KEY_TYPE_GOV_KH } from "../document.js";
import { badRequest } from "../errors.js";
import type { ApiVersion } from "./version.js";

interface DecryptBody {
	document_key?: unknown;
	encrypted_document?: unknown;
}

function decryptOrReject<T>(run: () => T): T {
	try {
		return run();
	} catch {
		throw badRequest("DECRYPTION_FAILED");
	}
}

export async function decryptHandler(
	version: ApiVersion,
	req: Request,
	res: Response,
): Promise<void> {
	const { document_key, encrypted_document } = req.body as DecryptBody;

	if (typeof document_key !== "string") {
		throw badRequest("INVALID_DOCUMENT_KEY");
	}

	if (typeof encrypted_document !== "object" || encrypted_document == null) {
		throw badRequest("INVALID_ENCRYPTED_DOCUMENT");
	}

	const document = encrypted_document as Record<string, unknown>;

	if (document.type === KEY_TYPE_GOV_KH) {
		if (typeof document.cipherText !== "string") {
			throw badRequest("INVALID_ENCRYPTED_DOCUMENT");
		}

		const buffer = Buffer.from(document.cipherText, "base64");
		res.json(decryptOrReject(() => decrypt(buffer, document_key)));
		return;
	}

	const parts = version === 1 ? camelcaseKeys(document) : document;

	for (const field of ["cipherText", "iv", "tag"] as const) {
		if (typeof parts[field] !== "string") {
			throw badRequest("INVALID_ENCRYPTED_DOCUMENT");
		}
	}

	const rawString = decryptOrReject(() =>
		decryptString({ ...parts, key: document_key } as IEncryptionResults),
	);

	res.json(decryptOrReject(() => JSON.parse(rawString)));
}
