# Source transcript: Non-Player Warlords (A Distant Plain, 3rd Edition)

> © GMT Games. Research source only: transcribed from `examples/non-player-bot-sheets/A_Distant_Plain_Non-Player_Bot_Warlords.JPEG` to derive generic bot logic. Never copied into the product, the kit or the artifact.
> Transcribed word for word. Layout: boxes in reading order; arrows written as `->`. Circled numbers ❶ are priorities; ① are sub-priorities; circled letters ⓐ are tie-breaks (shaded on the sheet).
> Unclear marks are kept as they appear and noted with [?]. Italic on the sheet is kept as *text*. "1(2)" is printed with the 2 underlined.

## Pass, Event or Operations?

❶ If *current* card is a Momentum Event, see 8.1. Momentum
❷ If *current* card is a Capability, see 8.1 Capability
❸ Play *shaded* part if it will:
♦ increase uncontrolled Pop or Warlord Resources
♦ place Warlord Guerrillas on LoCs or Warlord Base(s)
❹ If Warlords Res = 0, Pass
Arrow: **If None** -> diamond 1.

## Decision diamonds (left column, top to bottom)

1. **Rally would replace Guerrillas with Base(s)?** Yes -> Rally. No -> diamond 2.
2. **Player victory margin positive?** No -> March. Yes -> diamond 3.
3. **Terror could reduce Player VPs?** Yes -> Terror. No -> Attack.

## Operations

### Rally — *In max 3 spaces.*
❶ At 3+ Warlord Guerrillas:
① If no space for Base: Suborn against a Govt Base† AND then Rally placing a Base there
② Replace 2 Guerrillas with a Base
❷ At 1 highest 1+ Pop with 1 Warlord Base AND room for Base:
① If Rally placing Guerrillas enables Cultivate: Rally* AND then Cultivate
② Cultivate AND then Rally*
❸ Where Warlord Bases but no other Warlords: ⓐ at highest Pop ⓑ at most Bases
❹ At Warlord Bases*: ⓐ at highest Pop
❺ Where Warlord Guerrillas but no Warlord Bases
❻ At highest 1+ Pop
\* **Procedure:** Place Guerrillas until none Available, then flip Guerrillas Underground *where none such* (only)
† Then complete SA per relevant SA box, see 8.2.
Arrows: **with** -> Cultivate [from the upper right edge of the box]. **with** -> diamond "Warlords at 43+ Res?" [from the lower right edge; joins the March line] [?: the sheet does not say which Rally case takes which arrow]
Badge beside the arrowhead into Rally: **Loop: Attack**

### March — *Leave min 1(2) Guerrilla at each Warlord Base space (Underground first), 2 on LoCs (unless over 45 Res OR last Campaign). Create no Control.*
❶ Get 1 *Underground* Guerrilla at Warlord Base(s) with no such Warlord Guerrilla (where able)
❷ Get exactly 2 Guerrillas on each reachable LoC (march Active first), *unless 45+ Res OR last Campaign*
❸ *Unless last Campaign*, get 3+ Warlord Guerrillas (from multiple random sources, if needed) into each reachable 1+ Pop space with room for Base: Select ⓐ highest Pop ⓑ where no Coalition
❹ To remove most Control: ⓐ by Player
❺ If in loop: ① to highest 1+ Pop ②Pass
Arrows: **with** -> diamond "Warlords at 43+ Res?". **if None** -> Rally [arrowhead into Rally]

### Terror — *In max 3 spaces shifting to Neutral. Without exposing last 1(2) Underground Guerrilla at Warlord Base.*
❶ To reduce Player VPs: ⓐ at highest Pop
❷ In 1 space for greatest shift
Arrows: **with** -> Suborn. **if None** -> March [arrowhead into March]

### Attack — *Where 4+ Warlord Guerrillas. Without exposing last 1(2) Underground Guerrilla at Warlord Base.*
❶ To attempt to reduce Player VPs (remove Control or Bases): ⓐ at highest Pop
Arrows: **with** -> Suborn. **if None** -> Terror [arrowhead into Terror]

## Special Activities

### Diamond: Warlords at 43+ Res?
No -> Cultivate. Yes -> Suborn.

### Cultivate — *In 1 space where 1+ Pop, Warlord Guerrillas outnumber Police, and selected for Rally or March.*
❶ If last Campaign, unless in loop, skip to Traffic
❷ Where Warlord Base already
❸ Where no Warlord Base
❹ Rally in 1 more space AND then Cultivate there
Within ❷ ❸ & ❹: ⓐ at highest Pop
*If no such Cultivate, Traffic.*
Arrow: **if None** -> Traffic

### Traffic — *Where Warlord Base(s) and no Coalition.*
❶ At Uncontrolled Warlord Base spaces
❷ At all Warlord Bases, but award Player no Res or Patronage
*If no such Cultivate, Traffic.* [sic: printed as on the Cultivate box; the arrow goes to Suborn]
Arrow: **if None** -> Suborn

### Suborn — *In up to 3 spaces. Do not spend Res such that falling below 41 Res.*
❶ To reduce up to 4 Player VPs
❷ To remove any Control at 1 highest possible Pop in Afghanistan
*If no such Suborn: After Terror or Attack: no SA. Otherwise: Cultivate.*
Arrow: **if None (with Rally or March only)** -> Cultivate

## Capability

♦ *Unshaded Find Fix:* get/keep 2 Underground Guerrillas per space with 2 Warlords Bases
