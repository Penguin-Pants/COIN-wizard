# Source transcript: Non-Player Taliban (A Distant Plain)

> © GMT Games. Research source only: transcribed from `examples/non-player-bot-sheets/A_Distant_Plain_Non-Player_Bot_Taliban.JPEG` to derive generic bot logic. Never copied into the product, the kit or the artifact.
> Transcribed word for word. Layout: boxes in reading order; arrows written as `->`. Circled numbers ❶ are priorities; ① are sub-priorities; circled letters ⓐ are tie-breaks (shaded on the sheet).
> Unclear marks are kept as they appear and noted with [?]. Italic on the sheet is kept as *text*. "1(2)" is printed with the 2 underlined (a 2-player or variant value; the sheet does not say which).

## Pass, Event or Operations?

❶ If *current* or *next* card is a Capability, see 8.1. Capability
❷ If *current* card is a Momentum Event, see 8.1. Momentum
❸ Play *shaded* part if it is effective AND card (either part) could:
♦ shift Support down, Oppose or Taliban Res up or down
♦ remove or place Taliban Bases or remove Coalition pieces
♦ shift Islamabad
Arrow: **If None** -> diamond 1.

## Decision diamonds (left column, top to bottom)

1. **Terror would shift 3+ Oppose and Support combined?** Yes -> Terror. No -> diamond 2.
2. **15+ Taliban Guerrillas Available OR Rally would place Base(s)?** Yes -> Rally. No -> diamond 3.
3. **Attack and/or Ambush would remove 2+ Coalition pieces?** Yes -> Attack. No -> March.

## Operations

### Terror — *Without exposing last 1(2) Underground Guerrilla at Taliban Base. Extort when Res needed.*
❶ At Support
❷ At Neutral
Arrow: **with** -> Extort (top box)

### Rally — *In max 6 spaces in which paying Res. Extort everywhere possible when Res needed. Buy Sharia for max shift (at 1 Taliban Base regardless of Control).*
❶ At Taliban Base(s) with no Guerrillas
❷ At 3+ Guerrillas place Base: ⓐ Pakistan first
❸ Where all Taliban active at Taliban Base(s) *and* cube(s)*: ⓐ at highest Pop
❹ In Kabul, if no Underground Taliban already
❺ In up to 2 spaces at Neutral, no Coalition and no Taliban: ⓐ at highest Pop
❻ At all Taliban Bases*: ⓐ in Pakistan last ⓑ at highest Pop
❼ In Pakistan*, if free
\* **Procedure in ❸ ❻ & ❼:** Place Guerrillas until none Available, then flip Guerrillas Underground
Arrow: **with** -> Extort (LoC box)

### March — *For max 2/3↓ of Res, for all if Res < 9. Leave min 1(2) Guerrilla at each Taliban Base and non-Oppose space (Underground first). Lose no Control.*
❶ Get 1 *Underground* Guerrilla at each Taliban Base with no such Taliban Guerrilla, Pakistan only if no Guerrillas at Base(s) there
❷ Get 3 Guerrillas to 1 Afghan space with room for Base (Underground if able), only if Taliban Base(s) Available
❸ Get 1 *Underground* Guerrilla each into up to 3 spaces:
① At Neutral, no Taliban and no Coalition
② At Support
Within ❶ ❷ & ❸: select per ⓐ lowest cost route first ⓑ highest Pop
❹ Get up to 2 Guerrillas per *adjacent* LoC to outnumber enemies:
ⓐ to highest Econ
ⓑ march with Underground before Active Guerrillas
Arrows: **with** -> Extort (LoC box). **if None** -> Rally [arrowhead into Rally]

### Attack — *Without exposing last 1(2) Underground Guerrilla at Taliban Base.*
❶ Where Attack (with Ambush if needed) removes Coalition pieces
❷ Per the Ambush priorities with Ambush unless 6+ Taliban Guerrillas in space
❸ With groups of 4+ Guerrillas
Arrows: **with** -> Ambush. **if None** -> March [arrowhead into March]

## Special Activities

### Extort (top box) — *Without exposing last 1(2) Underground Guerrilla at Taliban Base in Afghanistan.*
❶ Everywhere without exposing last Taliban at non-Oppose
❷ If still at 0 Res: everywhere possible
*If no such Extort, no SA.*

### Extort (LoC box)
❶ On 3 or 4 Econ LoCs
*If no such Extort, Infiltrate.*
Arrow: **if None** -> Infiltrate

### Infiltrate — *In 1 space with Underground Taliban.*
❶ Select spaces so as to remove:
① Player ② Govt ③ Warlord pieces:
ⓐ to remove most, if Govt Player
ⓑ to remove Faction's last piece in space
ⓒ at highest Pop / Econ
*If no such Infiltrate, Extort.*
Arrow: **if None** -> Extort (top box)

### Ambush — *Without exposing last 1(2) Underground Guerrilla at Taliban Base.*
❶ Select spaces so as to remove
① Coalition: ⓐ Base ⓑ Troops
② Govt: ⓐ Base ⓑ Police ⓒ Troops
③ Warlords: ⓐ Base ⓑ Guerrillas
*If no such Ambush, Extort.*
Arrow: **if None** -> Extort (top box)

## Momentum, Capability

♦ *Shaded MANPADS Scare:* Roll 1d6, cancel on 1-4 until Res < 5
♦ *Tribal Elders:* Shift to Oppose
♦ *Unshaded Find Fix:* Get/keep 2 Underground Guerrillas per Taliban Base space in Afghanistan
♦ *Shaded Accidental Guerrillas:* Place ① At Support ② Taliban Base ③ Anywhere: Within ①②③: ⓐ at highest Pop
♦ *Shaded Aerostats:* Flip at ① Support ② Taliban Base ③ Anywhere
