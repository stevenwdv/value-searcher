# Value Searcher

Find some encoded value in a buffer. Useful for detecting something in a web request.

Example:

```js
const searcher = new ValueSearcher();
await searcher.addValue(Buffer.from('hello 🙂'));
const result = await searcher.findValueIn(Buffer.from('aGVsbG8lMjAlRjAlOUYlOTklODI'));
console.log(String(result)); // base64,uri
```
