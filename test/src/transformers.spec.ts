import {expect} from 'chai';

import {
	Base64Transform,
	CompressionTransform,
	FormDataTransformer,
	HashTransform,
	HexTransform,
	HtmlEntitiesTransform,
	JsonStringTransform,
	LZStringTransform,
	UriTransform,
} from '../../src/transformers';
import {asyncGeneratorCollect as collect} from '../../src/utils';

const set     = <T>(...elems: T[]) => new Set(elems);
// eslint-disable-next-line @typescript-eslint/unbound-method
const bufSort = (bufs: Buffer[]) => bufs.sort(Buffer.compare);

describe(HashTransform.name, () => describe('#encodings', () => {
	it('can produce a SHA-256 hash', async () =>
		  expect(await collect(new HashTransform('sha256')
				.encodings(Buffer.from('0123456789abcdefda00', 'hex'))))
				.to.deep.equal([Buffer.from('733155de1f9c17807499d7f25a3f5fe616f896427f86d36dfa277eeb753e07e4', 'hex')]));
	it('can produce a SHAKE256/256 hash', async () =>
		  expect(await collect(new HashTransform('shake256', 256 / 8)
				.encodings(Buffer.from('0123456789abcdefda00', 'hex'))))
				.to.deep.equal([Buffer.from('efb7f27859a1b32205f9a67683d6549eb255557cdccbb6469b42015537d6f2bc', 'hex')]));
}));

describe(Base64Transform.name, () => {
	describe('#encodings', () => {
		it('can encode regular padded base64', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.encodings(Buffer.from('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([Buffer.from('ASNFZ4mrze/+2gA=')]));
		it('can encode regular non-padded base64', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.nonPaddedDialect))
					.encodings(Buffer.from('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([Buffer.from('ASNFZ4mrze/+2gA')]));
		it('can encode custom dialect /+', async () =>
			  expect(await collect(new Base64Transform(set('/+'))
					.encodings(Buffer.from('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([Buffer.from('ASNFZ4mrze+/2gA')]));
		it('can encode custom dialect =+/', async () =>
			  expect(await collect(new Base64Transform(set('=+/'))
					.encodings(Buffer.from('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([Buffer.from('ASNFZ4mrze+=2gA/')]));
		it('can provide encodings in multiple dialects', async () =>
			  expect(bufSort(await collect(new Base64Transform(
					set(Base64Transform.paddedDialect, Base64Transform.nonPaddedDialect, '!@#'))
					.encodings(Buffer.from('0123456789abcdeffeda00', 'hex')))))
					.to.deep.equal(bufSort([
				  Buffer.from('ASNFZ4mrze/+2gA='),
				  Buffer.from('ASNFZ4mrze/+2gA'),
				  Buffer.from('ASNFZ4mrze@!2gA#'),
			  ])));
	});

	describe('#extractDecode', () => {
		it('can decode regular padded base64', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(Buffer.from('ASNFZ4mrze/+2gA='), 1)))
					.to.deep.equal([Buffer.from('0123456789abcdeffeda00', 'hex')]));
		it('can decode regular non-padded base64', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.nonPaddedDialect))
					.extractDecode(Buffer.from('ASNFZ4mrze/+2gA'), 1)))
					.to.deep.equal([Buffer.from('0123456789abcdeffeda00', 'hex')]));
		it('can decode base64 starting & ending in non-word char', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(Buffer.from('////'), 1)))
					.to.deep.equal([Buffer.from([0xff, 0xff, 0xff])]));
		it('can decode regular padded base64 inside other text', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(Buffer.from('hello! ASNFZ4mrze/+2gA=<- this is base64!'), 8)))
					.to.deep.equal([Buffer.from('0123456789abcdeffeda00', 'hex')]));
		it('can decode multiple regular padded base64 segments inside other text', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(Buffer.from('hello! ASNFZ4mrze/+2gA=<- c29tZSB0ZXh0:)'), 8)))
					.to.deep.equal([
				  Buffer.from('0123456789abcdeffeda00', 'hex'),
				  Buffer.from('some text'),
			  ]));
		it('can decode custom dialect /+', async () =>
			  expect(await collect(new Base64Transform(set('/+'))
					.extractDecode(Buffer.from('ASNFZ4mrze+/2gA'), 1)))
					.to.deep.equal([Buffer.from('0123456789abcdeffeda00', 'hex')]));
		it('can decode custom dialect =+/', async () =>
			  expect(await collect(new Base64Transform(set('=+/'))
					.extractDecode(Buffer.from('ASNFZ4mrze+=2gA/'), 1)))
					.to.deep.equal([Buffer.from('0123456789abcdeffeda00', 'hex')]));
		it('can decode in multiple dialects', async () =>
			  expect(bufSort(await collect(new Base64Transform(
					set(Base64Transform.paddedDialect, '/+'))
					.extractDecode(Buffer.from('ASNFZ4mrze/+2gA='), 8))))
					.to.deep.equal(bufSort([
				  Buffer.from('0123456789abcdeffeda00', 'hex'),
				  Buffer.from('0123456789abcdefbfda00', 'hex'),
			  ])));
		it('can decode non-whole byte sequences', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(Buffer.from('/////=== /=== //=='), 1)))
					.to.deep.equal([
				  Buffer.from([0xff, 0xff, 0xff, 0b11111100]),
				  Buffer.from([0b11111100]),
				  Buffer.from([0xff, 0b11110000]),
			  ]));
		it('should ignore line endings', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(Buffer.from('ASNFZ4\r\nmrz\ne/+2gA='), 1)))
					.to.deep.equal([Buffer.from('0123456789abcdeffeda00', 'hex')]));
	});
});

//TODO

describe(HexTransform.name, () => {
	specify('#encodings');
	specify('#extractDecode');
});

describe(UriTransform.name, () => {
	specify('#encodings');
	specify('#extractDecode');
});

describe(JsonStringTransform.name, () => specify('#extractDecode'));

describe(HtmlEntitiesTransform.name, () => {
	specify('#encodings');
	specify('#extractDecode');
});

describe(FormDataTransformer.name, () => specify('#extractDecode'));

describe(LZStringTransform.name, () => {
	specify('#encodings');
	specify('#extractDecode');
});

describe(CompressionTransform.name, () => {
	specify('#encodings');
	specify('#extractDecode');
});
