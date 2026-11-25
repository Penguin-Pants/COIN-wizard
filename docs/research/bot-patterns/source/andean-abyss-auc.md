# Source transcript: Non-Player AUC (Andean Abyss, 2nd Edition)

> © GMT Games. Research source only: transcribed from `examples/non-player-bot-sheets/Non-Player-AUC.JPEG` to derive generic bot logic. Never copied into the product, the kit or the artifact.
> Transcribed word for word. Layout: boxes in reading order; arrows written as `->`. Circled numbers ❶ are priorities; ① are sub-priorities; circled letters ⓐ are tie-breaks (shaded on the sheet).
> Unclear marks are kept as they appear and noted with [?]. Bold italic on the sheet is kept as ***text***.

## Event? (8.1)

Play Event (shaded)* if has effect and:
[ (AUC symbol) ? ? ? ]
or
2nd Eligible and no (2) [green circled "2", as on the FARC sheet]
\* 2-player/Non-player Govt: see 8.1

## Decision diamonds (left column, top to bottom)

1. **AUC has 6+ Guerrillas available or can place Base?** Yes -> Rally. No -> diamond 2.
2. **AUC is in at least half of spaces with FARC Bases?** No -> March. Yes -> diamond 3.
3. **Underground AUC Guerrilla at FARC Base?** No -> Attack. Yes -> Terror.

## Operations (8.6)

### Rally — In up to 3 non-Opposition Depts/Cities: — max 3
Badge: **None: Pass**
❶ Guerrillas to Underground where AUC Base, cube, and all AUC Guerrillas Active
❷ Place Bases where at least 3 AUC Guerrillas
❸ Place Guerrillas at:
① FARC Bases
② AUC Bases
③ Elsewhere
ⓐ If AUC Base available, at exactly 1 or 2 AUC Guerrillas
Arrow: **then** -> Extort

### March — Leave at least 1 AUC Guerrilla each space with AUC Base or any FARC. — max 2
❶ ***To*** 1 Department or City with FARC and no AUC Guerrillas ***with*** all adjacent AUC Guerillas
ⓐ To FARC Base
ⓑ Where and so that AUC Guerrillas can stay Underground
❷ ***To*** 1 space closer to FARC ***with*** largest group of AUC Guerrillas yet to move
ⓐ Closer to FARC Base
Arrows: **then** -> Extort. **if none** -> Rally [arrowhead into Rally]

### Attack — in up to 3 spaces with Underground AUC or at least 3 AUC Guerrillas: — max 3
❶ To remove: ① Shipments ② FARC ③ Government
Within ①-③:
ⓐ At most AUC Guerrillas
Arrows: **with** -> Ambush. **if none** -> March [arrowhead into March]

### Terror — In up to 3 spaces with Underground AUC Guerrillas: — max 3
❶ 1 space at FARC Base and where fewer Police than AUC Guerrillas
❷ 1 City or Department with FARC; if Non-player Govt, not at Support
❸ Other Cities or Departments; if Non player Govt, not at Support
Arrows: **then** -> Assassinate. **if none** -> Attack [arrowhead into Attack]

## Special Activities

### Extort
❶ Wherever able (AUC outnumbers all others and has Underground Guerrilla)
If none, no Special Activity

### Elite Backing (6.4.5, 8.6.1)
Support Phase:
• Free Rally at no Govt or FARC Control.
• Place Base if able, otherwise Guerrillas per Rally box (at upper left).

### Ambush — max 1
In 1 Attack space with Underground AUC Guerrilla:
❶ At fewest total AUC Guerrillas, against:
ⓐ Targeted Shipment
ⓑ FARC
ⓒ Government
If none, no Special Activity

### Assassinate — max 3
In up to 3 AUC Terror spaces where AUC Guerrillas exceed Police:
❶ To remove:
ⓐ Guerrillas to take Shipments
ⓑ FARC
ⓒ Government
ⓓ Cartels (Bases first, 8.1.2)
If none, no Special Activity

## Event Instructions (8.4.4)

[ (AUC symbol) ? ? ? ]
**Carabineros** – Replace Police in Opposition space, if possible, and on LoCs last.
**Criminal Air Force** – Executing Faction moves using its "To" March priority, from where it has the most Guerrillas, as much as possible with Active Guerrillas.
**Demobilization** – Move the most Police then Troops possible to 1 random City.
**Deserters & Defectors** – In a random City or Department with at least 2 enemy Guerrillas, replace them with executing Guerrillas, targeting the Faction with most Guerrillas there first (equal-chance roll if tied).
**Former Military** – If AUC Non-player, use its March/Attack priorities.
**Limpieza** – Executing Faction conducts Terror in a random Department or City with enemy, FARC not in Opposition. Remove Government, then FARC, AUC, Cartels. AUC sets to Support, others to Opposition.
