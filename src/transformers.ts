/* eslint-disable @typescript-eslint/require-await */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {PassThrough, Readable} from 'node:stream';
import consumers from 'node:stream/consumers';
import {promisify} from 'node:util';
import zlib from 'node:zlib';

import busboy from 'busboy';
import * as htmlEntities from 'html-entities';
import lzString from 'lz-string';

import {ObjectStream, regExpEscape} from './utils';

/** Consume using `for await` or e.g. {@link import('./utils').asyncGeneratorCollect} */
type Buffers = AsyncGenerator<Buffer, void, undefined>;

/**
 * Encoder/decoder.
 * Strings in `Buffer`s are UTF-8 encoded
 */
export interface ValueTransformer {
	/** Name of the transformer */
	toString(): string;

	/** Encoder: Get all possible encodings of `value` */
	encodings?(value: Buffer): Buffers;

	/** Decoder: Try to decode (substrings of `minLength` bytes of) `value` and return all possible decoded values */
	extractDecode?(value: Buffer, minLength: number): Buffers;

	/** For decoders that decode compressed values: minimal length of `value` when compressed */
	compressedLength?(value: Buffer): Promise<number>;
}

/** Hash value */
export class HashTransform implements ValueTransformer {
	/** @see import('node:crypto').createHash */
	constructor(
		  public readonly algorithm: string,
		  public readonly outputBytes?: number,
		  public readonly prefix?: Buffer,
		  public readonly suffix?: Buffer,
	) {}

	toString() {
		return this.outputBytes ? `${this.algorithm}/${this.outputBytes}` : this.algorithm;
	}

	async* encodings(value: Buffer): Buffers {
		const hasher = crypto.createHash(this.algorithm, {outputLength: this.outputBytes});
		if (this.prefix) hasher.update(this.prefix);
		hasher.update(value);
		if (this.suffix) hasher.update(this.suffix);
		yield hasher.digest();
	}
}

/** 2-3 chars: digit 62, digit 63, [padding] */
export type Base64Dialect = string;

/**
 * Base64 encode/decode value.
 * Supports extracting substrings
 */
export class Base64Transform implements ValueTransformer {
	static readonly paddedDialect: Base64Dialect     = '+/=';
	static readonly nonPaddedDialect: Base64Dialect  = '+/';
	static readonly urlSafeDialect: Base64Dialect    = '-_';
	/** Used by {@link import('lz-string').compressToEncodedURIComponent} */
	static readonly altUrlSafeDialect: Base64Dialect = '+-';

	/**
	 * Match all substrings for a dialect.
	 * Excludes padded versions if corresponding non-padded versions exist
	 */
	readonly #findBase64Regexes: Record<Base64Dialect, RegExp>;

	/**
	 * @param trySkipFirstChars Skip 0-3 chars of a matching substring. Currently only works with non-padded dialects
	 */
	constructor(
		  public readonly dialects: ReadonlySet<Base64Dialect> = new Set([
			  Base64Transform.paddedDialect,
			  Base64Transform.nonPaddedDialect,
			  Base64Transform.urlSafeDialect,
			  Base64Transform.altUrlSafeDialect,
		  ]),
		  public readonly trySkipFirstChars                    = false,
	) {
		assert(dialects.size);
		this.#findBase64Regexes = Object.fromEntries([...dialects]
			  // Skip padded versions if non-padded versions exist
			  .filter(dialect => !(dialect.length === 3 && dialects.has(dialect.substring(0, 2))))
			  .map(dialect => {
				  const [digit62, digit63, padding] = dialect;

				  const escapedDigits  = `A-Za-z0-9${regExpEscape(digit62! + digit63!)}`,
				        escapedPadding = padding ? regExpEscape(padding) : undefined;
				  // Enforce padding if specified
				  // Uses negative lookarounds to enforce boundaries of the regex, as \b does not work well with e.g. +/=
				  return [dialect, new RegExp(escapedPadding
						// Encoded string is padded to make the length a multiple of 4
						? String.raw`(?<![${escapedDigits}])(?:[${escapedDigits}]{4})*(?:[${escapedDigits}]{4}|[${escapedDigits}]{3}${escapedPadding}|(?:[${escapedDigits}]{2}${escapedPadding}{2})|(?:[${escapedDigits}]${escapedPadding}{3}))(?![${escapedDigits}${escapedPadding}])`
						: String.raw`(?<![${escapedDigits}])[${escapedDigits}]+(?!${escapedDigits})`, 'g')];
			  }));
	}

	toString() {return 'base64' as const;}

	async* encodings(value: Buffer): Buffers {
		const base64 = value.toString('base64');
		// Encode using all dialects
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
		// Try to decode substrings using all dialects (excl. padded if corresponding non-padded exist)
		for (const [dialect, regex] of Object.entries(this.#findBase64Regexes))
			  // Match all possible Base64 strings
			for (let [match] of str.matchAll(regex)) {
				if (match!.length < minLength) continue;

				// Remove any padding, decoding works without it
				const [, , padding] = dialect;
				if (padding) match = match!.replaceAll(padding, '');

				if (!(dialect.startsWith('+/') || dialect.startsWith('-_'))) {
					// Replace last digits with regular '+/' and decode
					const [digit62, digit63] = dialect;
					const digitMap           = {[digit62!]: '+', [digit63!]: '/'};
					match                    = match!.replaceAll(
						  new RegExp(`[${regExpEscape(digit62! + digit63!)}]`, 'g'),
						  c => digitMap[c]!);
				}

				for (let skipChars = 0; skipChars < (this.trySkipFirstChars ? 4 : 1); ++skipChars) {
					if (skipChars >= match!.length || match!.length - skipChars < minLength) break;
					let encoded = match!.substring(skipChars);

					// Regular Base64 discards any bits that do not fit inside the rounded down number of bytes
					// e.g. Buffer.from('/', 'base64').length === 0
					// But this is a problem for lz-string's compressToBase64 in some cases,
					// e.g. lz.compressToBase64('ssagwefhbyigadÿÿÿÿÿ').endsWith('Q===')
					// The code below checks if '1' bits were dropped and if so it appends extra '0' bits
					// to force the byte to be included
					// It also adds '0' bits if we have a case like 'A===' because this will not occur when encoding bytes
					// and otherwise the extra digit is ignored
					if (encoded.length % 4 !== 0) {
						const decodeChar               = (c: string) =>
							  `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789${dialect}`.indexOf(c);
						const bitsDroppedFromLastDigit = encoded.length * 6 % 8;
						const droppedBitsMask          = (1 << bitsDroppedFromLastDigit) - 1;
						const overflow                 = !!(decodeChar(encoded.at(-1)!) & droppedBitsMask);
						if (overflow || encoded.length % 4 === 1) encoded += 'A'; // Append '0' bits
					}

					// Use built-in versions if possible
					if (dialect.startsWith('-_')) yield Buffer.from(encoded, 'base64url');
					else yield Buffer.from(encoded, 'base64');
				}
			}
	}
}

/**
 * HEX encode/decode value.
 * Supports extracting substrings
 */
export class HexTransform implements ValueTransformer {
	constructor(public readonly variants: ReadonlySet<'lowercase' | 'uppercase'> = new Set(['lowercase', 'uppercase'])) {
		assert(variants.size);
	}

	toString() {return 'hex' as const;}

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
						        : /\b(?:[a-f0-9]{2})+\b/g
					      : /\b(?:[A-F0-9]{2})+\b/g;
		for (const [match] of value.toString().matchAll(hexRegex))
			if (match!.length >= minLength) yield Buffer.from(match!, 'hex');
	}
}

//TODO? also use legacy `escape` & `unescape`
/**
 * Encode/decode URI components including components with '+' instead '%20' (`application/x-www-form-urlencoded`).
 * Supports extracting substrings
 */
export class UriTransform implements ValueTransformer {
	toString() {return 'uri' as const;}

	async* encodings(value: Buffer): Buffers {
		// Not suited for encoding binary data, e.g. decodeURIComponent('\xda') === '%C3%9A'
		// and encodeURIComponent('\uda00') throws
		try {
			const encoded = encodeURIComponent(value.toString());
			yield Buffer.from(encoded);
			yield Buffer.from(encoded.replaceAll('%20', '+'));
		} catch (err) {
			if (err instanceof URIError) {
				/*ignore*/
			} else throw err;
		}
	}

	async* extractDecode(value: Buffer, minLength: number): Buffers {
		// Match all possible strings of URL units excluding splitters /&=? (https://url.spec.whatwg.org/#url-units)
		const uriComponentRegex = /(?<![a-zA-Z0-9!$'()*+,.:;@_~\xA0-\u{10FFFD}%-])(?:[a-zA-Z0-9!$'()*+,.:;@_~\xA0-\u{10FFFD}-]|%[a-fA-F0-9]{2})+(?![a-zA-Z0-9!$'()*+,.:;@_~\xA0-\u{10FFFD}%-])/ug;
		for (const [match] of value.toString().matchAll(uriComponentRegex))
			  // Match should include at least one percent-encoded character or +, otherwise decoding is unnecessary
			if (match!.length >= minLength && /%[a-fA-F0-9]{2}|\+/.test(match!))
				try {
					yield Buffer.from(decodeURIComponent(match!.replaceAll('+', '%20')));
				} catch (err) {
					if (err instanceof URIError) {
						/*ignore*/
					} else throw err;
				}
	}
}

/**
 * Encode/decode using a custom character mapping, leave characters not in the mapping alone.
 * Does not support extracting substrings
 */
export class CustomStringMapTransform implements ValueTransformer {
	readonly #revMap: Record<string, string>;

	constructor(public readonly map: Record<string, string>) {
		this.#revMap = {};
		for (const [from, to] of Object.entries(map))
			this.#revMap[to] = from;
	}

	async* encodings(value: Buffer): Buffers {
		yield Buffer.from(value.toString().replaceAll(/./ug, c => this.map[c] ?? c));
	}

	async* extractDecode(value: Buffer): Buffers {
		yield Buffer.from(value.toString().replaceAll(/./ug, c => this.#revMap[c] ?? c));
	}
}

/**
 * Decode JSON strings surrounded with double quotes.
 * Supports extracting substrings
 */
export class JsonStringTransform implements ValueTransformer {
	toString() {return 'json-string' as const;}

	async* extractDecode(value: Buffer, minLength: number): Buffers {
		// Try to match all JSON strings (including quotes "") (https://www.json.org/json-en.html#grammar)
		// Needs '*' not '+', because otherwise an empty string will start to invert matches
		// eslint-disable-next-line no-control-regex
		const jsonStringRegex = /"(?:[^"\\\0-\x1f]|\\(?:["\\/bfnrt]|u[a-fA-F0-9]{4}))*"/g;
		for (const [match] of value.toString().matchAll(jsonStringRegex))
			if (match!.length > 2 && match!.length >= minLength)
				yield Buffer.from(JSON.parse(match!) as string);
	}
}

/**
 * HTML/XML encode/decode values to entities (character references) with and without quotes encoded.
 * Does not extract substrings
 */
export class HtmlEntitiesTransform implements ValueTransformer {
	toString() {return 'html-entities' as const;}

	async* encodings(value: Buffer): Buffers {
		const encoded = htmlEntities.encode(value.toString());
		yield Buffer.from(encoded);
		yield Buffer.from(encoded
			  .replaceAll('&quot;', '"')
			  .replaceAll('&apos;', '\''));
	}

	async* extractDecode(value: Buffer): Buffers {
		yield Buffer.from(htmlEntities.decode(value.toString()));
	}
}

/**
 * Decode `multipart/form-data` object field contents.
 * Does not support extracting substrings.
 * Takes '--<...>' at the start as the boundary
 */
export class FormDataTransform implements ValueTransformer {
	toString() {return 'form-data' as const;}

	async* extractDecode(value: Buffer): Buffers {
		const newlineOffset = value.indexOf('\r\n');
		if (newlineOffset === -1) return;

		// Match MIME boundary line (https://datatracker.ietf.org/doc/html/rfc2046#section-5.1.1)
		// Normally we could take this from a Content-Type, as technically stuff could come before the boundary
		const boundaryRegex = /^--([0-9a-zA-Z'()+_,./:=? -]{0,69}[0-9a-zA-Z'()+_,./:=?-])\s*$/;
		// Avoid converting the whole buffer to string, just take the first line
		const match         = value.subarray(0, newlineOffset).toString().match(boundaryRegex);
		if (!match) return;

		const boundary = match[1]!;

		// Passes `Buffer`s and `Promise<Buffer>`s from callback to `yield*`
		const bufferPromisePasser: ObjectStream<PassThrough, Buffer | Promise<Buffer>> = new PassThrough({objectMode: true});

		// Extract part contents
		// We do not decode `Content-Transfer-Encoding: quoted-printable`
		// because it is deprecated for forms anyway (https://datatracker.ietf.org/doc/html/rfc7578#section-4.7)
		Readable.from(value)
			  .pipe(busboy({headers: {'content-type': `multipart/form-data; boundary="${boundary}"`}})
					.on('error', () => bufferPromisePasser.end())
					.on('field', (_fieldName, fieldValue) =>
						  bufferPromisePasser.write(Buffer.from(fieldValue)))
					.on('file', (_fieldName, stream) =>
						  bufferPromisePasser.write(consumers.buffer(stream)))
					.on('close', () => bufferPromisePasser.end()));

		try {
			yield* bufferPromisePasser;
		} catch {
			/*ignore errors arising while reading files*/
		}
	}
}

/**
 * Compress/decompress value with lz-string.
 * Does not support extracting substrings, except for Base64 via {@link Base64Transform#extractDecode}
 */
export class LZStringTransform implements ValueTransformer {
	constructor(public readonly variants: ReadonlySet<'bytes' | 'ucs2' | 'utf16' | 'base64' | 'uri'>
		  = new Set(['bytes', 'ucs2', 'utf16', 'base64', 'uri'])) {
		assert(variants.size);
	}

	toString() {return 'lz-string' as const;}

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
	 * Note: does not do base64/uri directly, prepare with {@link Base64Transform#extractDecode} for that
	 */
	async* extractDecode(value: Buffer): Buffers {
		// Does not include plain 'compress' because it is not compatible with UTF-16 and does not survive UTF-8 translation
		// e.g. Buffer.from('\udfff').equals(Buffer.from('\uda00')) and Buffer.from('\udfff' or '\uda00').toString() === '\ufffd'

		if (this.variants.has('bytes')) {
			// Pad value to an even number of bytes
			// Trailing zeros may be lost with compressToBase64/compressToEncodedURIComponent
			// when decoded with Base64Transform
			let evenValue = value;
			if (value.length % 2 !== 0) {
				evenValue = Buffer.alloc(value.length + 1);
				value.copy(evenValue);
			}
			let res;
			try {
				res = lzString.decompressFromUint8Array(evenValue);
			} catch {
				/*ignore*/
			}
			if (res) {
				yield Buffer.from(res); // For compressed text
				yield Buffer.from(res, 'binary'); // For compressed binary data
			}
		}
		if (this.variants.has('ucs2')) {
			let res;
			try {
				res = lzString.decompress(value.toString('ucs2'));
			} catch {
				/*ignore*/
			}
			if (res) {
				yield Buffer.from(res);
				yield Buffer.from(res, 'binary');
			}
		}
		if (this.variants.has('utf16')) {
			let res;
			try {
				res = lzString.decompressFromUTF16(value.toString());
			} catch {
				/*ignore*/
			}
			if (res) {
				yield Buffer.from(res);
				yield Buffer.from(res, 'binary');
			}
		}
	}

	async compressedLength(value: Buffer) {
		const str = value.toString();
		if (this.variants.has('bytes') || this.variants.has('ucs2'))
			return lzString.compressToUint8Array(str).length;
		if (this.variants.has('base64') || this.variants.has('uri'))
			return lzString.compressToBase64(str).replaceAll('=', '').length;
		return lzString.compressToUTF16(str).length;
	}
}

/**
 * Compress/decompress value with Zlib algorithms.
 * Does not support extracting substrings
 */
export class CompressionTransform implements ValueTransformer {
	constructor(public readonly formats: ReadonlySet<'gzip' | 'deflate' | 'deflate-raw' | 'brotli'> =
		  new Set(['gzip', 'deflate', 'deflate-raw', 'brotli'])) {
		assert(formats.size);
	}

	toString() {return 'compress' as const;}

	async* encodings(value: Buffer): Buffers {
		for (const format of this.formats) {
			if (format === 'gzip') {
				// GZIP is "independent of [...] operating system" [RFC 1952], so of course it has an operating system field ...?
				// OS identifiers are here: https://datatracker.ietf.org/doc/html/rfc1952#page-8
				// Implementation in Chromium (Zlib):
				// https://source.chromium.org/chromium/chromium/src/+/main:third_party/freetype/src/src/gzip/zutil.h?q=OS_CODE
				let gzipped       = await promisify(zlib.gzip)(value);
				gzipped[9 /*OS*/] = 10; // TOPS-20 (Windows)
				yield gzipped;
				gzipped           = Buffer.from(gzipped);
				gzipped[9 /*OS*/] = 3; // Unix
				yield gzipped;
				gzipped           = Buffer.from(gzipped);
				gzipped[9 /*OS*/] = 7; // macOS
				yield gzipped;
			} else yield promisify({
				'deflate': zlib.deflate,
				'deflate-raw': zlib.deflateRaw,
				'brotli': zlib.brotliCompress,
			}[format])(value);
		}
	}

	async* extractDecode(value: Buffer): Buffers {
		// GZIP: https://datatracker.ietf.org/doc/html/rfc1952#page-6
		// ZLIB: https://datatracker.ietf.org/doc/html/rfc1950#page-5
		if (this.formats.has('gzip') && value.length > 10 && value.readUInt16BE() === 0x1f8b
			  || this.formats.has('deflate') && value.length > 2 && value.readUInt16BE() % 31 === 0) {
			try {
				yield promisify(zlib.unzip)(value);
				return;
			} catch {
				/*ignore*/
			}
		}

		// DEFLATE: https://datatracker.ietf.org/doc/html/rfc1951#page-10
		// `11` is reserved
		if (this.formats.has('deflate-raw') && value.length >= 1 && (value[0]! & 0b110) !== 0b110) {
			try {
				yield promisify(zlib.inflateRaw)(value);
			} catch {
				/*ignore*/
			}
		}
		if (this.formats.has('brotli')) {
			try {
				yield promisify(zlib.brotliDecompress)(value);
			} catch {
				/*ignore*/
			}
		}
	}

	async compressedLength(value: Buffer) {
		let min = Infinity;
		if (this.formats.has('deflate-raw'))
			min = Math.min(min, (await promisify(zlib.deflateRaw)(value)).length);
		if (this.formats.has('brotli'))
			min = Math.min(min, (await promisify(zlib.brotliCompress)(value)).length);
		if (min < Infinity) return min;
		if (this.formats.has('deflate')) return (await promisify(zlib.deflate)(value)).length;
		return (await promisify(zlib.gzip)(value)).length;
	}
}
