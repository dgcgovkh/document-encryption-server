import { describe, expect, it } from "vitest";
import { loadImage } from "@napi-rs/canvas";
import {
	bufferToDataURL,
	createPDFBufferFromImage,
	createQRCodeBuffer,
	createQRCodeImageData,
} from "../src/qrcode.js";

const BACKGROUND = "test/fixtures/qrcode-background.png";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const background = await loadImage(BACKGROUND);

describe("createQRCodeImageData", () => {
	it("produces a square image", () => {
		const image = createQRCodeImageData("https://x.test", {
			width: 200,
			margin: 0,
		});

		expect(image.width).toBe(image.height);
		expect(image.data.length).toBe(image.width * image.height * 4);
	});

	it("scales with the requested width", () => {
		const small = createQRCodeImageData("https://x.test", { width: 100, margin: 0 });
		const large = createQRCodeImageData("https://x.test", { width: 400, margin: 0 });

		expect(large.width).toBeGreaterThan(small.width);
	});
});

describe("createQRCodeBuffer", () => {
	it("returns a png matching the background dimensions", async () => {
		const buffer = createQRCodeBuffer("https://x.test/verify", background);
		const rendered = await loadImage(buffer);

		expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC);
		expect(rendered.width).toBe(background.width);
		expect(rendered.height).toBe(background.height);
	});

	it("is deterministic for the same content", () => {
		const a = createQRCodeBuffer("https://x.test/verify", background);
		const b = createQRCodeBuffer("https://x.test/verify", background);

		expect(a.equals(b)).toBe(true);
	});

	it("differs for different content", () => {
		const a = createQRCodeBuffer("https://x.test/a", background);
		const b = createQRCodeBuffer("https://x.test/b", background);

		expect(a.equals(b)).toBe(false);
	});

	it("encodes long urls", () => {
		const url = `https://x.test/verify/${"A".repeat(300)}`;
		expect(createQRCodeBuffer(url, background).subarray(0, 4)).toEqual(PNG_MAGIC);
	});
});

describe("createPDFBufferFromImage", () => {
	it("wraps the png in a pdf", async () => {
		const png = createQRCodeBuffer("https://x.test/verify", background);
		const pdf = await createPDFBufferFromImage(png, [
			background.width,
			background.height,
		]);

		expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
		expect(pdf.subarray(-6).toString()).toContain("%%EOF");
	});
});

describe("bufferToDataURL", () => {
	it("defaults to png", () => {
		expect(bufferToDataURL(Buffer.from("hi"))).toBe("data:image/png;base64,aGk=");
	});

	it("honours an explicit mime type", () => {
		expect(bufferToDataURL(Buffer.from("hi"), "application/pdf")).toBe(
			"data:application/pdf;base64,aGk=",
		);
	});
});
