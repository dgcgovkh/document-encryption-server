import { createCanvas, ImageData } from "@napi-rs/canvas";
import QRCode from "qrcode";
import {
  getImageWidth,
  getOptions,
  qrToImageData,
} from "qrcode/lib/renderer/utils.js";
import PDFDocument from "pdfkit";

export function createQRCodeImageData(content, opts = {}) {
  const options = getOptions(opts);
  const data = QRCode.create(content, opts);
  const size = getImageWidth(data.modules.size, options);
  const image = new ImageData(size, size);
  qrToImageData(image.data, data, options);
  return image;
}

export function createQRCodeBuffer(content, backgroundImage) {
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

export async function createPDFBufferFromImage(imageBuffer, size) {
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
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.end();
  });
}

export function bufferToDataURL(buffer, mimeType = "image/png") {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
