import type { Request, Response } from "express";
import {
	bufferToDataURL,
	createPDFBufferFromImage,
	createQRCodeBuffer,
} from "../qrcode.js";
import { badRequest } from "../errors.js";
import type { AppContext } from "../config.js";

interface QrcodeBody {
	qrcode_type?: unknown;
	document_ref?: unknown;
	document_key?: unknown;
}

const QRCODE_TYPES = ["png", "pdf"] as const;
type QrcodeType = (typeof QRCODE_TYPES)[number];

function isQrcodeType(value: string): value is QrcodeType {
	return (QRCODE_TYPES as readonly string[]).includes(value);
}

export async function qrcodeHandler(
	ctx: AppContext,
	req: Request,
	res: Response,
): Promise<void> {
	const background = ctx.qrcodeBackground;

	if (background == null) {
		throw badRequest(
			"server-config.json is outdated. Please contact the support team.",
		);
	}

	const { qrcode_type, document_ref, document_key } = req.body as QrcodeBody;

	if (typeof qrcode_type !== "string") {
		throw badRequest("qrcode_type is required.");
	}

	const type = qrcode_type.toLowerCase();

	if (!isQrcodeType(type)) {
		throw badRequest("invalid qrcode_type. Only pdf or png is allowed!");
	}

	if (typeof document_ref !== "string") {
		throw badRequest("document_ref is invalid!");
	}

	if (typeof document_key !== "string") {
		throw badRequest("document_key is invalid!");
	}

	const baseUrl = ctx.config.template.issuers[0].url;
	const url = new URL(
		`/verify/${encodeURIComponent(document_ref)}`,
		baseUrl,
	);
	url.searchParams.set("key", document_key);

	const png = createQRCodeBuffer(url.href, background);

	const qrcode_data =
		type === "png"
			? bufferToDataURL(png, "image/png")
			: bufferToDataURL(
					await createPDFBufferFromImage(png, [
						background.width,
						background.height,
					]),
					"application/pdf",
				);

	res.json({ qrcode_data, url: url.href });
}
