# Estações, dança e enfeites — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decorar os cenários por estação (Halloween, Natal, Carnaval), fazer o Clawd dançar quando toca
mídia no Windows e deixar a pessoa escolher enfeites de cabeça e rosto.

**Architecture:** A estação sai de uma função pura de data (`shared/season.ts`) e chega ao cenário pelo
`SceneController`, que pinta uma camada sazonal por cima de qualquer bioma (fixa no fundo cacheado,
animada por quadro). Os enfeites são sprites presos à âncora dos olhos, resolvidos a cada quadro a
partir das preferências e da estação. A dança é uma feature nova (`features/dance`) que recebe
"tocando/parado" do host; no Windows o lado nativo lê o "tocando agora" (GSMTC) na vigia de 3 s.

**Tech Stack:** TypeScript + Vite + Vitest (motor e configurações), Rust + Tauri 2 + crate `windows`
0.62 (lado nativo), Docker + cargo-xwin para compilar o `.exe` localmente.

Spec: `docs/superpowers/specs/2026-11-01-estacoes-danca-enfeites-design.md`.

Comandos de verificação usados em todas as tarefas:

- Testes: `npx vitest run` → todos passam.
- Tipos: `npx tsc --noEmit` → sem saída.
- Rust (só nas tarefas nativas): build no Docker (`artifacts/xbuild/build.sh`), com o app fechado.

---

### Task 1: Calendário das estações

**Files:**
- Create: `src/shared/season.ts`
- Test: `tests/shared/season.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import { ashWednesday, seasonOn } from '../../src/shared/season';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);

describe('ashWednesday', () => {
  it('matches known years', () => {
    expect(ashWednesday(2026)).toEqual([2, 18]);
    expect(ashWednesday(2027)).toEqual([2, 10]);
    expect(ashWednesday(2028)).toEqual([3, 1]);
  });
});

describe('seasonOn', () => {
  it('Halloween: 15/out a 15/nov', () => {
    expect(seasonOn(d(2026, 10, 14))).toBeNull();
    expect(seasonOn(d(2026, 10, 15))).toBe('halloween');
    expect(seasonOn(d(2026, 11, 15))).toBe('halloween');
  });
  it('Natal: 16/nov a 15/jan, atravessando o ano', () => {
    expect(seasonOn(d(2026, 11, 16))).toBe('natal');
    expect(seasonOn(d(2026, 12, 31))).toBe('natal');
    expect(seasonOn(d(2027, 1, 15))).toBe('natal');
  });
  it('Carnaval: 16/jan até a Quarta de Cinzas', () => {
    expect(seasonOn(d(2027, 1, 16))).toBe('carnaval');
    expect(seasonOn(d(2027, 2, 10))).toBe('carnaval');
    expect(seasonOn(d(2027, 2, 11))).toBeNull();
    expect(seasonOn(d(2028, 3, 1))).toBe('carnaval');
    expect(seasonOn(d(2028, 3, 2))).toBeNull();
  });
  it('resto do ano: nada', () => {
    expect(seasonOn(d(2027, 6, 1))).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/shared/season.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementação**

```ts
export type Season = 'halloween' | 'natal' | 'carnaval';
export const SEASONS: readonly Season[] = ['halloween', 'natal', 'carnaval'];

/** Easter Sunday (Gregorian, Meeus/Jones/Butcher) as [month, day]. */
function easter(year: number): [number, number] {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return [month, ((h + l - 7 * m + 114) % 31) + 1];
}

/** Ash Wednesday (end of Carnaval): 46 days before Easter, as [month, day]. */
export function ashWednesday(year: number): [number, number] {
  const [m, d] = easter(year);
  const ash = new Date(year, m - 1, d - 46);
  return [ash.getMonth() + 1, ash.getDate()];
}

/** Halloween 15/out–15/nov · Natal 16/nov–15/jan · Carnaval 16/jan–Quarta de Cinzas · resto: null. */
export function seasonOn(date: Date): Season | null {
  const m = date.getMonth() + 1, day = date.getDate();
  const md = m * 100 + day;
  if (md >= 1015 && md <= 1115) return 'halloween';
  if (md >= 1116 || md <= 115) return 'natal';
  const [am, ad] = ashWednesday(date.getFullYear());
  if (md >= 116 && md <= am * 100 + ad) return 'carnaval';
  return null;
}

/** `?season=` override: a season, 'none' (forces no season) or anything else (follow the date). */
export function seasonOverride(raw: string | null): Season | null | undefined {
  if (raw === 'none') return null;
  return SEASONS.includes(raw as Season) ? (raw as Season) : undefined;
}
```

- [ ] **Step 4:** `npx vitest run tests/shared/season.test.ts` → PASS.

---

### Task 2: Cores festivas

**Files:**
- Modify: `src/shared/render/roles.ts` (adicionar `red`, `green`, `gold`, `blue` no FIM de `COLOR_ROLES`
  e nas duas paletas)

- [ ] **Step 1:** `COLOR_ROLES = [..., 'ink', 'red', 'green', 'gold', 'blue']`.
- [ ] **Step 2:** dark: `red '#e0605a', green '#5fae6b', gold '#e6b450', blue '#5b9bd5'`;
  light: `red '#c0392b', green '#2e8b57', gold '#b8860b', blue '#2f6fb0'`.
- [ ] **Step 3:** `npx vitest run` → PASS (índices antigos inalterados; o snapshot de cena não muda).

---

### Task 3: Estação no cenário (relógio, controlador, vista)

**Files:**
- Modify: `src/shared/time.ts` — `Clock` ganha `date(): Date`; `systemClock.date = () => new Date()`;
  `fixedClock(h)` devolve `date: () => new Date()`.
- Modify: `src/features/scene/biomes/types.ts` — `BiomeDef` ganha `indoor?: boolean`; `room.ts` marca
  `indoor: true`.
- Create: `src/features/scene/seasons/index.ts`, `halloween.ts`, `natal.ts`, `carnaval.ts`
- Modify: `src/features/scene/controller/scene-controller.ts` — 4º parâmetro do construtor
  `seasonOf: () => Season | null`; reavalia junto com `tod` (a cada 30 s); `season()` público;
  passa a estação para `view.compose`.
- Modify: `src/features/scene/view/scene-view.ts` — chave do cache inclui a estação; depois de
  `paint` chama `decorate`; depois de `animate` chama `animateSeason`.
- Modify: `src/app/bootstrap.ts` — `seasonOverride(params.get('season'))`; passa
  `() => override === undefined ? seasonOn(clock.date()) : override` para o `SceneController`.
- Test: `tests/features/seasons.test.ts`

Interface da camada sazonal (`seasons/index.ts`):

```ts
import type { Season } from '../../../shared/season';
import type { AsciiGrid } from '../../../shared/render/ascii-grid';
import type { BiomeCtx, BiomeDef } from '../biomes';

export interface SeasonDecor {
  /** Static decoration, painted into the cached backdrop. Never over `keepClear` columns. */
  paint(g: AsciiGrid, ctx: BiomeCtx, keepClear: readonly number[], indoor: boolean): void;
  /** Moving bits (bats, snow, confetti), outdoors only. */
  animate(g: AsciiGrid, ctx: BiomeCtx, t: number): void;
}

export const DECOR: Record<Season, SeasonDecor> = { halloween, natal, carnaval };

/** Columns a mission prop may need: its spot ± `margin`. */
export function blocked(biome: BiomeDef, ctx: BiomeCtx, margin = 14): (col: number, w: number) => boolean {
  const spots = Object.values(biome.spots(ctx));
  return (col, w) => spots.some((s) => col + w > s - margin && col < s + margin);
}
```

Cada estação usa `parsePropArt` (como os postes do parque) para as peças no chão e `g.set` com as
cores festivas para pontos coloridos:

- Halloween: abóboras `[' ,_ ', '(\\_/)']`→ usar `[' _|_ ', '(o^o)', ' `"` ']` em `gold`, 2–4 por
  painel, apoiadas no chão; teia no canto superior esquerdo (`dim`); animação: 2–3 morcegos `^v^`/`-v-`
  (alterna asa a 4 fps) atravessando o céu em `ink`; à noite a lua fica (já vem do bioma).
- Natal: pinheiro `['  *  ', ' /_\\ ', '/_ _\\', ' /_\\ ', '/___\\', ' |_| ']` com `*` em `gold`, corpo
  em `green`; pisca-pisca: na linha logo acima do chão, a cada 3 colunas um `o` alternando
  `red/green/gold/blue` (fixo); animação: neve `*`/`.` caindo devagar (posição = hash + t), só em
  células vazias; o pisca-pisca pisca trocando cores a 1 Hz (desenhado no animate).
- Carnaval: bandeirinhas na linha 1: `\/` alternando cores ao longo da largura; animação: confete
  (`'`, `.`, `,`, `*`) colorido caindo e serpentina `~` ondulando na linha 2.
- `indoor`: só a parte fixa no chão (abóbora / pinheiro / bandeirinhas na parede); sem animação.

Testes (`tests/features/seasons.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { SceneController } from '../../src/features/scene';
import { fixedClock } from '../../src/shared/time';
import type { Season } from '../../src/shared/season';

function sceneIn(season: Season | null) {
  let s = 1;
  const scene = new SceneController(fixedClock(21), 'full', () => s++, () => season);
  scene.resize(200, 50, 10, 20, 1000, 0);
  return scene;
}
const text = (g: { cols: number; rows: number; get(c: number, r: number): { ch: string } | null }) => {
  let out = '';
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) out += g.get(c, r)?.ch ?? ' ';
  return out;
};

describe('seasonal decoration', () => {
  it('only shows in its season', () => {
    expect(text(sceneIn(null).compose())).not.toContain('(o^o)');
    expect(text(sceneIn('halloween').compose())).toContain('(o^o)');
    expect(text(sceneIn('natal').compose())).toContain('/_\\');
  });
  it('keeps mission spots clear', async () => {
    const scene = sceneIn('natal');
    await scene.setBiome('park', 5);
    const g = scene.compose();
    const bench = scene.spot('bench');
    for (let c = bench - 8; c < bench + 8; c++) expect(g.get(c, scene.layout().groundRow - 1)?.role).not.toBe('green');
  });
});
```

(Ajustar o acesso ao grid aos nomes reais de `AsciiGrid` — `get(c, r)` devolve `{ ch, role }`.)

- [ ] Steps: escrever testes → falham → implementar seasons + integração → passam → `npx vitest run`.

---

### Task 4: Preferências novas

**Files:**
- Modify: `src/features/settings/model/settings-model.ts`
- Test: `tests/features/settings.test.ts`

```ts
export const HEAD_ITEMS = ['witch', 'santa', 'crown', 'cap', 'bow'] as const;
export const FACE_ITEMS = ['shades', 'mask', 'mustache'] as const;
export type HeadItem = (typeof HEAD_ITEMS)[number];
export type FaceItem = (typeof FACE_ITEMS)[number];

// Settings ganha:
dance: 'off' | 'sometimes' | 'always';
head: 'auto' | 'none' | HeadItem;
face: 'auto' | 'none' | FaceItem;
// DEFAULTS: dance 'sometimes', head 'auto', face 'auto'
// ALLOWED: dance ['off','sometimes','always'], head ['auto','none',...HEAD_ITEMS], face ['auto','none',...FACE_ITEMS]
// overridesFromParams: dance→dance, head→head, face→face
```

Teste: `validate({ dance: 'x', head: 'crown', face: 'nope' })` → `{ dance: 'sometimes', head: 'crown',
face: 'auto' }`.

---

### Task 5: Enfeites (sprites, resolução, desenho)

**Files:**
- Modify: `src/features/clawd/sprites/palette.ts` — letras novas: `X '#3b2a4f'` (bruxa), `Z '#e0a526'`
  (faixa dourada), `r '#c8323c'` (vermelho), `w '#f4f4f4'` (pelo branco), `g '#f2c14e'` (ouro),
  `j '#3fa7d6'` (joia), `c '#3a6ea5'` (boné), `b '#e8618c'` (laço), `m '#9b4dca'` (máscara),
  `n '#3a2418'` (bigode).
- Create: `src/features/clawd/sprites/wear.ts` — `WEAR: Record<HeadItem | FaceItem, WearDef>` com
  `{ sprite, ox, oy }` relativos à âncora dos olhos (cabeça: base do sprite na linha `eyes.y - 3`,
  centralizado no corpo, `eyes.x + 9`; rosto: sobre o bloco 18×6 dos olhos).
- Create: `src/features/clawd/model/wear.ts`

```ts
import type { Season } from '../../../shared/season';
import type { FaceItem, HeadItem } from '../../settings/index';

export interface Wear { head: HeadItem | null; face: FaceItem | null }

const AUTO: Record<Season, Wear> = {
  halloween: { head: 'witch', face: null },
  natal: { head: 'santa', face: null },
  carnaval: { head: null, face: 'mask' },
};

/** 'auto' follows the season; 'none' wears nothing; anything else is the user's pick. */
export function resolveWear(head: 'auto' | 'none' | HeadItem, face: 'auto' | 'none' | FaceItem, season: Season | null): Wear {
  const auto = season ? AUTO[season] : { head: null, face: null };
  return {
    head: head === 'auto' ? auto.head : head === 'none' ? null : head,
    face: face === 'auto' ? auto.face : face === 'none' ? null : face,
  };
}
```

- Modify: `src/features/clawd/model/clawd-model.ts` — campo `wear: Wear = { head: null, face: null }`.
- Modify: `src/features/clawd/view/clawd-view.ts` — depois dos olhos/boca: rosto (se o item segurado
  não cobre os olhos), depois cabeça; ambos com `mirror()` e `flip`.
- Modify: `src/features/clawd/sprites/portrait.ts` — `portrait(wear?: Wear)` compõe os enfeites
  (prévia nas configurações e ícone continuam iguais sem argumento).
- Modify: `src/app/bootstrap.ts` — a cada quadro de update:
  `clawd.model.wear = resolveWear(s.head, s.face, scene.season())`.
- Test: `tests/features/wear.test.ts` — auto segue a estação, escolha manual vence, `none` limpa;
  `portrait({ head: 'crown', face: null })` tem pixels acima do corpo que `portrait()` não tem.

Importante: `features/clawd` não pode importar `features/settings` por caminho interno (teste de
arquitetura); exportar `HeadItem`/`FaceItem` pelo `index` de settings.

---

### Task 6: Pose e controlador de dança

**Files:**
- Modify: `src/features/clawd/sprites/body.ts` — `'dance'` em `PoseName` e em `POSES`:
  `dance: { fps: 4, frames: [stand({ armL: 'up', armR: 'mid', legs: 'stepA', dx: -1 }),
  stand({ armL: 'mid', armR: 'up', legs: 'stepB', dx: 1 })] }`.
- Create: `src/features/dance/index.ts`, `src/features/dance/controller/dance-controller.ts`,
  `src/features/dance/model/dance-model.ts`
- Test: `tests/features/dance.test.ts`

```ts
// dance-model.ts
export type DanceSetting = 'off' | 'sometimes' | 'always';
export const DANCE = { boutMin: 15, boutMax: 30, restMin: 40, restMax: 90, chunk: 2 } as const;
export class DanceModel {
  music = false;
  dancing = false;
  restLeft = 0;
}

// dance-controller.ts
const NOTES = ['♪', '♫', '♪ ♫'];
export interface DanceDeps { clawd: ClawdApi; rng: Rng; setting(): DanceSetting }

export class DanceController {
  readonly model = new DanceModel();
  private abort: AbortController | null = null;
  constructor(private readonly d: DanceDeps) {}

  /** From the host: media started/stopped playing. */
  music(on: boolean): void {
    this.model.music = on;
    if (!on) this.stop();
  }

  update(dt: number): void {
    const m = this.model, setting = this.d.setting();
    m.restLeft = Math.max(0, m.restLeft - dt);
    if (setting === 'off') return this.stop();
    if (!m.music || m.dancing || m.restLeft > 0 || this.d.clawd.busy()) return;
    const always = setting === 'always';
    void this.bout(always ? Infinity : this.d.rng.range(DANCE.boutMin, DANCE.boutMax), always);
  }

  private stop(): void {
    this.abort?.abort();
  }

  private async bout(seconds: number, always: boolean): Promise<void> {
    const { clawd } = this.d, m = this.model;
    const abort = (this.abort = new AbortController());
    m.dancing = true;
    clawd.setAutonomy(false);
    clawd.forgetPointer();
    try {
      for (let t = 0, i = 0; t < seconds; t += DANCE.chunk, i++) {
        await clawd.play('dance', { duration: DANCE.chunk, emote: NOTES[i % NOTES.length], signal: abort.signal });
      }
    } catch (err) {
      if (!isAbort(err)) console.error('[dance] failed', err);
    } finally {
      m.dancing = false;
      this.abort = null;
      if (!always) m.restLeft = this.d.rng.range(DANCE.restMin, DANCE.restMax);
      clawd.setAutonomy(true);
    }
  }
}
```

Testes (com um `ClawdApi` falso como os de `tests/helpers.ts`, ou o `ClawdController` real + `simulate`):
música ligada e Clawd livre → `dancing`; `music(false)` → para; `off` → nunca; Clawd ocupado → não
começa; `sometimes` → depois da rodada, descansa (`restLeft > 0`); `always` → `restLeft` fica 0.

Missões: enquanto ele dança, `clawd.busy()` é verdadeiro (autonomia desligada) e o `Director` já
adia a missão (`idleLeft = 5`). Nada a mudar no diretor.

---

### Task 7: Música no host + ligação no bootstrap

**Files:**
- Modify: `src/host/host.ts` — `onMusic?(cb: (playing: boolean) => void): void;`
- Modify: `src/host/tauri-host.ts` — `onMusic(cb)`: `invoke<boolean>('get_music').then(cb)` + `listen('music')`.
- Modify: `src/host/browser-host.ts` — `onMusic(cb)`: `if (params.get('music') === '1') cb(true)`.
- Modify: `src/app/bootstrap.ts` — cria `DanceController({ clawd, rng: rng.fork(8), setting: () =>
  settings.get().dance })`; `host.onMusic?.((on) => dance.music(on))`; `dance.update(dt)` no loop;
  linha `dance` no painel de debug; tecla `D` no debug alterna `dance.music(!dance.model.music)`.

---

### Task 8: "Tocando agora" no Windows (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml` — `[target.'cfg(windows)'.dependencies] windows = { version = "=0.62.2",
  features = ["Media_Control", "Foundation", "Foundation_Collections", "Win32_System_WinRT"] }`.
- Create: `src-tauri/src/music.rs` (só Windows)

```rust
//! Windows only: is any media session (Spotify, a browser tab, a player) playing right now?

use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};

/// Called from the monitor watcher thread (WinRT needs the thread initialised once).
pub fn init_thread() {
    unsafe {
        let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
    }
}

pub fn playing() -> bool {
    let check = || -> windows::core::Result<bool> {
        let sessions = Manager::RequestAsync()?.get()?.GetSessions()?;
        for s in sessions {
            if s.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing {
                return Ok(true);
            }
        }
        Ok(false)
    };
    check().unwrap_or(false)
}
```

- Modify: `src-tauri/src/lib.rs`
  - `AppState.music: AtomicBool`.
  - `watch_monitors`: no início da thread `#[cfg(windows)] music::init_thread();`; a cada volta,
    `#[cfg(windows)] { let now = music::playing(); if st.music.swap(now, SeqCst) != now { app.emit("music", now) } }`.
  - comando `get_music` → `state.music.load(SeqCst)`; registrar no `generate_handler!`.

---

### Task 9: Configurações (dança + Enfeites + prévia)

**Files:**
- Modify: `src/settings-ui/strings.ts` — rótulos `dance` ("Dançar com música" / "Dance to music"),
  valores `off/sometimes/always`, título da seção "Enfeites"/"Accessories", `head`/`face` e nomes das
  peças (Automático, Nenhum, Chapéu de bruxa, Gorro de Natal, Coroa, Boné, Laço, Óculos escuros,
  Máscara, Bigode).
- Modify: `src/settings-ui/main.ts` — linha `dance` em `ALL_ROWS` (só Windows, como `cursor`);
  seção "Enfeites" com duas fileiras de botões (mesmo estilo `#monitors .choices`); `drawMascot()`
  usa `portrait(resolveWear(s.head, s.face, seasonOn(new Date())))` e é redesenhado a cada
  `settings:changed`.
- Modify: `settings.html` — `<h2 id="wear-heading"></h2><div id="wear"></div>` depois das preferências.

Verificação visual: `node scripts/shot.mjs "settings.html?head=crown&face=shades" artifacts/wear 1200 540 900`.

---

### Task 10: Verificação ponta a ponta

- [ ] `npx vitest run` e `npx tsc --noEmit`.
- [ ] Prévias no navegador (Vite dev):
  `node scripts/shot.mjs "season=halloween&hour=21" artifacts/s-halloween 3000 1280 720`,
  idem `natal`, `carnaval`, e `?season=natal&music=1&dance=always` para ver a dança com gorro.
- [ ] Build no Docker com o app fechado; rodar o `.exe` aqui, tocar algo no navegador e conferir que
  ele dança (CDP: `window.clawd` expõe o controlador de dança).
- [ ] Versão `0.6.0` + entrada no CHANGELOG; commit; tag (o usuário decide quando lançar).
