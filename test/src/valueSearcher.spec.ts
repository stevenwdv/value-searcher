/* eslint-disable @typescript-eslint/no-unused-expressions */ // False positive on e.g. expect(...).to.be.null
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
		it('can find value for Facebook', async () => {
			const searcher = new ValueSearcher();
			await searcher.addValue(buf('mail@example.com'));
			// wrangler.com
			expect((await searcher.findValueIn(fs.readFileSync(path.join(__dirname, '../res/facebook'))))
				  ?.map(String) ?? null)
				  .to.deep.be.oneOf([
				['hex', 'sha256'],
				['form-data', 'hex', 'sha256'],
			]);
		});
		it('can find value for Yandex Metrika', async () => {
			const searcher = new ValueSearcher();
			await searcher.addValue(buf('"some value!" 😎'));
			// sunrise-sunset.org
			expect((await searcher.findValueIn(fs.readFileSync(path.join(__dirname, '../res/yandex'))))
				  ?.map(String) ?? null)
				  .to.deep.equal([]);
		});
		it('can find value in in Base64 lz-string (bouncex)', async () =>
			  expect((await (await ValueSearcher.fromValues('cosicadam0+sodastream.com@gmail.com'))
					.findValueIn(buf('https://events.bouncex.net/track.gif/user?wklz=K4ZwpgTgXCD2wQMZgLwEsB2AHYAXAZKJFGALYCGaANiorCGouQCbmkAMApAEwBCcrELghg2AOjqlOAFnYBzCtQmxShcNEw5cAfTTMUAIwAeAWjBUyYDLhMBGbrYBs7ABy2TWdgAtSABWkYJpp4asRyiBAo0gDs+ORyVrgoAFYg+GAAjii2+KSwzKjs+ADuYAYMuGB6KADM3NGO+ABuaBXVTtzc0i7sNTUNNdKOAKzD+AUtyNUuzs7c7K4AnItD-cvRsVjxYC1gxe344BnAVlP60viIVGiJuGikYEJsWNmOnd29o7bdl9eJ5Fg0E1IAxYBgULh4jVxjtGKhmPgtgltLgAJ5YVBeFRgQ7wJCoUoGXEAMx07VwACkABLkWBeACaACVuE1GQBJABeWGiFIA4lS2QAVKjcDDE6LFfBecgQZi6fS2Sk05LsABqjIAigB5YCMgBywwwADFzABlNAcgBaqNwTV4QA')))
					?.map(String) ?? null)
					.to.deep.equal(['base64', 'lz-string', 'uri']));
		it('can find MD5 hash in URL (criteo)', async () =>
			  expect((await (await ValueSearcher.fromValues('cosicadam0+brilliance.com@gmail.com'))
					.findValueIn(buf('https://widget.criteo.com/event?a=40136&v=4.1.0&p0=e%3Dce%26m%3D%255B8b236b63723c786b74113414def6a685%255D&rt=gif')))
					?.map(String) ?? null)
					.to.deep.equal(['uri', 'uri', 'hex', 'md5']));
		it('can find padded Base64-encoded value (glassboxdigital) with extra config', async () => {
			const haystack = buf('v=2&r=https%3A%2F%2Fwww.marriott.fr%2Fdefault.mi&sn=7&p=e8e0c7c2-95f2-413d-aed0-7eefac19b6a9&seg=%2Fdefault.mi&sp=&pssn=0&e=kpg5xprn~0~2%23user-id~EY29zaWNhZGFtMCttYXJyaW90dC5mckBnbWFpbC5jb20%3D~ft.0_gpe*vn.2_dXNlcklE*ei.2_dXNlci1pZA%3D%3D*selectorActionCount.0_2*eventId.0_2o~-~r32044122084~~kpg5xq7n~29~-~Nb7_ch~ft.0_0*ei.2_cGFzc3dvcmQ%3D*selectorActionCount.0_4*eventId.0_2t~-~~kpg5xq8k~3~2%23password~-~vn.2_cGFzc3dvcmQ%3D*co.3_YjhfY2g%3D*ei.2_cGFzc3dvcmQ%3D*sy.3_NThfYnE%3D*selectorActionCount.0_1*eventId.0_2v~-~r451606737&dom=11H4sIAAAAAAAAA62SS2%2FbMAzHv0rAXlYsLizZTRwXKPY8FNi6AOt2aXtQLTohoNckua1X5LtPTpohzR7A0Pkgk6L0J38ULx%2FAYws1FDwvS8Z5XpUwhs5JERHqB4ikMUShHdR8DM5bhz4Sho9WpjhoK6kllJ%2BM6tO9W%2FSBrEkBnjxp9dulMAsMgxJjFRv%2BIkZPN13c7IbYq3WiW6G6QVFScEr09ahVeH8ysk40FJPLTpKi9ZKMUFAX5XS1GkNAhU20Pt07aMnITGRLG1GlVeNcLDBrrden786%2B1vjtBTvcWvmedfp5%2Fvp846YszZKU9GiGsn5m5DP%2BGPlAIUJ9CRHvY%2F0%2BBNHj99EVvEGvyFwBXA%2BVMZ7%2FT9rZc2iTteVjf%2BGr%2FoWvKGa%2F4SO5A2c6pXYhJsU%2BhBZkshsr%2B%2BzOC5cma1sxP4ThLBnXxbVwUVbVbt8aG6gRUuj8pRbek43xqPWvFklRHTVWw5NEZ%2BfzLxcHXUCfpQpX6Rtv5748ZpN8Mi2mf5r64nlTXxyX%2FNc%2Bxd49GYOh1bsPnu91agPgRAh36cya4PoHPxXICbsDAAA%3D');
			const value    = buf('cosicadam0+marriott.fr@gmail.c');
			expect((await (await ValueSearcher.fromValues(value))
				  .findValueIn(haystack, undefined, [new Base64Transform(undefined, true)]))
				  ?.map(String) ?? null)
				  .to.deep.equal(['base64']);
			{
				const searcher = new ValueSearcher();
				await searcher.addValue(value, undefined, undefined, false);
				expect((await searcher
					  .findValueIn(haystack, undefined, [new Base64Transform(undefined, false)]))
					  ?.map(String) ?? null)
					  .to.deep.equal(['base64']);
			}
		});
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

	const surrounded = (b: Buffer) => Buffer.concat([buf('stuff='), b, buf('; more=idk')]);
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
			  value: Buffer, testCases: Iterable<readonly ((b: Buffer) => Buffer)[]>,
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
					  [], [surrounded], // direct
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
					  [], [surrounded], // direct
					  // 1 encoding layer
					  [base64], [hex], [gzip], [deflateRaw],

					  // multiple layers
					  [deflateRaw, surrounded],
					  [surrounded, base64, deflateRaw],
					  [base64LzText, hex, url, base64, gzip],
					  [base64, lzText, base64, hex],
					  [multipartBinaryForm, deflateRaw],
				  ]));
		});

		context('with backwards encoding', function() {
			context('text', () =>
				  runTestCases(4, 8, textValue, [
					  [], [surrounded], // direct
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
					  [], [surrounded], // direct
					  // 1 encoding layer
					  [base64], [hex], [gzip], [deflateRaw],
					  [hash], // non-reversible

					  // multiple layers
					  [deflateRaw, surrounded],
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

	it('can search for the same value added twice with different encoders', async () => {
		const value    = buf('value');
		const encoded1 = createHash('sha256').update(value).digest(),
		      encoded2 = createHash('sha512').update(value).digest();

		async function makeSearcher() {
			const searcher = new ValueSearcher();
			await searcher.addValue(value, undefined, [new HashTransform('sha256')]);
			await searcher.addValue(value, undefined, [new HashTransform('sha512')]);
			return searcher;
		}

		expect((await (await makeSearcher()).findValueIn(encoded1))
			  ?.map(String) ?? null)
			  .to.deep.equal(['sha256'], 'first');
		expect((await (await makeSearcher()).findValueIn(encoded2))
			  ?.map(String) ?? null)
			  .to.deep.equal(['sha512'], 'second');
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

	it('should end reverse encoding with non-reversible layer if endWithNonReversibleLayer=true', async () => {
		const searcher = new ValueSearcher();
		const value    = buf('value');
		await searcher.addValue(value, 1);
		expect((await searcher.findValueIn(hex(value), 0))
			  ?.map(String) ?? null)
			  .to.be.null;
	});

	it('should end reverse encoding with any layer if endWithNonReversibleLayer=false', async () => {
		const searcher = new ValueSearcher();
		const value    = buf('value');
		await searcher.addValue(value, 1, undefined, false);
		expect((await searcher.findValueIn(hex(value), 0))
			  ?.map(String) ?? null)
			  .to.deep.equal(['hex']);
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
