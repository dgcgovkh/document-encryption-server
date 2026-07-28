declare module "qrcode/lib/renderer/utils.js" {
	import type { QRCode, QRCodeRenderersOptions } from "qrcode";

	interface NormalizedOptions {
		width?: number;
		scale: number;
		margin: number;
		color: {
			dark: { r: number; g: number; b: number; a: number; hex: string };
			light: { r: number; g: number; b: number; a: number; hex: string };
		};
		type?: string;
		rendererOpts: Record<string, unknown>;
	}

	export function getOptions(
		options?: QRCodeRenderersOptions,
	): NormalizedOptions;

	export function getImageWidth(
		qrSize: number,
		options: NormalizedOptions,
	): number;

	export function qrToImageData(
		imgData: Uint8ClampedArray,
		qr: QRCode,
		options: NormalizedOptions,
	): void;
}
