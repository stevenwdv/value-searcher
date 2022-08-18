import assert from 'node:assert';

import {crc32} from 'crc';

import {
	Base64Transform,
	CompressionTransform,
	FormDataTransform,
	HashTransform,
	HexTransform,
	HtmlEntitiesTransform,
	JsonStringTransform,
	LZStringTransform,
	UriTransform,
	ValueTransformer,
} from './transformers';
import {asyncGeneratorCollect, filterUniqBy, raceWithCondition} from './utils';

/** Try to find an encoded value in a Buffer */
export class ValueSearcher {
	/** Values added via {@link addValue} */
	readonly #values: Buffer[]  = [];
	/** Needles to search for: `#values` and encoded values added by `#addEncodings` */
	readonly #needles: Needle[] = [];
	/** Hashes of needles to check for duplicates */
	readonly #needleChecksums   = new Set<number>();
	/** Length of the shortest needle */
	#minNeedleLength            = Infinity;

	/**
	 * @param transformers Default set of encoders/decoders to use for {@link addValue} and {@link findValueIn}
	 */
	constructor(public readonly transformers: readonly ValueTransformer[] = defaultTransformers) {}

	/**
	 * Add a value to search for
	 * @param value Value to search for
	 * @param maxEncodeLayers Maximum number of encoder layers with which to recursively encode `value`,
	 *  always ending in an encoder that cannot also decode
	 * @param encoders Encoders with which to encode `value`, by default the list passed in {@link constructor}
	 */
	async addValue(
		  value: Buffer,
		  maxEncodeLayers = 2,
		  encoders        = this.transformers,
	) {
		// Check if value wasn't added before
		const [newValue] = filterUniqBy([value], this.#needleChecksums, crc32);
		if (newValue) {
			this.#values.push(newValue);
			const needle = {buffer: value, transformers: []};
			this.#needles.push(needle);
			this.#minNeedleLength = Math.min(this.#minNeedleLength, value.length);
			if (maxEncodeLayers)
				await this.#addEncodings(encoders.filter(t => !!t.encodings),
					  needle, maxEncodeLayers - 1);
		}
	}

	/**
	 * Search for (encodings of) the values added with {@link addValue} in a buffer.
	 * Can be called concurrently multiple times
	 * @param haystack Buffer to search in
	 * @param maxDecodeLayers Maximum number of decoder layers with which to decode (parts of) `haystack`
	 * @param decoders Decoders with which to decode `value`, by default the list passed in {@link constructor}
	 * @returns If found, all encoders that were used to encode the value that was found in `haystack`, outside-in; otherwise `null`.
	 *  `[]` means that `haystack` directly contains one of the values
	 */
	async findValueIn(
		  haystack: Buffer,
		  maxDecodeLayers = 10,
		  decoders        = this.transformers,
	): Promise<ValueTransformer[] | null> {
		assert(this.#values.length, 'call addValue first');
		// Try to find the minimum length of encoded/decodable versions of a value
		// Assumes that encoded values cannot compress to values shorter than the original value and the encoded value,
		// which should be *mostly* accurate
		const minEncodedLength = Math.min(this.#minNeedleLength, ...await Promise.all(decoders
			  // Take only decompressing decoders
			  .filter(dec => !!dec.extractDecode && !!dec.compressedLength)
			  .map(async dec =>
					Math.min(...await Promise.all(this.#values.map(
						  b => dec.compressedLength!(b)))),
			  )));
		return this.#findValueImpl(haystack, maxDecodeLayers,
			  decoders.filter(t => !!t.extractDecode), minEncodedLength);
	}

	/**
	 * Try to find values in buffer
	 * @param haystack Buffer to search in
	 * @param maxDecodeLayers Maximum number of decoders to recursively apply
	 * @param decoders Decoders to apply to `haystack`, *these must all actually be decoders*
	 * @param minEncodedLength Minimum length (in bytes) that an encoded value can have
	 * @param haystackChecksums Hashes of haystacks already searched mapped to the highest layer we saw them at
	 *  (such that a lower layer cannot say they fully searched it while it ran out of recursion)
	 * @returns If found, all encoders that were used to encode the value that was found in `haystack`, outside-in; otherwise `null`
	 */
	async #findValueImpl(
		  haystack: Buffer,
		  maxDecodeLayers: number,
		  decoders: readonly ValueTransformer[],
		  minEncodedLength: number,
		  haystackChecksums = new Map<number /*checksum*/, number /*highest layer*/>(),
	): Promise<ValueTransformer[] | null> {
		for (const {buffer, transformers} of this.#needles)
			if (haystack.includes(buffer))
				return [...transformers];
		if (maxDecodeLayers) {
			//TODO I think this always executes all sync methods, is there a still parallel way to prevent this?

			// Take the first match
			return await raceWithCondition(decoders
				  .map(async decoder => {
					  // Take first match
					  const res = await raceWithCondition(
							// Compute all decoded values
							(await asyncGeneratorCollect(decoder.extractDecode!(haystack, minEncodedLength)))
								  // Take only values not seen before (or only on a lower layer)
								  .filter(decodedBuf => {
									  const checksum  = crc32(decodedBuf);
									  const prevLayer = haystackChecksums.get(checksum);
									  if (prevLayer === undefined || maxDecodeLayers > prevLayer) {
										  haystackChecksums.set(checksum, maxDecodeLayers);
										  return true;
									  }
									  return false;
								  })
								  // Recursively search
								  .map(decodedBuf =>
										this.#findValueImpl(decodedBuf, maxDecodeLayers - 1, decoders,
											  minEncodedLength, haystackChecksums)),
							r => !!r);
					  res?.unshift(decoder);
					  return res ?? null;
				  }), r => !!r) ?? null;
		}
		return null;
	}

	/**
	 * Add encodings of `needle` to `#needles` and adjust `#minNeedleLength`.
	 * @param encoders Encoders to encode `needle` with, *these must all actually be encoders*
	 * @param maxExtraLayers Maximum times to recurse. `0` means adding just *one* encoding layer
	 */
	async #addEncodings(encoders: readonly ValueTransformer[], needle: Needle, maxExtraLayers: number) {
		const newEncodings = filterUniqBy(
			  (await Promise.all(encoders
				    // If this is the last layer, skip encoders that can also decode
				    .filter(transformer => maxExtraLayers || !transformer.extractDecode)
					// Encode needle using these encoders
					.map(async transformer =>
						  (await asyncGeneratorCollect(transformer.encodings!(needle.buffer)))
								.map(buffer => ({buffer, transformers: [transformer, ...needle.transformers]})))))
					.flat(),
			  // Only take encoded values that we haven't seen yet
			  this.#needleChecksums, ({buffer}) => crc32(buffer));

		// Add only values to #needles that have a non-reversible layer applied last
		const endingInNonReversible = newEncodings.filter(({transformers}) => !transformers[0]!.extractDecode);
		this.#needles.push(...endingInNonReversible);
		this.#minNeedleLength = Math.min(this.#minNeedleLength,
			  ...endingInNonReversible.map(({buffer}) => buffer.length));

		// Recurse on all newly added encoded values
		if (maxExtraLayers)
			await Promise.all(newEncodings.map(needle =>
				  this.#addEncodings(encoders, needle, maxExtraLayers - 1)));
	}
}

interface Needle {
	buffer: Buffer;
	/** Transformers that were used to encode the value, outside-in */
	transformers: readonly ValueTransformer[];
}

export default ValueSearcher;

/** Default encoders used for {@link ValueTransformer} */
export const defaultTransformers: ValueTransformer[] = [
	...['md5', 'sha1', 'sha256', 'sha512'].map(alg => new HashTransform(alg)),

	new Base64Transform(),
	new HexTransform(),
	new UriTransform(),
	new JsonStringTransform(),
	new HtmlEntitiesTransform(),
	new FormDataTransform(),

	new LZStringTransform(),
	new CompressionTransform(),
];
