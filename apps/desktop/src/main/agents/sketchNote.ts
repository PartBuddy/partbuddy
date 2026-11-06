/**
 * What the model hears when a rough sketch goes along (plan step F4). A hand sketch is neither to
 * scale nor exact, so the model asks for the few dimensions that decide the part instead of
 * measuring the picture, and builds only after the answer.
 */
export const SKETCH_NOTE =
  '[PartBuddy: the attached picture is a rough sketch the user drew with the mouse on squared paper (one square is 20 px, not a set length). ' +
  'It shows shape and proportions, not exact sizes, unless the user wrote dimensions in the message. Describe in one sentence what you take it to be; ' +
  'ask with a clarification card for the two or three dimensions that decide the part (overall size, wall, holes) where the message does not give them, ' +
  'then build it printable as designed. Never read sizes off the picture\'s pixels.]';
