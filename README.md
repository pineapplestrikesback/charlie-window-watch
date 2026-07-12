# Charlie: Window Watch

A dependency-free browser game starring Charlie, a German Shepherd with a very serious window-security job.

## Play

From this directory, start any local static server. For example:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4173/>.

## Controls

- `Left Arrow` / `Right Arrow`: patrol the six windows continuously from Office to Kitchen
- `Up Arrow` / `Down Arrow`: during Czech Cabin Duty, switch between the upper visitor fence and lower sheep fence
- `Space`: bark
- `C`: use a full chicken meter
- `P` / `Escape`: pause or resume

The compact action rail provides the same left, bark, right, and chicken actions for pointer/touch play. Czech Cabin Duty adds a large **Switch fence** control whenever Charlie can move between the two fence lines. Immersive full screen also supports swiping across the flat and tapping a window to bark.

## Patrol modes

- **Charlie's Patrol Book:** six authored cases with 18 one-time Paw Stamps, six ranks, unlockable photo/decor rewards, and four collar-tag sidegrades.
- **Classic Patrol:** the original 90-second score chase, kept as a separate mode.
- **Today's Patrol:** a deterministic daily case and household twist, unlocked after three Paw Stamps.
- **Overtime Watch:** an endless, escalating patrol unlocked by closing all six campaign cases.
- **Travel File — Czech Cabin Duty:** juggle the upper fence's suspicious visitors with a flock grazing along the lower fence. Charlie's position gently moves compliant sheep toward their marked grazing patch; the stubborn ewe needs a well-timed bark. Travel orders are their own assignment record and do not award campaign Paw Stamps.

Campaign progress, records, rewards, mode scores, and the equipped collar tag are saved locally in the browser. Clearing a case opens the next one; its two optional objectives can be revisited later.

## The watch

- Guard six windows across the office, living room, and kitchen.
- At the Czech cabin, keep the upper fence secure while gathering the sheep below into their shaded grazing patch. Switch fence lines before either job gets away from Charlie.
- Bark at triangular suspicious visitors; let circular friendly visitors pass.
- Audible barks build **Owner Attention** independently in each room. The office video call amplifies barks, the television muffles them, and the kettle grants short windows of complete sound cover.
- When Attention fills, the owner starts **Listening** in that room. Stay quiet for 2.5 seconds to recover Patience, relocate to prime one Sneaky Switch, or bark under sound cover for a Patience-safe **Perfect Crime**.
- Five successful guards fill the chicken meter. Chicken restores patience, calms every room, and activates six seconds of Super Sniffer.
- Squirrels hop windows, pigeon pairs split Charlie's attention, robots reboot, parcel pirates follow real posties, leaf monsters spread, and the Mystery Coat dodges between rooms before the final boss incident.
- Charlie's bark rotates between four short German Shepherd recordings; shushes vary too, and window sounds are subtly panned across the flat.
- The postie rings the bell, successful guards chime, missed threats thud, room switches whoosh, and chicken comes with real dog crunches plus a power-up sparkle.
- A timed patrol ends at clock-out or when Safety/Patience runs out. Relaxed mode slows visitors and halves audible Patience penalties.

## Project notes

- No runtime dependencies, build step, remote fonts, or trackers. All sounds are bundled locally and loaded on demand after the first user interaction; gameplay makes no remote requests.
- Canvas handles the apartment and simulation; semantic HTML handles menus, status, controls, settings, and results.
- Charlie’s project photo copies have had embedded photo metadata removed. The originals in Downloads were not changed.
- The illustrated in-game character was generated from Charlie’s reference photo, then keyed locally into an RGBA sprite.
- Every bundled sound is CC0; sources, creators, and edits are documented in [assets/audio/CREDITS.md](assets/audio/CREDITS.md).

## Verify

```bash
node --check game.js
node --test tests/*.test.mjs
```
