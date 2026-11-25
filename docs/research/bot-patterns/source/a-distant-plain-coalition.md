# Source transcript: Non-Player Coalition (A Distant Plain)

> © GMT Games. Research source only: transcribed from `examples/non-player-bot-sheets/A_Distant_Plain_Non-Player_Bot_Coalition.JPEG` to derive generic bot logic. Never copied into the product, the kit or the artifact.
> Transcribed word for word. Layout: boxes in reading order; arrows written as `->`. Circled numbers ❶ are priorities; ① are sub-priorities; circled letters ⓐ are tie-breaks (shaded on the sheet).
> Unclear marks are kept as they appear and noted with [?]. Italic on the sheet is kept as *text*. "1(2)" is printed with the 2 underlined. "↓" after a fraction: round down.

## Pass, Event or Operations?

❶ If *current* or *next* card is a Capability, see 8.1. Capability
❷ If *current* card is a Momentum Event, see 8.1. Momentum
❸ Play *unshaded* part if it is effective AND *card* (either part) could:
♦ shift Support up or Opposition down
♦ place or remove Taliban Bases or Coalition pieces
♦ shift Islamabad (only if Taliban is Player)
Arrow: **If None** -> diamond 1.

## Decision diamonds (left column, top to bottom)

1. **Underground Taliban at Support OR Underground Player at Coalition Base?** Yes -> Sweep. No -> diamond 2.
2. **Assault and/or Air Strike would remove Player Base(s) OR any pieces at Support?** Yes -> Assault. No -> Train.

## Operations

### Sweep — *Do not move Faction's last cube at Coalition Base, those needed for Sweep at Support, nor last 3 cubes from non-Pashtun with Support. At ❶ & ❸: bring max Govt into spaces where < 2 Govt cubes.*
❶ Into/at highest Pop AND Support AND enemy with Troops needed to activate most
♦ Use Air Lift† if otherwise unable to active *all*:
① Per Air Lift priorities
② With spare Coalition
❷ Everywhere in place
❸ Into/at 1 highest 1+ Pop & enemy, with max Coalition cubes, to activate *all* enemies:
① At own Base
② Where most Bases
Within ❶ ❷ & ❸: ⓐ Activate ①Player ②Taliban ③Warlords
† Then complete SA per relevant SA box, see 8.2.
Arrows: **with** -> diamond "Air Strike could remove …?". **if None** -> Assault

### Assault — *Add Govt Assault in max 1 space.*
❶ To remove Player OR Taliban:
① Bases*
② Pieces at Support*
❷ If pieces removed above *OR in a loop*: Everywhere in place
Within ❶ & ❷: ⓐ at highest Pop ⓑ select per AirStrike tie breakers ⓐ to ⓓ
\*If and as helpful to removing Base(s) or *all* pieces at Support use: ①Govt Assault ② Air Strike† ③ Air Lift†
† Then complete SA per relevant SA box, see 8.2.
Arrows: **with** -> diamond "Air Strike could remove …?". **if None** -> Train

### Train — *In max 3 spaces (Kabul or where Coalition pieces) but for max 2/3 of Res↓, for all if Res < 9. Place no Govt unless indicated.*
❶ If Govt Player and Patronage >10: Reduce Patronage in Kabul
❷ If Taliban Player at 18+ VPs: max Civ Act at 1(2) most Oppose with COIN Control & Coalition
❸ If Coalition Bases Available OR final Campaign: pause Train to Surge
❹ At 1(2) own Base(s) & COIN Control, Civ Act: ⓐ for greatest shift ⓑ at non-Pashtun ⓒ no Taliban
❺ If Res allow, during selection above: at Coalition Bases AND < 2 Govt *or* no Police (only), place max cubes: ① Police ② Troops
❻ In 1(2) spaces with COIN Control & Coalition, Civ Act: ⓐ for greatest shift
Arrows: **with** -> Surge. **if None** -> Sweep [arrow labeled "Sweep"]

## Special Activities

### Diamond: Air Strike could remove Base(s), last Player piece at Support or at any Base?
No -> Air Lift. Yes -> Air Strike.

### Air Lift — *Not with last Coalition Troop at own Base OR last 2 Govt where any Coalition OR last 3 cubes from non-Pashtun with Support.*
❶ Get up to 2 Govt per space with Coalition, Taliban & no Govt cubes from: ① Per bullet ❷ below ② Random
❷ Relocate Govt to enable Coalition Propaganda Civ Act: ⓐ where no Support ⓑ at highest Pop
*If no such Air Lift: With Train no SA. Otherwise Air Strike.*
Arrow: **if None** <-> Air Strike [two-headed arrow], badge **Loop: Pass**

### Air Strike — *In up to 3 Afghan Provinces.*
To remove ❶ Bases ❷ Guerrillas:
Within ❶ & ❷: strike ⓐ at Support ⓑ at own Base ⓒ faction's last Guerrilla in space ⓓ to remove ①Player ②Taliban ③Warlords
*If no such Air Lift: With Train no SA. Otherwise Air Strike.* [sic: printed as on the Air Lift box]

### Surge — *Among 3 spaces and Available.*
❶ If next Propaganda final: get max Troops to Available from Kabul or COIN Control, no last Troop from own Base: ⓐ last from Support
❷ Get max Available Bases with at least 1 Troop to different highest 1+ Pop space(s) (Kabul or COIN Control)
❸ Move on-map Base(s), +1 Troop per own Base if none, to/from Kabul or COIN Control to higher Pop than origin, from lowest Pop with no Support (only): ⓐ to most Support
❹ Only if pieces moved above:
① If next Propaganda not final, from/to Available: up to 1d6 of Troops to have # of Available Troops as close as possible to # of Support
② Get/keep at least 1 own Troop per own Base:
Within ① & ②: ⓐ where no Support ⓑ spread evenly
③ If Govt is Player, add Aid only if Patronage < 6, otherwise always
*If no such Surge, Air Lift.*
Arrow: **if None** -> Air Lift

## Momentum, Capability

♦ *Tribal Elders:* Shift to Support
♦ *Unshaded PRTs:* Civ Act in 2 spaces
♦ *Unshaded VSO:* Place Police in 1 space with Coalition Troop(s) ① where no Govt cubes ② at highest Pop
♦ *Unshaded Predators:* Air Strike also in Pakistan if removing Base
♦ *Unshaded ISR:* activate max
