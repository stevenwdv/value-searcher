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
import {describe} from 'mocha';

const set     = <T>(...elems: T[]) => new Set(elems);
// eslint-disable-next-line @typescript-eslint/unbound-method
const bufSort = (bufs: Buffer[]) => bufs.sort(Buffer.compare);

describe(HashTransform.name, function() {
	describe('#encodings', () => {
		it('can produce a SHA-256 hash', async () =>
			  expect(await collect(new HashTransform('sha256')
					.encodings(Buffer.from('0123456789abcdefda00', 'hex'))))
					.to.deep.equal([Buffer.from('733155de1f9c17807499d7f25a3f5fe616f896427f86d36dfa277eeb753e07e4', 'hex')]));
		it('can produce a SHAKE256/256 hash', async () =>
			  expect(await collect(new HashTransform('shake256', 256 / 8)
					.encodings(Buffer.from('0123456789abcdefda00', 'hex'))))
					.to.deep.equal([Buffer.from('efb7f27859a1b32205f9a67683d6549eb255557cdccbb6469b42015537d6f2bc', 'hex')]));
	});
});

describe(Base64Transform.name, function() {
	describe('#encodings', function() {
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

	describe('#extractDecode', function() {
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
		it('should honor minLength', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(Buffer.from('abc= def= 12345678 1234'), 8)))
					.to.deep.equal([Buffer.from('d76df8e7aefc', 'hex')]));
	});
});

describe(HexTransform.name, function() {
	describe('#encodings', function() {
		it('should provide upper case & lower case encodings', async () =>
			  expect(bufSort(await collect(new HexTransform()
					.encodings(Buffer.from('0123456789abcdeffeda00', 'hex')))))
					.to.deep.equal(bufSort([
				  Buffer.from('0123456789abcdeffeda00'),
				  Buffer.from('0123456789ABCDEFFEDA00'),
			  ])));
		it('should honor variants', async () =>
			  expect(await collect(new HexTransform(set('uppercase'))
					.encodings(Buffer.from('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([Buffer.from('0123456789ABCDEFFEDA00')]));
	});

	describe('#extractDecode', function() {
		it('can decode lower case HEX', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(Buffer.from('0123456789abcdeffeda00'), 1)))
					.to.deep.equal([Buffer.from('0123456789abcdeffeda00', 'hex')]));
		it('can decode upper case HEX', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(Buffer.from('0123456789ABCDEFFEDA00'), 1)))
					.to.deep.equal([Buffer.from('0123456789abcdeffeda00', 'hex')]));
		it('can decode a substring', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(Buffer.from('hello! 0123456789abcdeffeda00<-hex'), 1)))
					.to.deep.equal([Buffer.from('0123456789abcdeffeda00', 'hex')]));
		it('can decode multiple substrings', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(Buffer.from('hello! 0123456789abcdeffeda00<-hex 736f6d652074657874'), 1)))
					.to.deep.equal([
				  Buffer.from('0123456789abcdeffeda00', 'hex'),
				  Buffer.from('some text'),
			  ]));
		it('should not decode mixed case HEX', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(Buffer.from('0123456789ABCDEFfeda00'), 17)))
					.to.be.empty);
		it('should not decode odd-length sequences', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(Buffer.from('0123456789abcdeffeda0'), 1)))
					.to.be.empty);
		it('should honor minLength', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(Buffer.from('abc def 12345678 1234'), 8)))
					.to.deep.equal([Buffer.from('12345678', 'hex')]));
		it('should honor variants', async () =>
			  expect(await collect(new HexTransform(set('uppercase'))
					.extractDecode(Buffer.from('0123456789abcdeffeda00 0123456789ABCDEFFEDA00'), 1)))
					.to.deep.equal([Buffer.from('0123456789ABCDEFFEDA00', 'hex')]));
	});
});

describe(UriTransform.name, function() {
	describe('#encodings', function() {
		it('should properly encode binary content', async () =>
			  expect(await collect(new UriTransform()
					.encodings(Buffer.from('stuff:\n\t/?& 😎'))))
					.to.deep.equal([Buffer.from('stuff%3A%0A%09%2F%3F%26%20%F0%9F%98%8E')]));
	});
	describe('#extractDecode', function() {
		it('can properly decode', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(Buffer.from('stuff%3A%0A%09%2F%3F%26%20%F0%9F%98%8E'), 1)))
					.to.deep.equal([Buffer.from('stuff:\n\t/?& 😎')]));
		it('can decode components starting & ending in non-word char', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(Buffer.from('*%3E_%3C*'), 1)))
					.to.deep.equal([Buffer.from('*>_<*')]));
		it('can decode a substring', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(Buffer.from('https://example.com/?stuff=*%3E_%3C*&things=%2Fhi%26hello%3F%2F'), 1)))
					.to.deep.equal([
				  Buffer.from('*>_<*'),
				  Buffer.from('/hi&hello?/'),
			  ]));
		it('can decode multiple substrings', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(Buffer.from('//// it=*crazy%3F yes believe%20me!'), 4)))
					.to.deep.equal([
				  Buffer.from('*crazy?'),
				  Buffer.from('believe me!'),
			  ]));
		it('should honor minLength', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(Buffer.from('%3F %3D%3E %3C'), 4)))
					.to.deep.equal([Buffer.from('=>')]));
		it('should not throw on invalid input', async () =>
			  await collect(new UriTransform()
					.extractDecode(Buffer.from('hello%A%% \t\nhey'), 1)));
	});
});

//TODO

describe(JsonStringTransform.name, function() {
	specify('#extractDecode');
});

describe(HtmlEntitiesTransform.name, function() {
	specify('#encodings');
	specify('#extractDecode');
});

describe(FormDataTransformer.name, function() {
	specify('#extractDecode');
});

describe(LZStringTransform.name, function() {
	specify('#encodings');
	specify('#extractDecode');
});

describe(CompressionTransform.name, function() {
	specify('#encodings');
	specify('#extractDecode');
});
