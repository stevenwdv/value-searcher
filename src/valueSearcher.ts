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
import {asyncGeneratorCollect, filterUniqBy, raceWithCondition, tryAdd} from './utils';

interface Needle {
	buffer: Buffer;
	transformers: ValueTransformer[];
}

export class ValueSearcher {
	#transformers: ValueTransformer[];
	#values: Buffer[]  = [];
	#needles: Needle[] = [];
	#needleChecksums   = new Set<number>();
	#minNeedleLength   = Infinity;

	constructor(transformers = defaultTransformers) {
		this.#transformers = transformers;
	}

	async addValue(value: Buffer, maxEncodeLayers = 2, encoders = this.#transformers) {
		const [newValue] = filterUniqBy([value], this.#needleChecksums, crc32);
		if (newValue) {
			this.#values.push(newValue);
			const needle = {buffer: value, transformers: []};
			this.#needles.push(needle);
			this.#minNeedleLength = Math.min(this.#minNeedleLength, value.length);
			if (maxEncodeLayers) await this.#addEncodings(encoders, needle, maxEncodeLayers - 1);
		}
	}

	async findValueIn(
		  haystack: Buffer, maxDecodeLayers = 10, decoders = this.#transformers): Promise<ValueTransformer[] | null> {
		const minLength = Math.min(this.#minNeedleLength, ...await Promise.all(decoders
			  .filter(dec => !!dec.extractDecode && !!dec.compressedLength)
			  .map(async dec =>
					Math.min(...await Promise.all(this.#values.map(
						  b => dec.compressedLength!(b)))),
			  )));
		return this.#findValueImpl(haystack, maxDecodeLayers, decoders, minLength);
	}

	async #findValueImpl(
		  haystack: Buffer, maxDecodeLayers: number,
		  decoders: ValueTransformer[],
		  minLength: number,
		  prevTransformers: ValueTransformer[] = [],
		  haystackChecksums                    = new Set<number>(),
	): Promise<ValueTransformer[] | null> {
		for (const {buffer, transformers} of this.#needles)
			if (haystack.includes(buffer))
				return prevTransformers.concat(transformers);
		if (maxDecodeLayers) {
			//TODO I think this always executes all sync methods, is there an efficient way to prevent this?
			return await raceWithCondition(decoders.filter(t => !!t.extractDecode)
				  .map(async decoder => {
					  const decoded      = await asyncGeneratorCollect(decoder.extractDecode!(haystack, minLength));
					  const transformers = [...prevTransformers, decoder];
					  return await raceWithCondition(decoded
								  .filter(decodedBuf => tryAdd(haystackChecksums, crc32(decodedBuf)))
								  .map(decodedBuf =>
									    this.#findValueImpl(decodedBuf, maxDecodeLayers - 1, decoders, minLength,
											  transformers, haystackChecksums)),
						    r => !!r) ?? null;
				  }), r => !!r) ?? null;
		}
		return null;
	}

	async #addEncodings(encoders: ValueTransformer[], needle: Needle, maxExtraLayers: number) {
		const newEncodings          = filterUniqBy((await Promise.all(encoders
			  .filter(transformer => !!transformer.encodings)
			  .filter(encoder => maxExtraLayers > 0 || !encoder.extractDecode)
			  .map(async transformer =>
					(await asyncGeneratorCollect(transformer.encodings!(needle.buffer)))
						  .map(buffer => ({buffer, transformers: [transformer, ...needle.transformers]})))))
			  .flat(), this.#needleChecksums, ({buffer}) => crc32(buffer));
		const endingInNonReversible = newEncodings.filter(({transformers}) => !transformers[0]!.extractDecode);
		this.#needles.push(...endingInNonReversible);
		this.#minNeedleLength = Math.min(this.#minNeedleLength,
			  ...endingInNonReversible.map(({buffer}) => buffer.length));
		if (maxExtraLayers)
			await Promise.all(newEncodings.map(needle =>
				  this.#addEncodings(encoders, needle, maxExtraLayers - 1)));
	}
}

export default ValueSearcher;

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
