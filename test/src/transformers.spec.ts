import chai, {expect} from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';

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
} from '../../src/transformers';
import {asyncGeneratorCollect as collect, stripIndent} from '../../src/utils';

chai.use(deepEqualInAnyOrder);

const set = <T>(...elems: T[]) => new Set(elems);
// eslint-disable-next-line @typescript-eslint/unbound-method
const buf = Buffer.from;


describe(HashTransform.name, function() {
	describe(HashTransform.prototype.encodings.name, () => {
		it('can produce a SHA-256 hash', async () =>
			  expect(await collect(new HashTransform('sha256')
					.encodings(buf('0123456789abcdefda00', 'hex'))))
					.to.deep.equal([buf('733155de1f9c17807499d7f25a3f5fe616f896427f86d36dfa277eeb753e07e4', 'hex')]));
		it('can produce a SHAKE256/256 hash', async () =>
			  expect(await collect(new HashTransform('shake256', 256 / 8)
					.encodings(buf('0123456789abcdefda00', 'hex'))))
					.to.deep.equal([buf('efb7f27859a1b32205f9a67683d6549eb255557cdccbb6469b42015537d6f2bc', 'hex')]));
	});
});


describe(Base64Transform.name, function() {
	describe(Base64Transform.prototype.encodings.name, function() {
		it('can encode regular padded base64', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.encodings(buf('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([buf('ASNFZ4mrze/+2gA=')]));
		it('can encode regular non-padded base64', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.nonPaddedDialect))
					.encodings(buf('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([buf('ASNFZ4mrze/+2gA')]));
		it('can encode custom dialect /+', async () =>
			  expect(await collect(new Base64Transform(set('/+'))
					.encodings(buf('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([buf('ASNFZ4mrze+/2gA')]));
		it('can encode custom dialect =+/', async () =>
			  expect(await collect(new Base64Transform(set('=+/'))
					.encodings(buf('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([buf('ASNFZ4mrze+=2gA/')]));
		it('can provide encodings in multiple dialects', async () =>
			  expect(await collect(new Base64Transform(
					set(Base64Transform.paddedDialect, Base64Transform.nonPaddedDialect, '!@#'))
					.encodings(buf('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equalInAnyOrder([
				  buf('ASNFZ4mrze/+2gA='),
				  buf('ASNFZ4mrze/+2gA'),
				  buf('ASNFZ4mrze@!2gA#'),
			  ]));
	});

	describe(Base64Transform.prototype.extractDecode.name, function() {
		it('can decode regular padded base64', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(buf('ASNFZ4mrze/+2gA='), 1)))
					.to.deep.equal([buf('0123456789abcdeffeda00', 'hex')]));
		it('can decode regular non-padded base64', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.nonPaddedDialect))
					.extractDecode(buf('ASNFZ4mrze/+2gA'), 1)))
					.to.deep.equal([buf('0123456789abcdeffeda00', 'hex')]));
		it('can decode base64 starting & ending in non-word char', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(buf('////'), 1)))
					.to.deep.equal([buf([0xff, 0xff, 0xff])]));
		it('can decode regular padded base64 inside other text', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(buf('hello! ASNFZ4mrze/+2gA=<- this is base64!'), 8)))
					.to.deep.equal([buf('0123456789abcdeffeda00', 'hex')]));
		it('can decode multiple regular padded base64 segments inside other text', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(buf('hello! ASNFZ4mrze/+2gA=<- c29tZSB0ZXh0:)'), 8)))
					.to.deep.equal([
				  buf('0123456789abcdeffeda00', 'hex'),
				  buf('some text'),
			  ]));
		it('can decode custom dialect /+', async () =>
			  expect(await collect(new Base64Transform(set('/+'))
					.extractDecode(buf('ASNFZ4mrze+/2gA'), 1)))
					.to.deep.equal([buf('0123456789abcdeffeda00', 'hex')]));
		it('can decode custom dialect =+/', async () =>
			  expect(await collect(new Base64Transform(set('=+/'))
					.extractDecode(buf('ASNFZ4mrze+=2gA/'), 1)))
					.to.deep.equal([buf('0123456789abcdeffeda00', 'hex')]));
		it('can decode in multiple dialects', async () =>
			  expect(await collect(new Base64Transform(
					set(Base64Transform.paddedDialect, '/+'))
					.extractDecode(buf('ASNFZ4mrze/+2gA='), 8)))
					.to.deep.equalInAnyOrder([
				  buf('0123456789abcdeffeda00', 'hex'),
				  buf('0123456789abcdefbfda00', 'hex'),
			  ]));
		it('can decode non-whole byte sequences', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(buf('/////=== /=== //== A==='), 1)))
					.to.deep.equal([
				  buf([0xff, 0xff, 0xff, 0b11111100]),
				  buf([0b11111100]),
				  buf([0xff, 0b11110000]),
				  buf([0]),
			  ]));
		it('should ignore line endings', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(buf('ASNFZ4\r\nmrz\ne/+2gA='), 1)))
					.to.deep.equal([buf('0123456789abcdeffeda00', 'hex')]));
		it('should honor minLength', async () =>
			  expect(await collect(new Base64Transform(set(Base64Transform.paddedDialect))
					.extractDecode(buf('abc= def= 12345678 1234'), 8)))
					.to.deep.equal([buf('d76df8e7aefc', 'hex')]));
		it('should not throw on binary input', async () =>
			  expect(await collect(new Base64Transform()
					.extractDecode(buf([0, 1, 2, 3, 0xf0, 0xff]), 1)))
					.to.be.empty);
	});
});


describe(HexTransform.name, function() {
	describe(HexTransform.prototype.encodings.name, function() {
		it('should provide upper case & lower case encodings', async () =>
			  expect(await collect(new HexTransform()
					.encodings(buf('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equalInAnyOrder([
				  buf('0123456789abcdeffeda00'),
				  buf('0123456789ABCDEFFEDA00'),
			  ]));
		it('should honor variants', async () =>
			  expect(await collect(new HexTransform(set('uppercase'))
					.encodings(buf('0123456789abcdeffeda00', 'hex'))))
					.to.deep.equal([buf('0123456789ABCDEFFEDA00')]));
	});

	describe(HexTransform.prototype.extractDecode.name, function() {
		it('can decode lower case HEX', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(buf('0123456789abcdeffeda00'), 1)))
					.to.deep.equal([buf('0123456789abcdeffeda00', 'hex')]));
		it('can decode upper case HEX', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(buf('0123456789ABCDEFFEDA00'), 1)))
					.to.deep.equal([buf('0123456789abcdeffeda00', 'hex')]));
		it('can decode a substring', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(buf('hello! 0123456789abcdeffeda00<-hex'), 1)))
					.to.deep.equal([buf('0123456789abcdeffeda00', 'hex')]));
		it('can decode multiple substrings', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(buf('hello! 0123456789abcdeffeda00<-hex 736f6d652074657874'), 1)))
					.to.deep.equal([
				  buf('0123456789abcdeffeda00', 'hex'),
				  buf('some text'),
			  ]));
		it('should not decode mixed case HEX', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(buf('0123456789ABCDEFfeda00'), 17)))
					.to.be.empty);
		it('should not decode odd-length sequences', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(buf('0123456789abcdeffeda0'), 1)))
					.to.be.empty);
		it('should honor minLength', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(buf('abc def 12345678 1234'), 8)))
					.to.deep.equal([buf('12345678', 'hex')]));
		it('should honor variants', async () =>
			  expect(await collect(new HexTransform(set('uppercase'))
					.extractDecode(buf('0123456789abcdeffeda00 0123456789ABCDEFFEDA00'), 1)))
					.to.deep.equal([buf('0123456789ABCDEFFEDA00', 'hex')]));
		it('should not throw on binary input', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(buf([0, 1, 2, 3, 0xf0, 0xff]), 1)))
					.to.be.empty);
	});
});


describe(UriTransform.name, function() {
	describe(UriTransform.prototype.encodings.name, function() {
		it('should properly encode with %20 and +', async () =>
			  expect(await collect(new UriTransform()
					.encodings(buf('stuff:\n\t/?& 😎'))))
					.to.deep.equalInAnyOrder([
				  buf('stuff%3A%0A%09%2F%3F%26%20%F0%9F%98%8E'),
				  buf('stuff%3A%0A%09%2F%3F%26+%F0%9F%98%8E'),
			  ]));
	});

	describe(UriTransform.prototype.extractDecode.name, function() {
		it('can properly decode', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(buf('stuff%3A%0A%09%2F%3F%26%20%F0%9F%98%8E'), 1)))
					.to.deep.equal([buf('stuff:\n\t/?& 😎')]));
		it('can properly decode with +', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(buf('stuff%3A%0A%09%2F%3F%26+%F0%9F%98%8E'), 1)))
					.to.deep.equal([buf('stuff:\n\t/?& 😎')]));
		it('can decode components starting & ending in non-word char', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(buf('*%3E_%3C*'), 1)))
					.to.deep.equal([buf('*>_<*')]));
		it('can decode a substring', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(buf('https://example.com/?stuff=*%3E_%3C*&things=%2Fhi%26hello%3F%2F'), 1)))
					.to.deep.equal([
				  buf('*>_<*'),
				  buf('/hi&hello?/'),
			  ]));
		it('can decode multiple substrings', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(buf('//// it=*crazy%3F yes believe%20me!'), 4)))
					.to.deep.equal([
				  buf('*crazy?'),
				  buf('believe me!'),
			  ]));
		it('should honor minLength', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(buf('%3F %3D%3E %3C'), 4)))
					.to.deep.equal([buf('=>')]));
		it('should not throw on invalid input', async () =>
			  await collect(new UriTransform()
					.extractDecode(buf('hello%A%% \t\nhey'), 1)));
		it('should not throw on binary input', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(buf([0, 1, 2, 3, 0xf0, 0xff]), 1)))
					.to.be.empty);
	});
});


describe(JsonStringTransform.name, function() {
	describe(JsonStringTransform.prototype.extractDecode.name, function() {
		it('can properly decode', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(buf(String.raw`" hello!\n 😎\t\ud83d\ude0e"`), 1)))
					.to.deep.equal([buf(' hello!\n 😎\t😎')]));
		it('can decode a substring', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(buf(String.raw`json=" hello!\n 😎\t\ud83d\ude0e" yes`), 1)))
				    .to.deep.equal([buf(' hello!\n 😎\t😎')]));
		it('can decode multiple substrings', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(buf(String.raw`{"prop1\"":" hello!\n 😎\t\ud83d\ude0e", "prop2\n": "another\tone" }`), 1)))
					.to.deep.equal([
				  buf('prop1"'),
				  buf(' hello!\n 😎\t😎'),
				  buf('prop2\n'),
				  buf('another\tone'),
			  ]));
		it('can decode multiple substrings with empty string and escaped quote', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(buf(String.raw`["a","","b","\"","c"]`), 1)))
					.to.deep.equal([buf('a'), buf('b'), buf('"'), buf('c')]));
		it('should honor minLength', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(buf(String.raw`"a\t" "a\tbc" "a\nb"`), 7)))
					.to.deep.equal([buf('a\tbc')]));
		it('should not throw on invalid input', async () =>
			  await collect(new JsonStringTransform()
					.extractDecode(buf(String.raw`
						"${'0x01'}"
						"\u"
						"\u123"
						"\"
						"\z"
						"a${'\n'}c"
						"${'\u{10ffff}'}"
						"a`), 1)));
		it('should not throw on invalid unicode character escapes', async () =>
			  await collect(new JsonStringTransform()
					.extractDecode(buf(String.raw`"\uda00"`), 1)));
		it('should not throw on binary input', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(buf([0, 1, 2, 3, 0xf0, 0xff]), 1)))
					.to.be.empty);
	});
});


describe(HtmlEntitiesTransform.name, function() {
	describe(HtmlEntitiesTransform.prototype.encodings.name, function() {
		it('should properly encode with and without quotes', async () =>
			  expect(await collect(new HtmlEntitiesTransform()
					.encodings(buf('"test \n\'\t<😎>&&amp;'))))
					.to.deep.equalInAnyOrder([
				  buf('"test \n\'\t&lt;😎&gt;&amp;&amp;amp;'),
				  buf('&quot;test \n&apos;\t&lt;😎&gt;&amp;&amp;amp;'),
			  ]));
	});

	describe(HtmlEntitiesTransform.prototype.extractDecode.name, function() {
		it('can properly decode', async () =>
			  expect(await collect(new HtmlEntitiesTransform()
					.extractDecode(buf('"test \n&apos;\t&lt;😎&gt;'))))
					.to.deep.equal([buf('"test \n\'\t<😎>')]));
		it('should not throw on invalid or missing escapes', async () =>
			  expect(await collect(new HtmlEntitiesTransform()
					.extractDecode(buf('<&& &hello; &hi &amp'))))
					.to.have.length(1));
		it('should not throw on binary input', async () =>
			  expect(await collect(new HtmlEntitiesTransform()
				    .extractDecode(buf([0, 1, 2, 3, 0xf0, 0xff]))))
					.to.have.length(1));
	});
});


describe(FormDataTransform.name, function() {
	const crlf = (lf: string) => lf.replaceAll('\n', '\r\n');

	describe(FormDataTransform.prototype.extractDecode.name, function() {
		it('can properly decode', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(buf(crlf(stripIndent`--_boundary
					Content-Disposition: form-data; name="form param"
					
					Hello!
					This is some data 😎
					--_boundary--`)))))
					.to.deep.equal([buf('Hello!\r\nThis is some data 😎')]));
		it('can decode multiple fields', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(buf(crlf(stripIndent`--_boundary
					Content-Disposition: form-data; name="form param"
					
					Hello!
					This is some data 😎
					--_boundary
					Content-Disposition: form-data; name="another param"

					Hey!
					
					More data 🔚
					--_boundary--`)))))
					.to.deep.equal([
				  buf('Hello!\r\nThis is some data 😎'),
				  buf('Hey!\r\n\r\nMore data 🔚'),
			  ]));
		it('can handle trailing CRLF', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(buf(crlf(stripIndent`--_boundary
					Content-Disposition: form-data; name="form param"
					
					Hello!
					This is some data 😎
					--_boundary--
					`)))))
					.to.deep.equal([buf('Hello!\r\nThis is some data 😎')]));
		it('can handle other headers', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(buf(crlf(stripIndent`--_boundary
					X-My-Custom-Header: hello plz ignore this
					Content-Disposition: form-data; name="form param"
					X-My-Custom-Header: hello plz ignore this
					
					Hello!
					This is some data 😎
					--_boundary--`)))))
					.to.deep.equal([buf('Hello!\r\nThis is some data 😎')]));
		it('can handle weird unquoted form field name', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(buf(crlf(stripIndent`--_boundary
					Content-Disposition: form-data; name=~form\`param
					
					Hello!
					This is some data 😎
					--_boundary--`)))))
					.to.deep.equal([buf('Hello!\r\nThis is some data 😎')]));
		it('can handle weird boundary', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(buf(crlf(stripIndent`-- 'this:=1s/a, (perfectly+legal) --boundary?._
					Content-Disposition: form-data; name="form param"
					
					Hello!
					This is some data 😎
					-- 'this:=1s/a, (perfectly+legal) --boundary?._--`)))))
				    .to.deep.equal([buf('Hello!\r\nThis is some data 😎')]));
		it('can handle binary file', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(Buffer.concat([
						buf(crlf(stripIndent`--_boundary
					    Content-Disposition: form-data; name="form param"; filename="data."
					    Content-Type: application/octet-stream
					    
					    `)), buf('0123456789abcdefda00', 'hex'),
						buf(crlf(stripIndent`
					    --_boundary--`)),
					]))))
					.to.deep.equal([buf('0123456789abcdefda00', 'hex')]));
		it('can handle binary file with custom Content-Type', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(Buffer.concat([
						buf(crlf(stripIndent`--_boundary
					    Content-Disposition: form-data; name="form param"; filename="data."
					    Content-Type: application/pdf
					    
					    `)), buf('0123456789abcdefda00', 'hex'),
						buf(crlf(stripIndent`
					    --_boundary--`)),
					]))))
					.to.deep.equal([buf('0123456789abcdefda00', 'hex')]));
		// busboy does not support spaces around '=', so let's hope no browser does that
		it('can handle unusual formatting', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(Buffer.concat([
						buf(crlf(stripIndent`--_boundary
					    Content-Disposition:form-data
					    ${' '};filename="data";name="form param"
					    Content-Type: application/octet-stream
					    
					    `)), buf('0123456789abcdefda00', 'hex'),
						buf(crlf(stripIndent`
					    --_boundary--`)),
					]))))
					.to.deep.equal([buf('0123456789abcdefda00', 'hex')]));

		const invalidInputs = {
			'no boundary': buf('hey\r\nhello'),
			'no content': buf(crlf(stripIndent`--_boundary
				--_boundary--`)),
			'empty boundary': buf(crlf(stripIndent`--
				--`)),
			'invalid boundary': buf(crlf(stripIndent`--3*3=9
				Content-Disposition: form-data; name="form param"
				
				Hello!
				This is some data 😎
				--3*3=9--`)),
			'no headers': buf(crlf(stripIndent`--_boundary
				Hello!
				This is some data 😎
				--_boundary--`)),
			'no headers separator': buf(crlf(stripIndent`--_boundary
				Content-Disposition: form-data; name="form param"
				Hello!
				This is some data 😎
				--_boundary--`)),
			'no Content-Disposition': buf(crlf(stripIndent`--_boundary
				
				Hello!
				This is some data 😎
				--_boundary--`)),
			'invalid Content-Disposition': buf(crlf(stripIndent`--_boundary
				Content-Disposition: form-data; name hey = oops;:/
				
				hello
				--_boundary--`)),
			'other Content-Disposition': buf(crlf(stripIndent`--_boundary
				Content-Disposition: inline
				
				hello
				--_boundary--`)),
			'no end boundary': buf(crlf(stripIndent`--_boundary
				Content-Disposition: form-data; name="form param"
				
				hello`)),
			'no end boundary with file': buf(crlf(stripIndent`--_boundary
				Content-Disposition: form-data; name="form param"; filename="data.bin"
				Content-Type: application/octet-stream
				
				hello`)),
			'LF line endings': buf(stripIndent`--_boundary
				Content-Disposition: form-data; name="form param"
				
				hello
				--_boundary--`),
			'binary': buf([0, 1, 2, 3, 0xf0, 0xff]),
		};
		for (const [name, input] of Object.entries(invalidInputs))
			it(`should return nothing on invalid input: ${name}`, async () =>
				  expect(await collect(new FormDataTransform()
						.extractDecode(input)))
						.to.be.empty);
	});
});


describe(LZStringTransform.name, function() {
	describe(LZStringTransform.prototype.encodings.name, function() {
		it('can compress text in all variants', async () =>
			  expect(await collect(new LZStringTransform()
					.encodings(buf('hell\0!\n 😎'))))
					.to.deep.contain.members([
				  buf('850536300060400800505e48c10dedc10000', 'hex'),
				  buf('05853036600008405000485e0dc1c1ed0000', 'hex'),
				  buf('cba2e4b0ade4b0a0c2a4caa0c581e3b0bbe487a1e79aa020', 'hex'),
				  buf('BYUwNmAACEBQAEheDcHB7Q=='),
				  buf('BYUwNmAACEBQAEheDcHB7Q'),
			  ]));
		it('can compress binary data in all variants', async () =>
			  expect(await collect(new LZStringTransform()
					.encodings(buf('0123456789abcdefda00', 'hex'))))
					.to.deep.contain.members([
				  buf('0620a220600e0d91b350b807c0168000', 'hex'),
				  buf('200620a20e60910d50b307b816c00080', 'hex'),
				  buf('e180a3e0a188e487ace0a4b0e6aaa5e4b0bee7818de480a0e480a020', 'hex'),
				  buf('IAYgog5gkQ1Qswe4FsAAg==='),
				  buf('IAYgog5gkQ1Qswe4FsAAg'),
			  ]));
		it('honors variants', async () =>
			  expect(await collect(new LZStringTransform(set('bytes'))
					.encodings(buf('abcd'))))
					.to.deep.equal([buf('218230c602640000', 'hex')]));
	});

	describe(LZStringTransform.prototype.extractDecode.name, function() {
		it('can decompress from bytes to text', async () =>
			  expect(await collect(new LZStringTransform(set('bytes'))
					.extractDecode(buf('05853036600008405000485e0dc1c1ed0000', 'hex'))))
					.to.deep.contain(buf('hell\0!\n 😎')));
		it('can decompress from bytes to binary', async () =>
			  expect(await collect(new LZStringTransform(set('bytes'))
					.extractDecode(buf('200620a20e60910d50b307b816c00080', 'hex'))))
					.to.deep.contain(buf('0123456789abcdefda00', 'hex')));
		it('can decompress from odd number of bytes with missing trailing zero digit', async () =>
			  expect(await collect(new LZStringTransform(set('bytes'))
					.extractDecode(buf('218232', 'hex'))))
					.to.deep.contain(buf('ab')));
		it('can decompress from ucs2 to text', async () =>
			  expect(await collect(new LZStringTransform(set('ucs2'))
					.extractDecode(buf('850536300060400800505e48c10dedc10000', 'hex'))))
					.to.deep.contain(buf('hell\0!\n 😎')));
		it('can decompress from ucs2 to binary', async () =>
			  expect(await collect(new LZStringTransform(set('ucs2'))
					.extractDecode(buf('0620a220600e0d91b350b807c0168000', 'hex'))))
					.to.deep.contain(buf('0123456789abcdefda00', 'hex')));
		it('can decompress from UTF-16 to text', async () =>
			  expect(await collect(new LZStringTransform(set('utf16'))
					.extractDecode(buf('cba2e4b0ade4b0a0c2a4caa0c581e3b0bbe487a1e79aa020', 'hex'))))
					.to.deep.contain(buf('hell\0!\n 😎')));
		it('can decompress from UTF-16 to binary', async () =>
			  expect(await collect(new LZStringTransform(set('utf16'))
					.extractDecode(buf('e180a3e0a188e487ace0a4b0e6aaa5e4b0bee7818de480a0e480a020', 'hex'))))
					.to.deep.contain(buf('0123456789abcdefda00', 'hex')));

		const invalidInputs = [
			buf([]),
			buf('0123456789abcdefda0000', 'hex'),
			buf('c9a4d400', 'hex'),
			buf('a4c900d4', 'hex'),
		];
		for (const [name, input] of Object.entries(invalidInputs))
			it(`does not throw on invalid input: ${name}`, async () =>
				  await collect(new LZStringTransform()
						.extractDecode(input)));
	});
});


describe(CompressionTransform.name, function() {
	describe(CompressionTransform.prototype.encodings.name, function() {
		it('can compress using all formats', async () =>
			  expect(await collect(new CompressionTransform()
					.encodings(buf('0123456789abcdefda00', 'hex')))) // [0x01,0x23,0x45,0x67,0x89,0xab,0xcd,0xef,0xda,0x00]
					.to.deep.equalInAnyOrder([
				  buf('8b04800123456789abcdefda0003', 'hex'), // brotli
				  // From (Chrome's) CompressionStream:
				  buf('1f8b080000000000000a6354764def5c7df6fd2d060088645efb0a000000', 'hex'), // gzip on Windows
				  buf('1f8b08000000000000036354764def5c7df6fd2d060088645efb0a000000', 'hex'), // gzip on Unix
				  buf('789c6354764def5c7df6fd2d0600148a049b', 'hex'), // deflate
				  buf('6354764def5c7df6fd2d0600', 'hex'), // deflate-raw
			  ]));
		it('honors formats', async () =>
			  expect(await collect(new CompressionTransform(set('deflate'))
					.encodings(buf('0123456789abcdefda00', 'hex'))))
					.to.deep.equal([buf('789c6354764def5c7df6fd2d0600148a049b', 'hex')]));
	});

	describe(CompressionTransform.prototype.extractDecode.name, function() {
		it('can decompress using gzip', async () =>
			  expect(await collect(new CompressionTransform()
					.extractDecode(buf('1f8b080000000000000a6354764def5c7df6fd2d060088645efb0a000000', 'hex'))))
					.to.deep.contain(buf('0123456789abcdefda00', 'hex')));
		it('can decompress using deflate', async () =>
			  expect(await collect(new CompressionTransform()
					.extractDecode(buf('789c6354764def5c7df6fd2d0600148a049b', 'hex'))))
					.to.deep.contain(buf('0123456789abcdefda00', 'hex')));
		it('can decompress using deflate-raw', async () =>
			  expect(await collect(new CompressionTransform()
					.extractDecode(buf('6354764def5c7df6fd2d0600', 'hex'))))
					.to.deep.contain(buf('0123456789abcdefda00', 'hex')));
		it('can decompress using brotli', async () =>
			  expect(await collect(new CompressionTransform()
					.extractDecode(buf('8b04800123456789abcdefda0003', 'hex'))))
					.to.deep.contain(buf('0123456789abcdefda00', 'hex')));
		it('does not throw on invalid input', async () =>
			  await collect(new CompressionTransform()
					.extractDecode(buf('0123456789abcdefda0000', 'hex'))));
	});
});
