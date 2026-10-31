// Prints the GitHub release body for a tag: that version's CHANGELOG section plus the
// install instructions. Exits with an error when the CHANGELOG has no entry for the version.
//
//   node scripts/release-notes.mjs v0.2.1 [path/to/CHANGELOG.md]
import { readFileSync } from 'node:fs';

const [tag, changelogPath = 'CHANGELOG.md'] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY || 'LastHasagi/claude-wallpaper';

if (!tag || !/^v\d+\.\d+\.\d+/.test(tag)) {
  console.error('usage: node scripts/release-notes.mjs vX.Y.Z [CHANGELOG.md]');
  process.exit(2);
}

/** Lines between "## vX.Y.Z" (optionally followed by a date) and the next "## " heading. */
function sectionFor(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const heading = new RegExp(`^##\\s+${version.replace(/\./g, '\\.')}(\\s|$)`);
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return body || null;
}

const notes = sectionFor(readFileSync(changelogPath, 'utf8'), tag);
if (!notes) {
  console.error(`CHANGELOG has no entry for ${tag}: add a "## ${tag}" section describing what changed.`);
  process.exit(1);
}

console.log(`**Clawd Pet** ${tag}: um pet de desktop que vive em cenários de ASCII art, sai em missões, traz curiosidades e reage ao mouse.

## O que há de novo

${notes}

![demo](https://raw.githubusercontent.com/${repo}/main/docs/media/clawd-demo.gif)

## Instalar
- **Windows:** baixe o \`*_x64-setup.exe\` (ou o \`.msi\`). O instalador não é assinado, então o SmartScreen pode avisar: "Mais informações" → "Executar assim mesmo".
- **macOS:** baixe o \`.dmg\` (universal). Não é assinado: na primeira vez, clique com o botão direito no app → Abrir.
- **Linux:** \`.AppImage\`, \`.deb\` ou \`.rpm\`.

Histórico completo em [CHANGELOG.md](https://github.com/${repo}/blob/main/CHANGELOG.md).

Criado por **Rodrigo Graça** · [GitHub](https://github.com/LastHasagi) · [LinkedIn](https://www.linkedin.com/in/rodrigo-de-souza-graca/)
Licença [PolyForm Noncommercial 1.0.0](https://github.com/${repo}/blob/main/LICENSE): uso livre não comercial, com crédito obrigatório.`);
