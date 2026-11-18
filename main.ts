// Marisol Bay — the entry program for the gta6-01 bounty (Node 22, standard
// library only). It hands the finished game in: the static files under game/
// and the screenshots under screenshots/ are copied to the output directory,
// and dossier.json is written with the kit's own buildDossier library, so the
// sealed scorer sees exactly the bytes the library produces from those files.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   MAKEFUN_OUTPUT_DIR=/tmp/marisol-out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail loudly instead of shipping an empty dossier when the game entry point
// is missing — a silent copy of nothing would score zero with no signal.
if (!existsSync(join(repoRoot, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — refusing to build an empty entry.');
}

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The gate's caps, as the scorer reads them: the dossier text stays under
// 160 KiB, at most 4 screenshots of 256 KiB each, and game/ stays within
// 993 entries and 48 MiB with no path over 1000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
