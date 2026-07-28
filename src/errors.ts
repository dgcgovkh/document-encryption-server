import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
	readonly status: number;
	readonly body: Record<string, unknown>;

	constructor(status: number, body: Record<string, unknown>) {
		super(typeof body.message === "string" ? body.message : "Request failed");
		this.name = "HttpError";
		this.status = status;
		this.body = body;
	}
}

export function badRequest(
	message: string,
	extra?: Record<string, unknown>,
): HttpError {
	return new HttpError(400, { message, ...extra });
}

export function asyncHandler(
	fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
	return (req, res, next) => {
		fn(req, res, next).catch(next);
	};
}

const BODY_PARSER_MESSAGES: Record<string, string> = {
	"entity.parse.failed": "INVALID_JSON",
	"entity.too.large": "PAYLOAD_TOO_LARGE",
	"encoding.unsupported": "UNSUPPORTED_ENCODING",
	"request.aborted": "REQUEST_ABORTED",
};

function bodyParserFailure(
	err: unknown,
): { status: number; message: string } | null {
	if (!(err instanceof Error)) return null;

	const candidate = err as Error & {
		status?: unknown;
		statusCode?: unknown;
		type?: unknown;
	};

	if (typeof candidate.type !== "string") return null;

	const status =
		typeof candidate.status === "number"
			? candidate.status
			: typeof candidate.statusCode === "number"
				? candidate.statusCode
				: 400;

	if (status < 400 || status >= 500) return null;

	return {
		status,
		message: BODY_PARSER_MESSAGES[candidate.type] ?? "INVALID_REQUEST",
	};
}

export function errorHandler(
	err: unknown,
	_req: Request,
	res: Response,
	next: NextFunction,
): void {
	if (res.headersSent) {
		next(err);
		return;
	}

	if (err instanceof HttpError) {
		res.status(err.status).json(err.body);
		return;
	}

	const bodyParser = bodyParserFailure(err);
	if (bodyParser) {
		res.status(bodyParser.status).json({ message: bodyParser.message });
		return;
	}

	console.error("Unhandled error:", err);
	res.status(500).json({ message: "INTERNAL_ERROR" });
}
