import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/server.ts"],
	outDir: "dist",
	format: "esm",
	platform: "node",
	target: "node22",
	dts: false,
	clean: true,
	sourcemap: true,
	minify: true
});
