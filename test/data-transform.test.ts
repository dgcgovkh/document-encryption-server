import { beforeAll, describe, expect, it } from "vitest";
import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";
import { dataTransform } from "../src/data-transform.js";

let QuickJS: QuickJSWASMModule;

beforeAll(async () => {
	QuickJS = await getQuickJS();
});

const run = (factory: string, data: unknown) =>
	dataTransform(QuickJS, factory, data);

describe("dataTransform", () => {
	it("returns the string built from the payload", () => {
		expect(run("function build(d){ return d.nid; }", { nid: "12345" })).toBe(
			"12345",
		);
	});

	it("passes nested data through", () => {
		expect(
			run("function build(d){ return d.a.b[1]; }", { a: { b: ["x", "y"] } }),
		).toBe("y");
	});

	it("returns null when the factory returns null", () => {
		expect(run("function build(){ return null; }", {})).toBeNull();
	});

	it("returns null when the factory returns undefined", () => {
		expect(run("function build(){ return undefined; }", {})).toBeNull();
	});

	it("propagates fail() as a validation error", () => {
		expect(() => run("function build(){ fail('nope'); }", {})).toThrowError(
			expect.objectContaining({ type: "validation", message: "nope" }),
		);
	});

	it("propagates a thrown Error", () => {
		expect(() => run("function build(){ throw new Error('boom'); }", {})).toThrow();
	});

	it("rejects a non-string result", () => {
		expect(() => run("function build(){ return 42; }", {})).toThrow(TypeError);
	});

	it("rejects an object result", () => {
		expect(() => run("function build(){ return {a:1}; }", {})).toThrow(
			"Invalid output format",
		);
	});

	it("fails when build is not defined", () => {
		expect(() => run("var notBuild = 1;", {})).toThrow();
	});

	it("escapes payload values rather than interpolating them as code", () => {
		const hostile = { nid: '"); globalThis.pwned = true; ("' };
		expect(run("function build(d){ return d.nid; }", hostile)).toBe(hostile.nid);
	});

	it("isolates state between invocations", () => {
		run("function build(){ globalThis.leaked = 1; return 'a'; }", {});
		expect(
			run("function build(){ return String(typeof globalThis.leaked); }", {}),
		).toBe("undefined");
	});

	it("disposes the context on the null path as well as the success path", () => {
		const rss = () => process.memoryUsage().rss;
		const N = 400;

		const beforeOk = rss();
		for (let i = 0; i < N; i++) run("function build(){ return 'x'; }", {});
		const success = rss() - beforeOk;

		const beforeNull = rss();
		for (let i = 0; i < N; i++) run("function build(){ return null; }", {});
		const nulls = rss() - beforeNull;

		// A leaked VM per call made this path grow several times faster.
		expect(nulls).toBeLessThan(Math.max(success, 1) * 3 + 20_000_000);
	});

	it("survives many sequential runs without exhausting the runtime", () => {
		for (let i = 0; i < 200; i++) {
			expect(run("function build(d){ return d.n; }", { n: String(i) })).toBe(
				String(i),
			);
		}
	});
});
