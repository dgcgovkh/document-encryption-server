/**
 * @param {import('quickjs-emscripten').QuickJSWASMModule} QuickJS
 * @param {string} fn
 * @param {any} data
 * @returns
 */
export function dataTransform(QuickJS, fn, data) {
	const vm = QuickJS.newContext();

	const result = vm.evalCode(
		`(function(){
      function fail(message) { throw ({type: "validation", message}); }
      ${fn};
      const data = ${JSON.stringify(data)};
      const out = build(data);
      return JSON.stringify(out);
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

	const output = JSON.parse(vm.getString(result.unwrap()));

	if (output == null) return null;

	if (typeof output !== "string") {
		cleanup();
		throw new TypeError("Invalid output format");
	}

	cleanup();
	return output;
}
