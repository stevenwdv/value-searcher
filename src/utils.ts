import {Readable, Writable} from 'node:stream';

/**
 * @author https://stackoverflow.com/a/30851002
 */
export function regExpEscape(str: string) {
	return str.replaceAll(/[-[\]{}()*+!<=:?./\\^$|#\s,]/g, '\\$&');
}

/**
 * Template tag, strips indents from the template string, excluding content of placeholders
 */
export function stripIndent(strings: TemplateStringsArray, ...placeholders: readonly unknown[]) {
	const stringsNoIndent = strings.map(s => s.replaceAll(/([\r\n])[^\S\r\n]+/g, '$1'));
	stringsNoIndent[0]    = stringsNoIndent[0]!.replace(/^[^\S\r\n]+/, '');
	return stringsNoIndent.reduce((acc, s, i) => acc + String(placeholders[i - 1]!) + s);
}

export function raceWithCondition<T>(
	  promises: Iterable<T | PromiseLike<T>>,
	  condition: (val: T) => boolean | PromiseLike<boolean>,
): Promise<T | undefined> {
	return new Promise((resolve, reject) =>
		  void Promise.allSettled([...promises].map(async p => {
			  // Calling resolve/reject multiple times does not do anything
			  try {
				  const res = await p;
				  if (await condition(res)) resolve(res);
			  } catch (err) {
				  reject(err);
			  }
		  })).then(() => resolve(undefined)));
}

export async function asyncGeneratorCollect<T>(gen: AsyncGenerator<T, void, undefined>): Promise<T[]> {
	const results = [];
	for await (const o of gen) results.push(o);
	return results;
}

/** Add `map(element)` for each element in `items` to `seen` and return elements that were not in `seen` before */
export function filterUniqBy<ItemType, FilterType>(items: readonly ItemType[], seen: Set<FilterType>,
	  map: (item: ItemType) => FilterType,
): ItemType[] {
	return items.filter(item => tryAdd(seen, map(item)));
}

/** @return `true` if `value` was newly added to `set`, `false` if it was already present */
export function tryAdd<T>(set: Set<T>, value: T): boolean {
	if (set.has(value)) return false;
	set.add(value);
	return true;
}

export type ObjectStream<Stream extends Readable | Writable, ObjType> =
	  Omit<Stream, 'read' | 'write' | 'end' | typeof Symbol.asyncIterator>
	  & (Stream extends Readable
	  ? {
		  read(): ObjType, push(obj: ObjType): boolean;
		  [Symbol.asyncIterator](): AsyncIterableIterator<ObjType>;
	  } : unknown)
	  & (Stream extends Writable
	  ? {
		  write(obj: ObjType, callback?: (error: Error | null | undefined) => void): boolean;
		  end(obj: ObjType, callback?: () => void): Stream;
		  end(callback?: () => void): Stream;
	  } : unknown);
