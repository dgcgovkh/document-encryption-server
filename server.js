import { encrypt, decrypt } from "objectcipher";
import snakecaseKeys from "snakecase-keys";
import camelcaseKeys from "camelcase-keys";
import { wrapDocument } from "@govtechsg/open-attestation";
import { encryptString, decryptString } from "@govtechsg/oa-encryption";
import Ajv from "ajv";
import express from "express";
import helmet from "helmet";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import gracefulShutdown from "http-graceful-shutdown";
import {
	bufferToDataURL,
	createPDFBufferFromImage,
	createQRCodeBuffer,
} from "./qrcode.js";
import { loadImage } from "@napi-rs/canvas";
import { getQuickJS } from "quickjs-emscripten";
import { dataTransform } from "./data-transform.js";
import { sha256 } from "js-sha256";
import { nanoid } from "nanoid";

const SUPPORTED_KEY_TYPES = new Set([
	"VERIFY-GOV-KH-1.0",
	"OPEN-ATTESTATION-TYPE-1",
]);

function hash(data) {
	return sha256.create().update(data).hex("hex");
}

const QuickJS = await getQuickJS();

const CONFIG_FILE = "server-config.json";

if (!fsSync.existsSync(CONFIG_FILE)) {
	console.error("server-config.json not found");
	process.exit(1);
}

const cfg = JSON.parse(await fs.readFile(CONFIG_FILE, "utf8"));
const app = express();
const maxPayloadSize = "50mb";
let QRCODE_BACKGROUND_IMAGE = null;

if ("qrcode" in cfg) {
	QRCODE_BACKGROUND_IMAGE = await loadImage(cfg.qrcode);
}

app.use(helmet());
app.use(express.json({ limit: maxPayloadSize }));
app.use(express.urlencoded({ extended: false, limit: maxPayloadSize }));
app.disable("x-powered-by");

async function decryptHandler({ req, res, next, version }) {
	try {
		const { document_key, encrypted_document } = req.body;

		if (encrypted_document.type === "VERIFY-GOV-KH-1.0") {
			const buffer = Buffer.from(encrypted_document.cipherText, "base64");
			const data = decrypt(buffer, document_key);
			res.json(data);
			return;
		}

		let rawString;
		if (version === 1) {
			rawString = decryptString({
				...camelcaseKeys(encrypted_document),
				key: document_key,
			});
		} else {
			rawString = decryptString({
				...encrypted_document,
				key: document_key,
			});
		}

		const data = JSON.parse(rawString);
		res.json(data);
	} catch (e) {
		next(e);
	}
}

async function encryptHandler({ req, res, next, version }) {
	try {
		const body = req.body;

		const documentKey = body.document_key;
		const documentKeyLength = body.document_key_length || 21;
		const documentKeyType = body.document_key_type || "OPEN-ATTESTATION-TYPE-1";

		if (!("data" in body) || typeof body.data !== "object") {
			res.status(400).json({ message: "INVALID_DATA" });
			return;
		}

		if (documentKey != null && typeof documentKey !== "string") {
			res.status(400).json({ message: "INVALID_DOCUMENT_KEY" });
			return;
		}

		if (!SUPPORTED_KEY_TYPES.has(documentKeyType)) {
			res.status(400).json({ message: "INVALID_DOCUMENT_KEY_TYPE" });
			return;
		}

		if (documentKeyType === "VERIFY-GOV-KH-1.0") {
			if (
				typeof documentKeyLength !== "number" ||
				documentKeyLength < 11 ||
				documentKeyLength > 64
			) {
				res.status(400).json({ message: "INVALID_DOCUMENT_KEY_LENGTH" });
				return;
			}
		}

		const ajv = new Ajv();
		const validate = ajv.compile(cfg.schema);
		const valid = validate(body.data);

		if (!valid) {
			res.status(400).json({
				message: "INVALID_DATA",
				errors: validate.errors,
			});
			return;
		}

		const documentData = {
			...body.data,
			...cfg.template,
		};

		if ("identity" in cfg) {
			try {
				const { factory } = cfg.identity;
				const num = dataTransform(QuickJS, factory, body.data);
				if (num != null) {
					documentData.$identity = {
						number: hash(num),
					};
				}
			} catch (e) {
				res.status(400).json({
					message: "INVALID_DATA",
					errors: [{ message: e.message }],
				});
				return;
			}
		}

		const wrappedDocument = wrapDocument(documentData);
		const signature = wrappedDocument.signature;
		const documentId = body.data[cfg.id_field];

		const rawString = JSON.stringify(wrappedDocument);

		if (documentKeyType === "VERIFY-GOV-KH-1.0") {
			const key = documentKey || nanoid(documentKeyLength);

			if (key.length < 11) {
				res.status(400).json({ message: "INVALID_DOCUMENT_KEY_LENGTH" });
				return;
			}

			res.json({
				document_id: documentId,
				document_signature: signature,
				document_key: key,
				encrypted_document: {
					cipherText: encrypt(wrappedDocument, key).toString("base64"),
					type: documentKeyType,
				},
			});
			return;
		}

		const { key, ...parts } = encryptString(rawString, documentKey);

		if (version === 1) {
			res.json({
				document_id: documentId,
				document_signature: snakecaseKeys(signature),
				document_key: key,
				encrypted_document: snakecaseKeys(parts),
			});
			return;
		}

		res.json({
			document_id: documentId,
			document_signature: signature,
			document_key: key,
			encrypted_document: parts,
		});
	} catch (e) {
		next(e);
	}
}

async function qrcodeHandler({ req, res, next }) {
	try {
		if (QRCODE_BACKGROUND_IMAGE == null) {
			res.status(400).json({
				message:
					"server-config.json is outdated. Please contact the support team.",
			});
			return;
		}

		let { qrcode_type, document_ref, document_key } = req.body;

		if (typeof qrcode_type !== "string") {
			res.status(400).json({
				message: "qrcode_type is required.",
			});
		}

		qrcode_type = qrcode_type.toLowerCase();

		if (qrcode_type !== "png" && qrcode_type !== "pdf") {
			res.status(400).json({
				message: "invalid qrcode_type. Only pdf or png is allowed!",
			});
			return;
		}

		if (typeof document_ref !== "string") {
			res.status(400).json({
				message: "document_ref is invalid!",
			});
			return;
		}

		if (typeof document_key !== "string") {
			res.status(400).json({
				message: "document_key is invalid!",
			});
			return;
		}

		const baseUrl = cfg.template.issuers[0].url;
		const url = new URL(`/verify/${document_ref}`, baseUrl);
		url.searchParams.set("key", document_key);

		let qrcode_data = null;
		if (qrcode_type === "png") {
			qrcode_data = bufferToDataURL(
				createQRCodeBuffer(url.href, QRCODE_BACKGROUND_IMAGE),
				"image/png",
			);
		}

		if (qrcode_type === "pdf") {
			qrcode_data = bufferToDataURL(
				await createPDFBufferFromImage(
					createQRCodeBuffer(url.href, QRCODE_BACKGROUND_IMAGE),
					[QRCODE_BACKGROUND_IMAGE.width, QRCODE_BACKGROUND_IMAGE.height],
				),
				"application/pdf",
			);
		}

		if (qrcode_data == null) {
			res.status(400).json({ message: "Failed to create the QR code image." });
			return;
		}

		res.json({
			qrcode_data,
			url: url.href,
		});
	} catch (e) {
		next(e);
	}
}

app.post("/api/decrypt-document", async (req, res, next) => {
	await decryptHandler({ req, res, next, version: 0 });
});

app.post("/api/encrypt-document", async (req, res, next) => {
	await encryptHandler({ req, res, next, version: 0 });
});

app.post("/api/v1/decrypt-document", async (req, res, next) => {
	await decryptHandler({ req, res, next, version: 1 });
});

app.post("/api/v1/encrypt-document", async (req, res, next) => {
	await encryptHandler({ req, res, next, version: 1 });
});

app.post("/api/v1/qrcode", async (req, res, next) => {
	await qrcodeHandler({ req, res, next });
});

app.post("/api/qrcode", async (req, res, next) => {
	await qrcodeHandler({ req, res, next });
});

const port = Number.parseInt(process.env.PORT) || 80;
app.listen(port, () => console.info(`http://0.0.0.0:${port}`));
gracefulShutdown(app);
