import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const notices = [
  '# Umbra EQ — third-party licenses',
  'License texts for production dependencies, including their runtime dependencies.',
  'Font licenses are included separately in fonts/OFL-Inter.txt and fonts/OFL-GeistMono.txt.'
];
// These development dependencies contribute CSS to the shipped bundle.
const shippedCss = new Set(['node_modules/tailwindcss', 'node_modules/tailwindcss-animate']);

for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!path || (entry.dev && !shippedCss.has(path)) || entry.link) continue;
  // The lockfile is the installed dependency inventory; never resolve outside node_modules.
  if (!path.startsWith('node_modules/') || path.split('/').includes('..')) {
    throw new Error(`Unexpected production dependency path: ${path}`);
  }
  const directory = resolve(root, path);
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const files = (await readdir(directory)).filter(name => /^(licen[cs]e|notice)([._-].*)?$/i.test(name)).sort();
  if (!files.some(name => /^licen[cs]e/i.test(name))) {
    throw new Error(`Missing license text for ${pkg.name}@${pkg.version}`);
  }
  notices.push(`\n## ${pkg.name}@${pkg.version} (${entry.license || pkg.license || 'see license below'})`);
  for (const name of files) notices.push(`\n### ${name}\n\n${await readFile(join(directory, name), 'utf8')}`);
}

// shadcn/ui components are copied source rather than an npm runtime dependency.
notices.push(`\n## shadcn/ui (MIT)\n\n${await readFile(join(root, 'licenses/shadcn-ui.txt'), 'utf8')}`);

await mkdir(dist, { recursive: true });
await copyFile(join(root, 'LICENSE'), join(dist, 'LICENSE'));
await writeFile(join(dist, 'THIRD-PARTY-NOTICES.txt'), `${notices.join('\n\n')}\n`, 'utf8');
console.log('Included application and production dependency licenses in dist/');
