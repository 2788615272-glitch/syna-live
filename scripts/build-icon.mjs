import { readFile, writeFile } from 'node:fs/promises';
import pngToIco from 'png-to-ico';

await readFile(new URL('../build/icon.png', import.meta.url));
await writeFile(new URL('../build/icon.ico', import.meta.url), await pngToIco(new URL('../build/icon.png', import.meta.url)));
console.log('Wrote build/icon.ico');
