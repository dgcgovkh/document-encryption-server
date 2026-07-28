import { sha256 } from "js-sha256";
import { wrapDocument, type WrappedDocument } from "openattestation";
import { bufferToDataURL, createQRCodeBuffer } from "./qrcode.js";
import { dataTransform } from "./data-transform.js";
import { badRequest } from "./errors.js";
import type { AppContext } from "./config.js";

export const KEY_TYPE_GOV_KH = "VERIFY-GOV-KH-1.0";
export const KEY_TYPE_OA_1 = "OPEN-ATTESTATION-TYPE-1";

export const SUPPORTED_KEY_TYPES: ReadonlySet<string> = new Set([
	KEY_TYPE_GOV_KH,
	KEY_TYPE_OA_1,
]);

export const DEFAULT_KEY_LENGTH = 21;
export const MIN_KEY_LENGTH = 11;
export const MAX_KEY_LENGTH = 64;

export interface CustomUrl {
	url: string;
	qrcode_data: string;
}

export function formatUrl(
	value: string,
	data: Record<string, unknown> = {},
): string {
	return value.replace(/{{(.*?)}}/g, (_match, key: string) => {
		const name = key.trim();
		const replacement = data[name];
		if (replacement == null) {
			throw new Error(`Key: "${name}" doesn't exist in the data object.`);
		}
		return encodeURIComponent(String(replacement));
	});
}

function hash(data: string): string {
	return sha256.create().update(data).hex();
}

export function buildDocumentData(
	ctx: AppContext,
	data: Record<string, unknown>,
): Record<string, unknown> {
	const documentData: Record<string, unknown> = {
		...data,
		...ctx.config.template,
	};

	const identity = ctx.config.identity;
	if (identity == null) return documentData;

	let number: string | null;
	try {
		number = dataTransform(ctx.quickJS, identity.factory, data);
	} catch (e) {
		throw badRequest("INVALID_DATA", {
			errors: [{ message: (e as Error).message }],
		});
	}

	if (number != null) {
		documentData.$identity = { number: hash(number) };
	}

	return documentData;
}

export function wrap(
	documentData: Record<string, unknown>,
): WrappedDocument<Record<string, unknown>> {
	return wrapDocument(documentData);
}

export function createCustomUrl(
	ctx: AppContext,
	documentData: Record<string, unknown>,
	key: string,
): CustomUrl | undefined {
	const template = ctx.config.custom_url;
	if (typeof template !== "string" || ctx.qrcodeBackground == null) {
		return undefined;
	}

	const url = formatUrl(template, { ...documentData, key });

	return {
		url,
		qrcode_data: bufferToDataURL(
			createQRCodeBuffer(url, ctx.qrcodeBackground),
			"image/png",
		),
	};
}
