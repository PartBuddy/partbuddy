/**
 * The standards the assistant looks up before it designs a part of a kind itself (decided
 * 2026-11-11: no fixed block per kind, whose shape depends on the part; the rules and sizes are
 * what stays). Each line says where its figure comes from: a data sheet or standard, guides for
 * printed parts (which disagree, so a range), or PartBuddy's own choice. Nothing here has been
 * printed by PartBuddy; a line changes when a print shows it wrong.
 */

export const STANDARD_TOPICS = ['slidingLid', 'clamp', 'feet', 'hook', 'cableEntry', 'vent', 'boardMount', 'starKnob'] as const;
export type StandardTopic = (typeof STANDARD_TOPICS)[number];

export const STANDARDS: Record<StandardTopic, { title: string; rules: string[] }> = {
  slidingLid: {
    title: 'A lid that slides into grooves of a box',
    rules: [
      'Grooves with 45° flanks (a dovetail) in the two long walls and the back wall, open at the front: they print without support with the box standing. A square groove is a bridge and sags from 5 mm (Hubs).',
      'Lid 3 to 4 mm thick, its edges chamfered at 45° to match; groove 1.5 mm deep, at most half the wall; 2 mm of wall over the groove; walls 3 mm (guides).',
      'Room 0.3 mm per side and 0.3 mm above and below the lid (guides say 0.2 to 0.4; Prusa asks at least 0.3 for moving parts, Hubs 0.5).',
      'Hold it shut with a bump 0.3 mm high across the lid near the open end and a matching dent, and give the lid a finger dent about 12 mm round and 2 mm deep, or a raised ridge (guides, one source each).',
      'Print the box standing and the lid lying flat. The front wall of the box is lower by the lid, so the lid closes it.',
      'For a rail pushed onto another part use partbuddy_mechanism with kind plug and shape dovetail instead.',
    ],
  },
  clamp: {
    title: 'A clip or clamp round a tube, a rod or a cable',
    rules: [
      'A C clip to snap on: inner diameter the tube and 0.3 to 0.5 mm, the opening 75 to 85 % of the tube, arms 1.5 to 2.5 mm thick, 8 to 12 mm wide (guides). Round the ends of the arms outwards so the tube finds its way in.',
      'A clamp closed by a screw: bore the measured diameter to grip (0.1 to 0.2 mm more to slide), a slot 2 to 5 mm wide, wall about 4 mm at 25 mm, and lugs either side of the slot for the screw; make the screw holes with partbuddy_block or partbuddy_mechanism kind screw.',
      'A clamp of two halves: 0.4 mm of room on the tube, a gap of 1 mm between the halves so the screws can pull them tight (guides).',
      'Always print it lying, the bore upright: the layers then run round the ring. Standing, the arms break along their layers (guides, and measured for hooks).',
      'Ask for the measured diameter; tubes are sold in many series and none is assumed here.',
    ],
  },
  feet: {
    title: 'Feet and what a part stands on',
    rules: [
      'Stick-on rubber feet hold on a table; printed feet slide. Common ones (3M Bumpon data sheet, ±0.5 mm): SJ5302 7.9 × 2.2 mm, SJ5076 8.0 × 2.8, SJ5306 9.5 × 3.8, SJ5003 11.1 × 5.0, SJ5012 12.7 × 3.5, SJ5744 19.1 × 4.1.',
      'A recess for such a foot is not needed (3M) but keeps it from being sheared off: 0.5 mm wider than the foot, 0.5 to 1 mm deep, never deeper than half the foot, so it still stands proud (own choice from that tolerance).',
      'Four feet near the corners for anything that is pressed on or may tip; three never rock on an uneven table (guides).',
      'Chamfer every edge that lies on the print bed by 0.4 mm at 45°: the first layer is squeezed wider (the slicers compensate about 0.2 mm; Hubs asks for a chamfer; Gridfinity uses 0.8 mm).',
      'Feet printed on: at least 8 mm across and 2 mm high, with a chamfered rim. Feet of TPU cushion more than they grip (guides).',
    ],
  },
  hook: {
    title: 'Hooks and eyes that carry a load',
    rules: [
      'Print a hook lying on its side, so the load runs along the layers: measured on one test hook (CNC Kitchen), lying held 119 kg in PLA and 106 kg in PETG until it broke, standing 69 kg and 36 kg. These are breaking loads of one shape, not what a hook may carry for years: plastic creeps, so allow a tenth.',
      'Layers of at most 0.2 mm and four or more wall lines; at 0.3 mm the standing hook held half (CNC Kitchen).',
      'Round the inside corner where the hook leaves its plate, with a radius of at least the hook\'s thickness (Hubs asks for a fillet without a size; the size is our choice), and keep the section at least 6 × 6 mm for anything heavier than a coat.',
      'Hang the plate with partbuddy_block keyhole or woodScrew, two of them level from 60 mm of width.',
      'An eye: hole 4 mm for a key ring (5 mm for a heavy one), 3.5 mm for a ball chain, twice the wire and 1 mm for a carabiner, each 0.2 mm more for print; 2 to 3 mm of plastic round the hole (guides say 1.5 to 3).',
      'A slot for a cable tie: ties are 2.5, 3.5 and 4.6 mm wide (HellermannTyton T18R, T30R, T50R) and about 1 mm thick; make the slot 1 mm wider and 1.5 mm high (own choice), and print it so that it stands upright: a lying slot sags.',
    ],
  },
  cableEntry: {
    title: 'A cable into a housing, held against pulling',
    rules: [
      'Cables: USB-C 2 to 4 mm thick (charging) or 4 to 6 mm (full-featured) (USB-IF); mains flex H03VV-F 2 × 0.75 about 5.8 mm, H05VV-F 3 × 0.75 from 6.0 to 7.6 mm by maker. Ask for the measured cable.',
      'A plain hole: the cable and 1 mm, its edges rounded or chamfered by 0.5 mm so they do not cut (own choice). A cable with its plug moulded on needs a slot from the rim of the wall down to the hole, closed by the lid, or the plug\'s own size and 1 mm per side (Hubs for cut-outs).',
      'Inside, do not bend the cable tighter than four times its diameter (Helukabel for H05VV-F, fixed).',
      'Strain relief, simplest first: a cable tie round the cable just inside the wall, wider than the hole; or a bridge on the floor with two slots for a tie (2.5 or 3.5 mm wide, slots 1 mm wider, 1.5 mm high, printed upright); or a clamp bar with two screws over the cable, its saddle 0.5 mm less than the cable so it grips (own choice).',
      'A bought cable gland seals and holds at once. Holes by EN 60423: M12 12.2 mm for cables of 3 to 6.5 mm, M16 16.2 mm for 4 to 8 or 5 to 10 mm, M20 20.2 mm for 6 to 12 mm; PG7 12.7 to 13 mm, PG9 15.4 to 15.7 mm (makers differ). The wall needs to be flat round the hole for the nut.',
      'Mains voltage in a printed housing is the user\'s responsibility: say so, and never present the part as safe for it.',
    ],
  },
  vent: {
    title: 'Vents, grilles and fan openings',
    rules: [
      'In an upright wall make slots that stand upright, 2 to 3 mm wide with bars at least 1.2 mm between them (three lines of a 0.4 mm nozzle; Prusa lists 0.45, 0.9, 1.35 and 1.8 mm for one to four lines); a lying slot is a bridge, fine up to 5 mm long (Hubs). Close a long upright slot with a 45° point at its top.',
      'In a flat top or bottom any pattern prints, as the holes are upright. Hexagons 6 to 8 mm across flats with 1.2 mm bars are stiff and open (own choice; no source gives sizes).',
      'To keep fingers out, no opening over 12 mm (IP2X stops what is larger than 12.5 mm); against wire and small parts 1 mm (IP4X).',
      'Fans, mounting holes centre to centre: 25 mm fan 20, 30 fan 24, 40 fan 32, 50 fan 40, 60 fan 50, 80 fan 71.5, 92 fan 82.5, 120 fan 105 mm. Screws by the fan: commonly M3 up to 60 mm and M4 above; check the fan in hand, sources differ on the hole.',
      'A fan opening: a round hole 2 mm less than the fan, or a grille of bars; leave 3 mm of wall between hole and screw.',
      'Air must get in as well as out: openings low on one side and high on the other, about as much area as the fan sweeps.',
    ],
  },
  boardMount: {
    title: 'Holding a circuit board',
    rules: [
      'Standoffs: outer diameter 2 to 2.5 times the hole, at least 5 mm; high enough for what is soldered under the board, 5 mm as a rule and 10 mm over pin headers (guides). Join each to the floor with a 1 mm fillet.',
      'Screwed straight into plastic: draw the pilot hole 0.8 times the screw\'s diameter (2.0 mm for M2.5, 2.4 mm for M3) plus the hole allowance of the print profile, at least twice the screw\'s diameter deep, in a boss three times as wide as the hole. Too tight splits the boss and too loose strips, so tell the user to try it on one boss first. For a board taken out often use partbuddy_block insertSeat or boss instead.',
      'Without screws: two pins 0.3 mm less than the board\'s holes to locate it and two snap hooks over its edge. The board is 1.6 mm thick as a rule; a hook 1 mm thick at its root and 5 mm wide, 0.5 mm of room (Hubs).',
      'A slot the board slides into: 2.0 mm wide for a 1.6 mm board (own choice, 0.2 mm per side), 2 mm deep.',
      'Leave 0.5 mm round the board and 1 mm per side round every plug in the wall (Hubs).',
      'Boards (from the makers\' drawings, to be checked against the board in hand): Raspberry Pi 4 and 5 are 85 × 56 mm with four M2.5 holes of 2.7 mm in a rectangle 58 × 49 mm, 3.5 mm from the edges; Pi Zero 65 × 30 mm, holes 58 × 23 mm; Arduino Uno 68.58 × 53.34 mm with 3.2 mm holes at (13.97, 2.54), (15.24, 50.80), (66.04, 7.62) and (66.04, 35.56). For any other board ask for its drawing or measured holes.',
      'Plugs of the Raspberry Pi, their centres from the makers\' drawings (approximate there; check against the board in hand). Seen from above with the pin header along the far edge, on the near long edge, from the left short edge: Pi 4 USB-C 11.2 mm, micro HDMI 26.0 and 39.5, audio jack 54.0; Pi 5 USB-C 11.2, micro HDMI 25.8 and 39.2, and no audio jack. On the right short edge, from the near long edge: Pi 4 USB 9 and 27, Ethernet 45.75; Pi 5 Ethernet 10.2, USB 29.1 and 47, so the two changed places. USB and Ethernet stand about 3 mm out over the board\'s edge (Pi 5 drawing). The drawings give no sizes for the openings: ask for the measured plugs, and do not place a plug of any board from memory.',
    ],
  },
  starKnob: {
    title: 'A star knob that clamps with a screw or a nut',
    rules: [
      'Sizes of DIN 6336 in plastic (Ganter): diameter 25 mm for M5 (hub 12, height 16), 32 for M6 (hub 14, height 20), 40 for M8 (hub 18, height 25), 50 for M10 (hub 22, height 32), 63 for M12 (hub 26, height 40).',
      'Five lobes are usual (the standard\'s count could not be confirmed); round them generously, lobe radius about a sixth of the diameter.',
      'To hold a hexagon screw: a hexagonal pocket from the top, across flats 0.3 mm more than the head and as deep as the head, with a through hole of the thread and 0.4 mm under it. Heads by ISO 4017, across flats and height: M5 8 and 3.5 mm, M6 10 and 4, M8 13 and 5.3.',
      'To hold a nut: the same pocket from below the hub; nuts by ISO 4032 are as wide as the heads and up to 4.7 (M5), 5.2 (M6) and 6.8 mm (M8) high. For M3 to M6 partbuddy_block nutTrap makes the pocket.',
      'Keep plastic round the pocket as thick as the thread is wide, and glue the screw or nut in with a drop of superglue or close the pocket with a pressed-in cap.',
      'Print it with the pocket opening upwards, flat side down. For a knob on a shaft (potentiometer, encoder) use partbuddy_block knob.',
    ],
  },
};

/** What the assistant reads for a topic. */
export function standardText(topic: StandardTopic): string {
  const { title, rules } = STANDARDS[topic];
  return `${title}. Design it yourself by these rules, and tell the user where a figure is a range or our own choice:\n${rules.map((rule) => `- ${rule}`).join('\n')}\nNone of this has been printed by PartBuddy yet. The print check in partbuddy_view still judges what you build.`;
}
