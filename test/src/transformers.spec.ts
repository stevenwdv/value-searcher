import {expect} from 'chai';

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
import {describe} from 'mocha';

const set     = <T>(...elems: T[]) => new Set(elems);
// eslint-disable-next-line @typescript-eslint/unbound-method
const bufSort = (bufs: Buffer[]) => bufs.sort(Buffer.compare);


describe(HashTransform.name, function() {
	describe(HashTransform.prototype.encodings.name, () => {
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
	describe(Base64Transform.prototype.encodings.name, function() {
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

	describe(Base64Transform.prototype.extractDecode.name, function() {
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
		it('should not throw on binary input', async () =>
			  expect(await collect(new Base64Transform()
					.extractDecode(Buffer.from([0, 1, 2, 3, 0xf0, 0xff]), 1)))
					.to.be.empty);
	});
});


describe(HexTransform.name, function() {
	describe(HexTransform.prototype.encodings.name, function() {
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

	describe(HexTransform.prototype.extractDecode.name, function() {
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
		it('should not throw on binary input', async () =>
			  expect(await collect(new HexTransform()
					.extractDecode(Buffer.from([0, 1, 2, 3, 0xf0, 0xff]), 1)))
					.to.be.empty);
	});
});


describe(UriTransform.name, function() {
	describe(UriTransform.prototype.encodings.name, function() {
		it('should properly encode', async () =>
			  expect(await collect(new UriTransform()
					.encodings(Buffer.from('stuff:\n\t/?& 😎'))))
					.to.deep.equal([Buffer.from('stuff%3A%0A%09%2F%3F%26%20%F0%9F%98%8E')]));
	});

	describe(UriTransform.prototype.extractDecode.name, function() {
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
		it('should not throw on binary input', async () =>
			  expect(await collect(new UriTransform()
					.extractDecode(Buffer.from([0, 1, 2, 3, 0xf0, 0xff]), 1)))
					.to.be.empty);
	});
});


describe(JsonStringTransform.name, function() {
	describe(JsonStringTransform.prototype.extractDecode.name, function() {
		it('can properly decode', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(Buffer.from(String.raw`" hello!\n 😎\t\ud83d\ude0e"`), 1)))
					.to.deep.equal([Buffer.from(' hello!\n 😎\t😎')]));
		it('can decode a substring', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(Buffer.from(String.raw`json=" hello!\n 😎\t\ud83d\ude0e" yes`), 1)))
					.to.deep.equal([Buffer.from(' hello!\n 😎\t😎')]));
		it('can decode multiple substrings', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(Buffer.from(String.raw`{"prop1\"":" hello!\n 😎\t\ud83d\ude0e", "prop2\n": "another\tone" }`), 1)))
					.to.deep.equal([
				  Buffer.from('prop1"'),
				  Buffer.from(' hello!\n 😎\t😎'),
				  Buffer.from('prop2\n'),
				  Buffer.from('another\tone'),
			  ]));
		it('should honor minLength', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(Buffer.from(String.raw`"a\t" "a\tbc" "a\nb"`), 7)))
					.to.deep.equal([Buffer.from('a\tbc')]));
		it('should not throw on invalid input', async () =>
			  await collect(new JsonStringTransform()
					.extractDecode(Buffer.from(String.raw`"
						${'\x01'}"
						"\u"
						"\u123"
						"\"
						"\z"
						"a${'\n'}c"
						"${'\u{10ffff}'}"
						"a`), 1)));
		it('should not throw on invalid unicode character escapes', async () =>
			  await collect(new JsonStringTransform()
					.extractDecode(Buffer.from(String.raw`"\uda00"`), 1)));
		it('should not throw on binary input', async () =>
			  expect(await collect(new JsonStringTransform()
					.extractDecode(Buffer.from([0, 1, 2, 3, 0xf0, 0xff]), 1)))
					.to.be.empty);
	});
});


describe(HtmlEntitiesTransform.name, function() {
	describe(HtmlEntitiesTransform.prototype.encodings.name, function() {
		it('should properly encode with and without quotes', async () =>
			  expect(bufSort(await collect(new HtmlEntitiesTransform()
					.encodings(Buffer.from('"test \n\'\t<😎>&&amp;')))))
					.to.deep.equal(bufSort([
				  Buffer.from('"test \n\'\t&lt;😎&gt;&amp;&amp;amp;'),
				  Buffer.from('&quot;test \n&apos;\t&lt;😎&gt;&amp;&amp;amp;'),
			  ])));
	});

	describe(HtmlEntitiesTransform.prototype.extractDecode.name, function() {
		it('can properly decode', async () =>
			  expect(await collect(new HtmlEntitiesTransform()
					.extractDecode(Buffer.from('"test \n&apos;\t&lt;😎&gt;'))))
					.to.deep.equal([Buffer.from('"test \n\'\t<😎>')]));
		it('should not throw on invalid or missing escapes', async () =>
			  expect(await collect(new HtmlEntitiesTransform()
					.extractDecode(Buffer.from('<&& &hello; &hi &amp'))))
					.to.have.length(1));
		it('should not throw on binary input', async () =>
			  expect(await collect(new HtmlEntitiesTransform()
					.extractDecode(Buffer.from([0, 1, 2, 3, 0xf0, 0xff]))))
					.to.have.length(1));
	});
});


describe(FormDataTransform.name, function() {
	const crlf = (lf: string) => lf.replaceAll('\n', '\r\n');

	describe(FormDataTransform.prototype.extractDecode.name, function() {
		it('can properly decode', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(Buffer.from(crlf(stripIndent`--_boundary
					Content-Disposition: form-data; name="form param"
					
					Hello!
					This is some data 😎
					--_boundary--`)))))
					.to.deep.equal([Buffer.from('Hello!\r\nThis is some data 😎')]));
		it('can handle trailing CRLF', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(Buffer.from(crlf(stripIndent`--_boundary
					Content-Disposition: form-data; name="form param"
					
					Hello!
					This is some data 😎
					--_boundary--
					`)))))
					.to.deep.equal([Buffer.from('Hello!\r\nThis is some data 😎')]));
		it('can handle other headers', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(Buffer.from(crlf(stripIndent`--_boundary
					X-My-Custom-Header: hello plz ignore this
					Content-Disposition: form-data; name="form param"
					X-My-Custom-Header: hello plz ignore this
					
					Hello!
					This is some data 😎
					--_boundary--`)))))
					.to.deep.equal([Buffer.from('Hello!\r\nThis is some data 😎')]));
		it('can handle weird unquoted form field name', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(Buffer.from(crlf(stripIndent`--_boundary
					Content-Disposition: form-data; name=~form-param\`
					
					Hello!
					This is some data 😎
					--_boundary--`)))))
					.to.deep.equal([Buffer.from('Hello!\r\nThis is some data 😎')]));
		it('can handle weird boundary', async () =>
			  expect(await collect(new FormDataTransform()
					.extractDecode(Buffer.from(crlf(stripIndent`-- 'this:=1s/a, (perfectly+legal) --boundary?._
					Content-Disposition: form-data; name="form param"
					
					Hello!
					This is some data 😎
					-- 'this:=1s/a, (perfectly+legal) --boundary?._--`)))))
					.to.deep.equal([Buffer.from('Hello!\r\nThis is some data 😎')]));
		it('can handle binary file', async () => {
			expect(await collect(new FormDataTransform()
				  .extractDecode(Buffer.concat([
					  Buffer.from(crlf(stripIndent`--_boundary
					  Content-Disposition: form-data; name="form param"; filename="data."
					  
					  `)), Buffer.from('0123456789abcdefda00', 'hex'),
					  Buffer.from(crlf(stripIndent`
					  --_boundary--`)),
				  ]))))
				  .to.deep.equal([Buffer.from('0123456789abcdefda00', 'hex')]);
			expect(await collect(new FormDataTransform()
				  .extractDecode(Buffer.concat([
					  Buffer.from(crlf(stripIndent`--_boundary
					  Content-Disposition: form-data; filename="data"; name="form param"
					  
					  `)), Buffer.from('0123456789abcdefda00', 'hex'),
					  Buffer.from(crlf(stripIndent`
					  --_boundary--`)),
				  ]))))
				  .to.deep.equal([Buffer.from('0123456789abcdefda00', 'hex')]);
		});

		const invalidInputs = {
			'no boundary': Buffer.from('hey\r\nhello'),
			'no content': Buffer.from(crlf(stripIndent`--_boundary
				--_boundary--`)),
			'empty boundary': Buffer.from(crlf(stripIndent`--
				--`)),
			'invalid boundary': Buffer.from(crlf(stripIndent`--3*3=9
				Content-Disposition: form-data; name="form param"
				
				Hello!
				This is some data 😎
				--3*3=9--`)),
			'no headers': Buffer.from(crlf(stripIndent`--_boundary
				Hello!
				This is some data 😎
				--_boundary--`)),
			'no headers separator': Buffer.from(crlf(stripIndent`--_boundary
				Content-Disposition: form-data; name="form param"
				Hello!
				This is some data 😎
				--_boundary--`)),
			'no Content-Disposition': Buffer.from(crlf(stripIndent`--_boundary
				
				Hello!
				This is some data 😎
				--_boundary--`)),
			'invalid Content-Disposition': Buffer.from(crlf(stripIndent`--_boundary
				Content-Disposition: form-data; name hey = oops;:/
				
				hello
				--_boundary--`)),
			'other Content-Disposition': Buffer.from(crlf(stripIndent`--_boundary
				Content-Disposition: inline
				
				hello
				--_boundary--`)),
			'no end boundary': Buffer.from(crlf(stripIndent`--_boundary
				Content-Disposition: form-data; name="form param"
				
				hello`)),
			'no end boundary with file': Buffer.from(crlf(stripIndent`--_boundary
				Content-Disposition: form-data; name="form param"; filename="data.bin"
				
				hello`)),
			'LF line endings': Buffer.from(stripIndent`--_boundary
				Content-Disposition: form-data; name="form param"
				
				hello
				--_boundary--`),
			'binary': Buffer.from([0, 1, 2, 3, 0xf0, 0xff]),
		};
		for (const [name, input] of Object.entries(invalidInputs))
			it(`should return nothing on invalid input: ${name}`, async () =>
				  expect(await collect(new FormDataTransform()
						.extractDecode(input)))
						.to.be.empty);
	});
});

//TODO

describe(LZStringTransform.name, function() {
	specify(LZStringTransform.prototype.encodings.name);

	specify(LZStringTransform.prototype.extractDecode.name);
});


describe(CompressionTransform.name, function() {
	specify(CompressionTransform.prototype.encodings.name);

	specify(CompressionTransform.prototype.extractDecode.name);
});
