import type { QuickJSWASMModule } from "quickjs-emscripten";

export function dataTransform(
	QuickJS: QuickJSWASMModule,
	fn: string,
	data: unknown,
): string | null {
	const vm = QuickJS.newContext();

	const result = vm.evalCode(
		`(function(){
      function fail(message) { throw ({type: "validation", message}); }
      ${fn};
      const data = ${JSON.stringify(data)};
      const out = build(data);
      return JSON.stringify(out === undefined ? null : out);
    })();`,
		"transform.js",
	);

	const cleanup = () => {
		try {
			result.dispose();
			vm.dispose();
		} catch (e) {
			console.error(e);
		}
	};

	if (result.error) {
		const err = vm.dump(result.error);
		cleanup();
		throw err;
	}

	let output: unknown;
	try {
		output = JSON.parse(vm.getString(result.unwrap()));
	} catch (e) {
		cleanup();
		throw e;
	}

	if (output == null) {
		cleanup();
		return null;
	}

	if (typeof output !== "string") {
		cleanup();
		throw new TypeError("Invalid output format");
	}

	cleanup();
	return output;
}
