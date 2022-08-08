/* eslint-disable @typescript-eslint/require-await */

import assert from 'node:assert';
import crypto from 'node:crypto';
import querystring from 'node:querystring';
import {promisify} from 'node:util';
import zlib from 'node:zlib';

import * as htmlEntities from 'html-entities';
import lzString from 'lz-string';

import {regExpEscape} from './utils';

type Buffers = AsyncGenerator<Buffer, void, undefined>;

export interface ValueTransformer {

	encodings?(value: Buffer): Buffers;

	extractDecode?(value: Buffer, minLength: number): Buffers;
}

export class HashTransform implements ValueTransformer {
	constructor(public readonly algorithm: string) {}

	toString() {return this.algorithm;}

	async* encodings(value: Buffer): Buffers {
		yield crypto.createHash(this.algorithm)
			  .update(value)
			  .digest();
	}
}

/** 2-3 chars: digit 62, digit 63, [padding] */
export type Base64Dialect = string;

export class Base64Transform implements ValueTransformer {
	static readonly paddedDialect: Base64Dialect     = '+/=';
	static readonly nonPaddedDialect: Base64Dialect  = '+/';
	static readonly urlSafeDialect: Base64Dialect    = '-_';
	/** Used by {@link import('lz-string').compressToEncodedURIComponent} */
	static readonly altUrlSafeDialect: Base64Dialect = '+-$';

	readonly #findBase64Regexes: Record<Base64Dialect, RegExp>;

	constructor(public readonly dialects: ReadonlySet<Base64Dialect> = new Set([
		Base64Transform.paddedDialect,
		Base64Transform.nonPaddedDialect,
		Base64Transform.urlSafeDialect,
		Base64Transform.altUrlSafeDialect,
	])) {
		this.#findBase64Regexes = Object.fromEntries([...dialects]
			  // Skip padded versions if non-padded versions exist
			  .filter(dialect => !(dialect.length === 3 && dialects.has(dialect.substring(0, 2))))
			  .map(dialect => {
				  const [digit62, digit63, padding] = dialect;

				  const escapedDigits  = `A-Za-z0-9${regExpEscape(digit62! + digit63!)}`,
				        escapedPadding = padding ? regExpEscape(padding) : undefined;
				  return [dialect, new RegExp(escapedPadding
						// Encoded string is padded to make the length a multiple of 4
						? String.raw`\b(?:[${escapedDigits}]{4})*(?:[${escapedDigits}]{4}|[${escapedDigits}]{3}${escapedPadding}|(?:[${escapedDigits}]{2}${escapedPadding}{2})|(?:[${escapedDigits}]${escapedPadding}{3}))\b`
						: String.raw`\b[${escapedDigits}]+\b` /*TODO? enforce padding if present*/, 'g')];
			  }));
	}

	toString() {return 'base64';}

	async* encodings(value: Buffer): Buffers {
		const base64 = value.toString('base64');
		for (const dialect of this.dialects)
			if (dialect === '+/=') yield Buffer.from(base64); // Prevent unnecessary work
			else {
				// Replace last digits & padding
				const [digit62, digit63, padding] = dialect;
				const digitMap                    = {'+': digit62!, '/': digit63!, '=': padding ?? ''};
				yield Buffer.from(base64.replaceAll(/[+/=]/g, c => digitMap[c as '+' | '/' | '=']));
			}
	}

	async* extractDecode(value: Buffer, minLength: number): Buffers {
		// Remove newlines
		const str = value.toString().replaceAll(/[\r\n]/g, '');
		for (const [dialect, regex] of Object.entries(this.#findBase64Regexes))
			  // Match all possible Base64 strings
			for (let [match] of str.matchAll(regex)) {
				if (match!.length < minLength) continue;

				// Remove any padding, decoding works without it
				const [, , padding] = dialect;
				if (padding) match = match!.replaceAll(padding, '');

				if (dialect.startsWith('+/')) yield Buffer.from(match!, 'base64');
				if (dialect.startsWith('-_')) yield Buffer.from(match!, 'base64url');
				else {
					// Replace last digits with regular '+/' and decode
					const [digit62, digit63] = dialect;
					const digitMap           = {[digit62!]: '+', [digit63!]: '/'};
					yield Buffer.from(match!.replaceAll(
						  new RegExp(`[${regExpEscape(digit62! + digit63!)}]`, 'g'),
						  c => digitMap[c]!), 'base64');
				}
			}
	}
}

export class HexTransform implements ValueTransformer {
	constructor(public readonly variants: ReadonlySet<'lowercase' | 'uppercase'> = new Set(['lowercase', 'uppercase'])) {
		assert(variants.size);
	}

	toString() {return 'hex';}

	async* encodings(value: Buffer): Buffers {
		const hex = value.toString('hex');
		if (this.variants.has('lowercase')) yield Buffer.from(hex.toLowerCase());
		if (this.variants.has('uppercase')) yield Buffer.from(hex.toUpperCase());
	}

	async* extractDecode(value: Buffer, minLength: number): Buffers {
		// Match all possible HEX strings with consistent casing throughout
		const hexRegex =
			        this.variants.has('lowercase')
					      ? this.variants.has('uppercase')
						        ? /\b(?:(?:[a-f0-9]{2})+|(?:[A-F0-9]{2})+)\b/g
						        : /\b(?:[a-f0-9]{2})+|\b/g
					      : /\b(?:[A-F0-9]{2})+|\b/g;
		for (const [match] of value.toString().matchAll(hexRegex))
			if (match!.length >= minLength) yield Buffer.from(match!, 'hex');
	}
}

export class UriTransform implements ValueTransformer {
	toString() {return 'uri';}

	async* encodings(value: Buffer): Buffers {
		yield Buffer.from(querystring.escape(value.toString()));
	}

	async* extractDecode(value: Buffer, minLength: number): Buffers {
		// Match all possible strings of URL units excluding splitters /&= (https://url.spec.whatwg.org/#url-units)
		const uriComponentRegex = /\b(?:[a-fA-F0-9!$'()*+,.:;?@_~\xA0-\u{10FFFD}-]|%[a-fA-F0-9]{2})+\b/ug;
		for (const [match] of value.toString().matchAll(uriComponentRegex))
			// Match should include at least one percent-encoded character, otherwise decoding is unnecessary
			if (match!.length >= minLength && /%[a-fA-F0-9]{2}/.test(match!))
				yield Buffer.from(querystring.unescape(match!));
	}
}

export class JsonStringTransform implements ValueTransformer {
	toString() {return 'json-string';}

	async* extractDecode(value: Buffer, minLength: number): Buffers {
		// Try to match all JSON strings (including quotes "") (https://www.json.org/json-en.html#grammar)
		// eslint-disable-next-line no-control-regex
		const jsonStringRegex = /"(?:[^"\\\0-\x1f]|\\(?:["\\/bfnrt]|u[a-fA-F0-9]{4}))+"/g;
		for (const [match] of value.toString().matchAll(jsonStringRegex))
			if (match!.length >= minLength) yield Buffer.from(JSON.parse(match!) as string);
	}
}

export class HtmlEntitiesTransform implements ValueTransformer {
	toString() {return 'html-entities';}

	async* encodings(value: Buffer): Buffers {
		yield Buffer.from(htmlEntities.encode(value.toString())
			  .replaceAll('&quot;', '"')
			  .replaceAll('&apos;', "'"));
	}

	async* extractDecode(value: Buffer): Buffers {
		yield Buffer.from(htmlEntities.decode(value.toString()));
	}
}

export class LZStringTransform implements ValueTransformer {
	constructor(public readonly variants: ReadonlySet<'bytes' | 'ucs2' | 'utf16' | 'base64' | 'uri'>
		  = new Set(['bytes', 'ucs2', 'utf16', 'base64', 'uri'])) {}

	toString() {return 'lz-string';}

	async* encodings(value: Buffer): Buffers {
		const strs = [
			value.toString(), // For compressed text
			value.toString('binary'), // For compressed binary data
		];
		if (strs[1] === strs[0]) strs.pop(); // If only ASCII is used, encoding 'binary' does not change anything
		for (const str of strs)
			for (const variant of this.variants) {
				if (variant === 'ucs2')
					// Compress to string with 16 significant bits per char
					// Will have bytes swapped compared to compressToUint8Array
					yield Buffer.from(lzString.compress(str), 'ucs2');
				else yield Buffer.from(lzString[({
					'bytes': 'compressToUint8Array', // Compress to bytes
					'utf16': 'compressToUTF16', // Compress to string with 15 significant bits per char
					'base64': 'compressToBase64', // Compress to Base64, note that the output may not be a whole number of bytes
					'uri': 'compressToEncodedURIComponent', // Compress to some URI-safe Base64 variant
				} as const)[variant]](str));
			}
	}

	/**
	 * Note: does not do base64/uri directly, prepare with {@link Base64Transform} for that
	 */
	async* extractDecode(value: Buffer): Buffers {
		// Does not include plain 'compress' because it is not compatible with UTF-16 and does not survive UTF-8 translation
		// e.g. Buffer.from('\udfff').equals(Buffer.from('\uda00')) and Buffer.from('\udfff' or '\uda00').toString() === '\ufffd'

		if (this.variants.has('bytes')) {
			// Pad value to an even number of bytes
			let evenValue = value;
			if (value.length % 2 !== 0) {
				evenValue = Buffer.alloc(value.length + 1);
				value.copy(evenValue);
			}
			const res = lzString.decompressFromUint8Array(evenValue);
			if (res) {
				yield Buffer.from(res); // For compressed text
				yield Buffer.from(res, 'binary'); // For compressed binary data
			}
		}
		if (this.variants.has('utf16')) {
			const res = lzString.decompressFromUTF16(value.toString());
			if (res) {
				yield Buffer.from(res);
				yield Buffer.from(res, 'binary');
			}
		}
	}
}

export class CompressionTransform implements ValueTransformer {
	constructor(public readonly formats: ReadonlySet<'gzip' | 'deflate' | 'deflate-raw' | 'brotli'> =
		  new Set(['gzip', 'deflate', 'deflate-raw', 'brotli'])) {}

	toString() {return 'compress';}

	async* encodings(value: Buffer): Buffers {
		yield* [...this.formats].map(format => promisify({
			'gzip': zlib.gzip,
			'deflate': zlib.deflate,
			'deflate-raw': zlib.deflateRaw,
			'brotli': zlib.brotliCompress,
		}[format])(value));
	}

	async* extractDecode(value: Buffer): Buffers {
		if (this.formats.has('gzip') || this.formats.has('deflate')) {
			try {
				yield promisify(zlib.unzip)(value);
				return;
			} catch {
				/*ignored*/
			}
		}

		for (const format of this.formats) {
			const decompress = ({
				'deflate-raw': zlib.inflateRaw,
				'brotli': zlib.brotliDecompress,
			} as Record<string, (buf: zlib.InputType, callback: zlib.CompressCallback) => void>)[format];
			if (!decompress) continue;
			try {
				yield promisify(decompress)(value);
			} catch {
				/*ignored*/
			}
		}
	}
}
