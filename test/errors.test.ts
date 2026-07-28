import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
	asyncHandler,
	badRequest,
	errorHandler,
	HttpError,
} from "../src/errors.js";

function mockResponse() {
	const res = {
		headersSent: false,
		statusCode: 0,
		payload: undefined as unknown,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(body: unknown) {
			this.payload = body;
			return this;
		},
	};
	return res as unknown as Response & typeof res;
}

const handle = (err: unknown, res: Response, next: NextFunction = vi.fn()) =>
	errorHandler(err, {} as Request, res, next);

describe("HttpError", () => {
	it("carries status and body", () => {
		const err = new HttpError(418, { message: "TEAPOT" });

		expect(err.status).toBe(418);
		expect(err.body).toEqual({ message: "TEAPOT" });
		expect(err.message).toBe("TEAPOT");
	});

	it("falls back to a generic message", () => {
		expect(new HttpError(500, {}).message).toBe("Request failed");
	});
});

describe("badRequest", () => {
	it("builds a 400", () => {
		expect(badRequest("NOPE").status).toBe(400);
	});

	it("merges extra fields into the body", () => {
		expect(badRequest("NOPE", { errors: [1] }).body).toEqual({
			message: "NOPE",
			errors: [1],
		});
	});
});

describe("asyncHandler", () => {
	it("forwards rejections to next", async () => {
		const next = vi.fn();
		const error = new Error("boom");

		asyncHandler(async () => {
			throw error;
		})({} as Request, {} as Response, next);
		await vi.waitFor(() => expect(next).toHaveBeenCalledWith(error));
	});

	it("does not call next on success", async () => {
		const next = vi.fn();

		asyncHandler(async () => {})({} as Request, {} as Response, next);
		await new Promise((r) => setTimeout(r, 10));
		expect(next).not.toHaveBeenCalled();
	});
});

describe("errorHandler", () => {
	it("renders an HttpError verbatim", () => {
		const res = mockResponse();
		handle(new HttpError(400, { message: "INVALID_DATA", errors: [] }), res);

		expect(res.statusCode).toBe(400);
		expect(res.payload).toEqual({ message: "INVALID_DATA", errors: [] });
	});

	it("maps a body-parser syntax error to INVALID_JSON", () => {
		const res = mockResponse();
		const err = Object.assign(new SyntaxError("Unexpected token"), {
			status: 400,
			type: "entity.parse.failed",
			body: "{bad",
		});
		handle(err, res);

		expect(res.statusCode).toBe(400);
		expect(res.payload).toEqual({ message: "INVALID_JSON" });
	});

	it("maps an oversized body to 413 rather than 500", () => {
		const res = mockResponse();
		const err = Object.assign(new Error("request entity too large"), {
			status: 413,
			type: "entity.too.large",
		});
		handle(err, res);

		expect(res.statusCode).toBe(413);
		expect(res.payload).toEqual({ message: "PAYLOAD_TOO_LARGE" });
	});

	it("maps an unsupported encoding to 415", () => {
		const res = mockResponse();
		const err = Object.assign(new Error("unsupported encoding"), {
			status: 415,
			type: "encoding.unsupported",
		});
		handle(err, res);

		expect(res.statusCode).toBe(415);
		expect(res.payload).toEqual({ message: "UNSUPPORTED_ENCODING" });
	});

	it("labels an unrecognised body-parser type generically", () => {
		const res = mockResponse();
		const err = Object.assign(new Error("odd"), {
			status: 400,
			type: "entity.verify.failed",
		});
		handle(err, res);

		expect(res.payload).toEqual({ message: "INVALID_REQUEST" });
	});

	it("does not treat an ordinary error carrying a status as client input", () => {
		const res = mockResponse();
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		handle(Object.assign(new Error("internal"), { status: 400 }), res);
		spy.mockRestore();

		expect(res.statusCode).toBe(500);
		expect(res.payload).toEqual({ message: "INTERNAL_ERROR" });
	});

	it("hides details of an unexpected error", () => {
		const res = mockResponse();
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		handle(new Error("secret internal detail"), res);
		spy.mockRestore();

		expect(res.statusCode).toBe(500);
		expect(res.payload).toEqual({ message: "INTERNAL_ERROR" });
		expect(JSON.stringify(res.payload)).not.toContain("secret");
	});

	it("logs the unexpected error for operators", () => {
		const res = mockResponse();
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const err = new Error("boom");
		handle(err, res);

		expect(spy).toHaveBeenCalledWith("Unhandled error:", err);
		spy.mockRestore();
	});

	it("delegates to next once headers are sent", () => {
		const res = mockResponse();
		res.headersSent = true;
		const next = vi.fn();
		const err = new Error("late");
		handle(err, res, next);

		expect(next).toHaveBeenCalledWith(err);
		expect(res.statusCode).toBe(0);
	});
});
