# Source transcript: Non-Player Government (A Distant Plain)

> © GMT Games. Research source only: transcribed from `examples/non-player-bot-sheets/A_Distant_Plain_Non-Player_Bot_Government.JPEG` to derive generic bot logic. Never copied into the product, the kit or the artifact.
> Transcribed word for word. Layout: boxes in reading order; arrows written as `->`. Circled numbers ❶ are priorities; ① are sub-priorities; circled letters ⓐ are tie-breaks (shaded on the sheet).
> Unclear marks are kept as they appear and noted with [?]. Italic on the sheet is kept as *text*. "↓" after a fraction: round down.

## Pass, Event or Operations?

❶ If *current* card is a Momentum Event, see 8.1. Momentum
❷ If *current* card is a Capability, see 8.1 Capability
❸ Play *unshaded* part if it will:
♦ shift Patronage, Govt Res, Aid or COIN Control up
♦ place Govt pieces or afford Govt free Ops or SAs
♦ shift Islamabad (only if Taliban is Player)
❹ If Govt Res < 3, Pass
Arrow: **If None** -> diamond 1.

## Decision diamonds (left column, top to bottom)

1. **Assault would add 2+ COIN Control OR remove Taliban Base(s)?** Yes -> Assault. No -> diamond 2.
2. **2+ Player pieces on LoCs OR Taliban exceed Enemies on the 3 or 4 Econ LoC?** Yes -> Patrol. No -> diamond 3.
3. **10+ Govt Troops Available OR Train would place a Base?** Yes -> Train. No -> Sweep.

## Operations

### Assault — *In max 3 spaces but for 2/3↓ of Res max, for all if Res < 9.*
❶ To establish COIN Control
❷ To remove ① Base(s) ②Most Guerrillas:
Within ① & ②: ⓐ Last on LoCs w/ Player OR Taliban (only) ⓑ Assault ① Player ②Taliban ③ Warlords
Arrows: **with** -> Eradicate. **if None** -> Patrol

### Patrol — *With ① Police ② Troops, equally from where most that type. Do not move last Police of Govt Base or Non-Pashtun space. Lose no Control.*
❶ To Control Kabul
❷ Get Police then Troops ① to equal Player on highest Econ LoCs ② if able 2 per 3 & 4 Econ LoCs ③1 per other LoCs
❸ Assault on 1 LoC to remove most pieces of: ① Player ②Taliban ③ Warlords
Arrows: **with** -> Govern. **if None** -> Train

### Train — *At COIN Bases/Kabul. In max 3 spaces but for 2/3↓ of Res max, for all if Res < 9. Place max cubes & up to 2 more Troops than Police (if Available).*
❶ In highest 1+ Pop Province with 3+ Govt cubes, no COIN Base but room, place Base
❷ If no Base placed, in 1 highest 2+ Pop space with COIN Control, no Coalition Base & no Terror: Train (placing 0 if no Base) AND then Civ Act (if no Support) AND then Govern for Patronage†
❸ If no SA or Base placed yet, losing no Control nor displacing last Troop: Train max Troops AND then Transport 5 Troops to highest 2+ Pop AND then Train there placing Base
❹ Train placing cubes at Kabul and/or COIN Bases: ⓐ where least Govt cubes ⓑ at highest Pop
❺ If no Civ Acts or Base placed, remove most Oppose at COIN Control (place 0 if no Base)
† Then complete SA per relevant SA box, see 8.2.
Arrow: **with** -> diamond "Aid at 2 or less OR Warlords is Player?"

### Sweep — *In max 2 spaces. Do not move last Troop from LoC or Govt Base. Lose no Control.*
❶ Get up to 4 Troops (or more if needed) to add COIN Control to highest 1+ Pop space(s) with no COIN Base, Sweep evenly from random source(s): ⓐ for lowest cost (paying 1 Res per used LoC with Enemy)
❷ Sweep *in place* where activating most pieces of: ⓐ Player ⓑ Taliban ⓒ Warlords
Arrows: **with** -> Transport. **if None** -> Train [arrowhead into Train], badge **Loop: Pass**

## Special Activities

### Diamond: Aid at 2 or less OR Warlords is Player?
Yes -> Eradicate. No -> Govern.

### Eradicate — *In up to 2 spaces with Govt cubes, COIN Control & Warlord Base(s).*
❶ At Oppose
❷ Anywhere, if Aid = 0
❸ At non-Pashtun
❹ Random
For ❸ & ❹: if Player is Taliban, only execute if Govt Tribal Elders in play
*If no such Eradicate: After Assault: Transport. Otherwise: Govern. If loop: Transport.*
Arrow: **if None** <-> Govern [two-headed arrow], badge **Loop: Transport**

### Govern — *In up to 2 spaces.*
❶ For Patronage in up to 2 highest Pop spaces with Support, COIN Control and no Coalition Base
❷ Place +1Pop markers in highest 1+ Pop space(s) with Support & COIN Control AND Base(s) of: ① Govt ② Coalition
*If no such Govern, Eradicate. If loop: Transport.*

### Transport — *From 1 space to 1 space. Do not move last Troop from LoC or Govt Base. Lose no COIN Control.*
♦ Per Sweep bullet ❶ (paying 1 Res per entered space with any Guerrilla), with Govt Troops from where most in excess of Control
*If no such Transport, no SA.*

## Momentum

♦ *Tribal Elders:* Shift to Support until Coalition victory margin equals Govt's, then to Neutral only
