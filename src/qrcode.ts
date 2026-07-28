import { createCanvas, ImageData, type Image } from "@napi-rs/canvas";
import QRCode, { type QRCodeRenderersOptions } from "qrcode";
import {
	getImageWidth,
	getOptions,
	qrToImageData,
} from "qrcode/lib/renderer/utils.js";
import PDFDocument from "pdfkit";

export function createQRCodeImageData(
	content: string,
	opts: QRCodeRenderersOptions = {},
): ImageData {
	const options = getOptions(opts);
	const data = QRCode.create(content, opts);
	const size = getImageWidth(data.modules.size, options);
	const image = new ImageData(size, size);
	qrToImageData(image.data, data, options);
	return image;
}

export function createQRCodeBuffer(
	content: string,
	backgroundImage: Image,
): Buffer {
	const canvas = createCanvas(backgroundImage.width, backgroundImage.height);
	const ctx = canvas.getContext("2d");
	ctx.drawImage(backgroundImage, 0, 0);

	const margin = (canvas.width * 10) / 120;
	const image = createQRCodeImageData(content, {
		width: canvas.width - margin * 2,
		margin: 0,
	});
	ctx.putImageData(image, margin, margin);
	return canvas.toBuffer("image/png");
}

export async function createPDFBufferFromImage(
	imageBuffer: Buffer,
	size: [number, number],
): Promise<Buffer> {
	return new Promise((resolve) => {
		const doc = new PDFDocument({
			margin: 0,
			size,
		});

		doc.image(imageBuffer, {
			align: "center",
			valign: "center",
			cover: [doc.page.width, doc.page.height],
		});
		const buffers: Buffer[] = [];
		doc.on("data", (chunk: Buffer) => buffers.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(buffers)));
		doc.end();
	});
}

export function bufferToDataURL(buffer: Buffer, mimeType = "image/png"): string {
	return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
