# Source transcript: Non-Player Cartels (Andean Abyss, 2nd Edition)

> © GMT Games. Research source only: transcribed from `examples/non-player-bot-sheets/Non-Player-Cartels.JPEG` to derive generic bot logic. Never copied into the product, the kit or the artifact.
> Transcribed word for word. Layout: boxes in reading order; arrows written as `->`. Circled numbers ❶ are priorities; ① are sub-priorities; circled letters ⓐ are tie-breaks (shaded on the sheet).
> Unclear marks are kept as they appear and noted with [?]. Bold italic on the sheet is kept as ***text***.

## Event? (8.1)

Play Event (shaded)* if has effect and:
[ (Cartels symbol) ? ? ? ]
or
2nd Eligible and no (2) [green circled "2", as on the FARC sheet]
\* 2-player/Non-player Govt: see 8.1

## Decision diamonds (left column, top to bottom)

1. **10+ Cartels pieces available or Rally can place Base?** Yes -> Rally. No -> diamond 2.
2. **A Shipment is available?** Yes -> March. No -> Terror.

## Operations (8.5)

### Rally — In up to 3 Depts or Cities: — max 3
Badge: **None: Pass**
❶ Guerrillas to Underground where Cartels Base, cube, and all Cartels Guerilas Active
❷ Place Bases where at least 2 Cartels Guerrillas without Shipment
❸ Place Guerrillas where Cartels Bases but no Cartels Guerrillas
❹ If no Guerrillas Available for ❸, move 3 Guerrillas ***to*** there ***from*** spaces without Cartels Bases, go Underground
❺ Rally (placing Guerrillas if possible) in 1 Department to enable Cartels then to Cultivate to place a Base
Arrow: **then** -> Cultivate

### March — max 1
With all Cartels Guerrillas except 1 each space with a Cartels Base
❶ ***To*** 1 Department or City with fewer than 2 Bases and adjacent to a space with at least 2 Cartels Guerrillas
Arrows: **then** -> Process. **if none** -> Rally [arrowhead into Rally]

### Terror — In up to 3 spaces with at least 1 Population (and Underground Cartels Guerrillas): — max 3
❶ If Non-player Government and player FARC, at:
① Opposition ② Support ③ Neutral
❷ Otherwise at:
① Support ② Opposition ③ Neutral
Arrows: **then** -> Bribe. **if none** -> March [arrowhead into March]

## Special Activities

### Cultivate — max 1
In a space with Population >0 and where Cartels Guerrillas outnumber Police:
❶ Place a Base (in a Department that Cartels just selected for Rally)
❷ Move a Base ***to*** a City or Department where no Cartels Base ***from*** a space with 2 Cartels Bases
If none, Process
Arrow: **if none** -> Process

### Process — max 2
❶ Place 2 Shipments into random space(s) (with a Cartels Guerrilla and a Cartels Base)
❷ If no such space, remove 1 Base (for Cartels Resources +3) from where there are 2 Cartels Bases
If none, no Special Activity

### Bribe — max 3
In up to 3 spaces with Cartels and enemy:
Target: ❶ Enemy players
❷ Non-players
Within ❶ & ❷:
ⓐ Government
ⓑ FARC
ⓒ AUC
(Remove per 8.1.2 – Bases, Police, Troops, Guerrillas)
If none, no Special Activity

## Event Instructions (8.4.4)

[ (Cartels symbol) ? ? ? ]
**Ayahuasca Tourism** – Use the executing Faction's Guerrillas, if possible; use Active first. If not possible, use FARC, then AUC, then Cartels.
**Drogas La Rebaja, The Chess Player** – Select first among Cities with fewest cubes.
**General Serrano** – Randomly select spaces with Police and Cartels until 4 Police are targeted; relocate the Police to a random City free of Cartels pieces. If no Police with Cartels, choose Operations instead.
**Narco-War** – A Non-player Faction always chooses Operations instead of this Event (an exception to 8.1).
**Op Millenium** – Replace Police in random Cities, then Departments.
**Poppies** – Place executing Faction's Base, if possible, otherwise place a Shipment with that Faction. If neither is possible in a Mountain space, choose Operations instead.
**Riverines & Fastboats** – Select destination via executing Faction's March priorities and a random origin that has that Faction's Underground Guerrillas (if no such destination or no such origin, choose Operations instead). If Cartels, free Op is Rally using Cartels priorities; if not, Terror.
**Salcedo** – Relocate Cartels Guerrillas to random City with Support and the fewest Police, from random spaces with most Cartels Guerrillas, leaving at least 1 per space.
**Sicarios** – Place Guerrillas as evenly among spaces as possible.
**The Chess Player** – If Cartels Non-player, use Bribe priorities.
