import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import {expect} from 'chai';
import lzString from 'lz-string';

import ValueSearcher from '../../src/valueSearcher';
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
} from '../../src/transformers';
import {stripIndent} from '../../src/utils';

// eslint-disable-next-line @typescript-eslint/unbound-method
const buf = Buffer.from;

describe(ValueSearcher.name, function() {
	context('real life trackers', function() {
		it('can find value for Microsoft Clarity (compressed)', async () => {
			const searcher = new ValueSearcher();
			await searcher.addValue(buf('"some value!" 😎'));
			// flexjobs.com
			expect((await searcher.findValueIn(fs.readFileSync(path.join(__dirname, '../res/clarity'))))
				  ?.map(String) ?? null)
				  .to.deep.equal(['compress', 'json-string']);
		});
		it('can find value for FullStory', async () => {
			const searcher = new ValueSearcher();
			await searcher.addValue(buf('"some value!" 😎'));
			// allconnect.com
			const data = fs.readFileSync(path.join(__dirname, '../res/fullstory'));
			expect((await searcher.findValueIn(data))
				  ?.map(String) ?? null)
				  .to.deep.be.oneOf([
				['uri'],
				['json-string'],
				['json-string', 'uri'],
			]);
			expect((await searcher.findValueIn(data, undefined, [new UriTransform()]))
				  ?.map(String) ?? null)
				  .to.deep.equal(['uri'],
				  'should find value in URI');
			expect((await searcher.findValueIn(data, undefined, [new JsonStringTransform()]))
				  ?.map(String) ?? null)
				  .to.deep.equal(['json-string'],
				  'should find value in JSON');
		});
		//TODO? Add more real-life examples
	});

	//region helper functions
	const crlf = (lf: string) => lf.replaceAll('\n', '\r\n');

	const hash     = (b: Buffer) => createHash('sha256').update(b).digest();
	const base64   = (b: Buffer) => buf(b.toString('base64'));
	const hex      = (b: Buffer) => buf(b.toString('hex'));
	const url      = (b: Buffer) => buf(`https://example.com/?stuff=${encodeURIComponent(b.toString())}&more=idk`);
	const urlForm  = (b: Buffer) => buf(`stuff=${encodeURIComponent(b.toString()).replaceAll('%20', '+')}&more=idk`);
	const json     = (b: Buffer) => buf(JSON.stringify({stuff: b.toString(), more: 'idk'}));
	const htmlElem = (b: Buffer) => buf(`<stuff>${b.toString()
		  .replaceAll('&', '&amp;')
		  .replaceAll('<', '&lt;')
		  .replaceAll('>', '&gt;')
	}</stuff><more>idk</more>`);
	const htmlAttr = (b: Buffer) => buf(`<elem stuff="${b.toString()
		  .replaceAll('&', '&amp;')
		  .replaceAll('<', '&lt;')
		  .replaceAll('>', '&gt;')
		  .replaceAll('"', '&quot;')
		  .replaceAll('\'', '&apos;')
	}" more="idk"/>`);

	function multipartTextForm(b: Buffer) {
		const boundary = Math.random();
		return Buffer.concat([
			buf(crlf(stripIndent`--${boundary}
				Content-Disposition: form-data; name=stuff
				
				`)), b, buf(crlf(stripIndent`
				--${boundary}
				Content-Disposition: form-data; name=more
				
				idk
				--${boundary}--`)),
		]);
	}

	function multipartBinaryForm(b: Buffer) {
		const boundary = Math.random();
		return Buffer.concat([
			buf(crlf(stripIndent`--${boundary}
				Content-Disposition: form-data; name=stuff; filename=myfile
			    Content-Type: application/octet-stream

				`)), b, buf(crlf(stripIndent`
				--${boundary}
				Content-Disposition: form-data; name=more
				
				idk
				--${boundary}--`)),
		]);
	}

	const lzText                       = (b: Buffer) => buf(lzString.compressToUint8Array(b.toString())),
	      utf16LzText                  = (b: Buffer) => buf(lzString.compressToUTF16(b.toString())),
	      base64LzText                 = (b: Buffer) => buf(lzString.compressToBase64(b.toString()));
	const base64LzTextForReverseEncode = (b: Buffer) => base64LzText(b);
	const gzip                         = (b: Buffer) => zlib.gzipSync(b),
	      deflateRaw                   = (b: Buffer) => zlib.deflateRawSync(b);

	const surrounded = (b: Buffer) => buf(`stuff=${b.toString()}; more=idk`);
	//endregion

	context('constructed test cases', function() {
		type ValueTransformerClass = new(...args: never) => ValueTransformer;
		const encoderTransformMap: Record<string, ValueTransformerClass[]> = {
			hash: [HashTransform],
			base64: [Base64Transform],
			hex: [HexTransform],
			url: [UriTransform],
			urlForm: [UriTransform],
			json: [JsonStringTransform],
			htmlElem: [HtmlEntitiesTransform],
			htmlAttr: [HtmlEntitiesTransform],
			multipartTextForm: [FormDataTransform],
			multipartBinaryForm: [FormDataTransform],
			lzText: [LZStringTransform],
			utf16LzText: [LZStringTransform],
			base64LzText: [Base64Transform, LZStringTransform],
			base64LzTextForReverseEncode: [LZStringTransform],
			gzip: [CompressionTransform],
			deflateRaw: [CompressionTransform],
			surrounded: [],
		};

		function runTestCases(
			  encodingLayers: number, decodingLayers: number,
			  value: Buffer, testCases: Iterable<((b: Buffer) => Buffer)[]>,
		) {
			let searcher: ValueSearcher;
			before(async function() {
				this.timeout(20_000);
				searcher = new ValueSearcher();
				await searcher.addValue(value, encodingLayers);
			});

			for (const encoders of testCases)
				it(`can find ${encoders.map(e => e.name).join('→')}→value`, async () =>
					  expect((await searcher.findValueIn(
							encoders.reduceRight((acc, enc) => enc(acc), value), decodingLayers))
							?.map(t => (Object.getPrototypeOf(t) as { constructor: ValueTransformerClass }).constructor.name) ?? null)
							.to.deep.equal(encoders.flatMap(e => encoderTransformMap[e.name]!).map(t => t.name)));
		}

		const textValue   = buf('"hi /& hello!"\n 😎'),
		      binaryValue = buf('0123456789abcdefda00', 'hex');

		context('without backwards encoding', function() {
			context('text', () =>
				  runTestCases(0, 8, textValue, [
					  [], // direct
					  // 1 encoding layer
					  [base64], [hex], [url], [urlForm], [json], [htmlElem], [htmlAttr],
					  [lzText], [utf16LzText], [base64LzText], [gzip], [deflateRaw],

					  // algorithms that can decode substrings
					  [surrounded, base64],
					  [surrounded, hex],
					  [surrounded, url],
					  [surrounded, urlForm],
					  [surrounded, json],
					  [surrounded, htmlElem],
					  [surrounded, htmlAttr],
					  [surrounded, base64LzText],

					  // multiple layers
					  [gzip, json], // Microsoft Clarity
					  [base64, lzText, url, json],
					  [base64LzText, url, json],
					  [base64, lzText, json, htmlAttr],
					  [urlForm, utf16LzText, url, json],
					  [multipartTextForm, utf16LzText, json, htmlElem],
					  [multipartBinaryForm, deflateRaw, json, htmlAttr],
					  [surrounded, url, surrounded, json],
				  ]));
			context('binary', () =>
				  runTestCases(0, 8, binaryValue, [
					  [], // direct
					  // 1 encoding layer
					  [base64], [hex], [gzip], [deflateRaw],

					  // multiple layers
					  [surrounded, base64, deflateRaw],
					  [base64LzText, hex, url, base64, gzip],
					  [base64, lzText, base64, hex],
					  [multipartBinaryForm, deflateRaw],
				  ]));
		});

		context('with backwards encoding', function() {
			context('text', () =>
				  runTestCases(4, 8, textValue, [
					  [], // direct
					  // 1 encoding layer
					  [base64], [hex], [url], [urlForm], [json], [htmlElem], [htmlAttr],
					  [lzText], [utf16LzText], [base64LzText], [gzip], [deflateRaw],
					  [hash], // non-reversible

					  // multiple layers
					  [surrounded, json],

					  // multiple layers ending in non-reversible
					  [hex, hash],
					  [gzip, base64, hash],

					  // multiple layers with non-reversible in between
					  [hash, base64],
					  [hex, hash, base64],
					  [base64, hash, deflateRaw],
					  [base64, hash, lzText],
					  [base64, hash, base64LzTextForReverseEncode],

					  // containing multiple non-reversible layers
					  [hash, hash],
					  [hex, hash, base64, hash, gzip],
				  ]));
			context('binary', () =>
				  runTestCases(4, 8, binaryValue, [
					  [], // direct
					  // 1 encoding layer
					  [base64], [hex], [gzip], [deflateRaw],
					  [hash], // non-reversible

					  // multiple layers
					  [surrounded, base64],

					  // multiple layers ending in non-reversible
					  [hex, hash],
					  [gzip, base64, hash],

					  // multiple layers with non-reversible in between
					  [hash, base64],
					  [hex, hash, base64],
					  [base64, hash, deflateRaw],
					  [base64, hash, base64, gzip],

					  // containing multiple non-reversible layers
					  [hash, hash],
					  [hex, hash, base64, hash, gzip],
				  ]));
		});
	});

	it('should return null when value is not found', async () => {
		const searcher = new ValueSearcher();
		await searcher.addValue(buf('does not occur'));
		expect(await searcher.findValueIn(base64(buf('actual value'))))
			  .to.be.null;
	});

	it('can search for multiple values', async () => {
		const value1 = buf('first'),
		      value2 = buf('second1234567890');

		async function makeSearcher() {
			const searcher = new ValueSearcher();
			await searcher.addValue(value1);
			await searcher.addValue(value2);
			return searcher;
		}

		expect((await (await makeSearcher()).findValueIn(base64(value1)))
			  ?.map(String) ?? null)
			  .to.deep.equal(['base64'], 'first');
		expect((await (await makeSearcher()).findValueIn(hex(value2)))
			  ?.map(String) ?? null)
			  .to.deep.equal(['hex'], 'second');
	});

	it('can search multiple times', async () => {
		const searcher = new ValueSearcher();
		const value    = buf('"some value!" 😎');
		await searcher.addValue(value);

		const haystack = Buffer.concat([
			json(url(value)),
			json(buf('decompress me for async'.repeat(200))),
			json(value),
		]);
		expect((await searcher.findValueIn(haystack))
			  ?.map(String) ?? null)
			  .to.deep.be.oneOf([['json-string'], ['uri'], ['json-string', 'uri']]);
		expect((await searcher.findValueIn(haystack,
			  undefined, [new JsonStringTransform()]))
			  ?.map(String) ?? null)
			  .to.deep.equal(['json-string']);
		expect((await searcher.findValueIn(haystack,
			  undefined, [new UriTransform()]))
			  ?.map(String) ?? null)
			  .to.deep.equal(['uri']);
		expect((await searcher.findValueIn(base64(json(value))))
			  ?.map(String) ?? null)
			  .to.deep.equal(['base64', 'json-string']);
		expect((await searcher.findValueIn(base64(url(value))))
			  ?.map(String) ?? null)
			  .to.deep.equal(['base64', 'uri']);
	});

	it('can search in multiple haystacks simultaneously', async () => {
		const searcher = new ValueSearcher();
		const value    = buf('"some value!" 😎');
		await searcher.addValue(value);

		const task1 = searcher.findValueIn(base64(value)),
		      task2 = searcher.findValueIn(base64(json(value))),
		      task3 = searcher.findValueIn(base64(url(value)));

		expect((await task3)?.map(String) ?? null)
			  .to.deep.equal(['base64', 'uri'], 'task 3');
		expect((await task2)?.map(String) ?? null)
			  .to.deep.equal(['base64', 'json-string'], 'task 2');
		expect((await task1)?.map(String) ?? null)
			  .to.deep.equal(['base64'], 'task 1');
	});

	it('should honor maxEncodeLayers', async () => {
		const searcher = new ValueSearcher();
		const value0   = buf('value0'),
		      value1   = buf('value1'),
		      value2   = buf('value2');
		await searcher.addValue(value0, 0);
		await searcher.addValue(value1, 1);
		await searcher.addValue(value2, 2);
		expect((await searcher.findValueIn(hash(value0)))
			  ?.map(String) ?? null)
			  .to.be.null;
		expect((await searcher.findValueIn(hash(value1)))
			  ?.map(String) ?? null)
			  .to.deep.equal(['sha256']);
		expect((await searcher.findValueIn(hash(hash(value1))))
			  ?.map(String) ?? null)
			  .to.be.null;
		expect((await searcher.findValueIn(hash(value2)))
			  ?.map(String) ?? null)
			  .to.deep.equal(['sha256']);
		expect((await searcher.findValueIn(hash(hash(value2))))
			  ?.map(String) ?? null)
			  .to.deep.equal(['sha256', 'sha256']);
		expect((await searcher.findValueIn(hash(hash(hash(value2)))))
			  ?.map(String) ?? null)
			  .to.be.null;
	});

	it('should honor maxDecodeLayers', async () => {
		const searcher = new ValueSearcher();
		const value    = buf('value');
		await searcher.addValue(value, 0);
		expect((await searcher.findValueIn(hex(value), 0))
			  ?.map(String) ?? null)
			  .to.be.null;
		expect((await searcher.findValueIn(hex(value), 1))
			  ?.map(String) ?? null)
			  .to.deep.equal(['hex']);
		expect((await searcher.findValueIn(hex(hex(value)), 1))
			  ?.map(String) ?? null)
			  .to.be.null;
	});

	it('should end reverse encoding with non-reversible layer', async () => {
		const searcher = new ValueSearcher();
		const value    = buf('value');
		await searcher.addValue(value, 1);
		expect((await searcher.findValueIn(hex(value), 0))
			  ?.map(String) ?? null)
			  .to.be.null;
	});

	it('should honor encoders', async () => {
		const searcher = new ValueSearcher();
		const value    = buf('value');
		await searcher.addValue(value, 1, []);
		expect((await searcher.findValueIn(hash(value)))
			  ?.map(String) ?? null)
			  .to.be.null;
	});

	it('should honor decoders', async () => {
		const searcher = new ValueSearcher();
		const value    = buf('value');
		await searcher.addValue(value, 1);
		expect((await searcher.findValueIn(hex(value), 1, [new Base64Transform()]))
			  ?.map(String) ?? null)
			  .to.be.null;
	});

	it('should handle minLength correctly with compression and no encoders', async () => {
		const searcher = new ValueSearcher();
		const value    = buf('value'.repeat(100));
		await searcher.addValue(value, 0);
		expect((await searcher.findValueIn(surrounded(base64(deflateRaw(value)))))
			  ?.map(String) ?? null)
			  .to.deep.equal(['base64', 'compress']);
	});
});
