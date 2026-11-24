# Source transcript: Non-Player FARC (Andean Abyss, 2nd Edition)

> © GMT Games. Research source only: transcribed from `examples/non-player-bot-sheets/Non-Player-FARC.JPEG` to derive generic bot logic. Never copied into the product, the kit or the artifact.
> Transcribed word for word. Layout: boxes in reading order; arrows written as `->`. Circled numbers ❶ are priorities; circled letters ⓐ are tie-breaks (shaded on the sheet).
> Unclear marks are kept as they appear and noted with [?].

## Event? (8.1)

Play Event (shaded)* if has effect and:
[ (FARC symbol) ? ? ? ]
or
2nd Eligible and no (2) [?: green circled "2" symbol]
\* 2-player/Non-player Govt: see 8.1

## Decision diamonds (left column, top to bottom)

1. **FARC has 9+ Guerrillas available or can place Base?** Yes -> Rally. No -> diamond 2.
2. **Support or LoC has 3+ or Underground FARC forces?** No -> March. Yes -> diamond 3.
3. **FARC has more Resources than Government?** Yes -> Attack. No -> Terror.

## Operations (8.7)

### Rally — In non-Support Depts or Cities:
Badge: **None: Pass**
❶ Guerrillas to Underground where FARC Base, cube, and all FARC Guerrillas Active
❷ Place Bases where at least 3 FARC Guerrillas
❸ Place Guerrillas at FARC Bases
❹ Place a Guerrilla in 1 other space
ⓐ At exactly 1 or 2 FARC Guerrillas
Arrow: **then** -> Extort

### March — With all FARC Guerrillas except 1 FARC Guerrilla (Underground if possible) where any Faction's Base. From Active Opposition, 0 Population, and Sabotaged LoCs (only):
❶ Unless next Propaganda final, onto all unSabotaged LoCs until Guerrilla on each
❷ To up to 3 spaces with 1+ Population at Support or Neutral and no FARC Control
ⓐ Where Guerrillas stay Underground
❸ To 1 space with 1+ Population adjacent to a space with the most FARC Guerrillas yet to move
Arrows: **then** -> Extort. **if none** -> Rally [arrowhead into Rally]

### Attack
❶ Wherever at least 3 FARC Guerrillas
❷ In 1 space where FARC would Ambush
ⓐ City or Department
ⓑ LoC
❸ For ❶ & ❷, **target:**
① Shipments ② AUC ③ Government ④ Cartels
Within ①-④:
ⓐ At most FARC Guerrillas
Arrows: **with** -> Ambush. **if none** -> March [arrowhead into March]

### Terror — Where Underground FARC:
❶ On all unSabotaged LoCs
❷ At more Kidnap targets, until there are at least 3 Kidnap spaces total
❸ In all other spaces with 1+ Pop that are not at Active Opposition
Arrows: **then** -> Kidnap. **if none** -> Attack [arrowhead into Attack]

## Special Activities

### Extort — (where FARC outnumbers all others and has Underground Guerrilla)
❶ Wherever FARC has at least 2 Underground Guerrillas
❷ On 1 (other) LoC
ⓐ At lowest Econ
If none, no Special Activity

### Ambush — max 1
In 1 Attack space with Underground FARC Guerrilla:
❶ At fewest total FARC Guerrillas
ⓐ Targeted Shipment
ⓑ AUC
ⓒ Government
If none, no Special Activity

### Kidnap — max 3
In 3 spaces selected or Terror where FARC Guerrillas exceed Police:
❶ On LoCs (against Government)
❷ In Cities (against Government)
❸ In Cartels Base Dept (against Cartels)
For ❶-❸:
① Skip target with 0 Resources and no Shipment
If none, no Special Activity

## Agitate (6.4.2, 8.7.5)

Support Phase:
• Agitate as much as able.
• First at fewest Terror markers, then at Support, then at highest Population.
• Remove Terror only to shift.

## Event Instructions (8.4.4)

[ (FARC symbol) ? ? ? ]
**Airdropped AKs** – Place Executing Faction's pieces.
**General Offensive** – Where Terror and Attack both possible, execute Terror if it would shift Support/ Opposition, otherwise Attack. FARC and AUC Attack per their priorities, if possible, Cartels per Bribe.
**Kill Zone** – If FARC Non-player, it Ambushes in the space to remove most Government then AUC pieces; if not, AUC Ambushes (if AUC Non-player, to remove most FARC possible, then Government, then Cartels).
**Mono Jojoy** – March per FARC priorities, but disregard whether Guerrillas would Activate. Move Active Guerrillas first. Flip Active Guerrillas where Support then on LoCs, if possible.
**Raúl Reyes** – Place Base with FARC Guerrillas and Support, then with any FARC Guerrillas, if possible.
