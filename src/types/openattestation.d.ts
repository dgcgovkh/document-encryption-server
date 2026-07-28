declare module "openattestation" {
	export interface Signature {
		type: "SHA3MerkleProof";
		targetHash: string;
		proof: string[];
		merkleRoot: string;
		[key: string]: unknown;
	}

	export interface WrappedDocument<T = Record<string, unknown>> {
		version: string;
		schema?: string;
		data: T;
		signature: Signature;
	}

	export interface WrapDocumentOptions {
		externalSchemaId?: string;
	}

	export function wrapDocument<T = Record<string, unknown>>(
		data: T,
		options?: WrapDocumentOptions,
	): WrappedDocument;

	export function wrapDocuments<T = Record<string, unknown>>(
		data: T[],
		options?: WrapDocumentOptions,
	): WrappedDocument[];

	export function getData<T = Record<string, unknown>>(
		document: WrappedDocument,
	): T;

	export function verify(document: WrappedDocument): boolean;

	export function obfuscateDocument(
		document: WrappedDocument,
		fields: string[] | string,
	): WrappedDocument;

	export function digestDocument(document: {
		data: Record<string, unknown>;
	}): string;

	export const SchemaId: { v2: string; v3: string };
}
