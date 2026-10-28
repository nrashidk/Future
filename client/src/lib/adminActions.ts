/**
 * One shape for every "Add X" button across the admin surfaces.
 *
 * Six of them exist — School, Users, Announcement, Career, Country, Subject —
 * across three files, and before this they disagreed on two axes. Height:
 * Subjects used size="sm" (h-9) while the rest took the default (h-10), so
 * switching tabs changed the button's size. Position: School and Users sat
 * beside the TabsList, Country sat above its card next to a duplicate page
 * heading, and only Announcement, Career and Subject were where they belonged.
 *
 * WIDTH IS A MINIMUM, NOT A FIXED SIZE, and that is a deliberate compromise.
 * Measured at the real font: the English labels run 128px ("Add Users") to
 * 198px ("Add Announcement"), and the Arabic 119px to 144px. Pinning every
 * button to 198px would make all six identical, but it would also leave
 * 54-79px of empty space inside five of them, worst in Arabic where the labels
 * are shortest. 150px holds five of the six at one width in both languages and
 * lets the one genuinely longer label grow, which reads better than padding
 * five buttons to accommodate a sixth.
 *
 * These buttons are never on screen together — one tab is visible at a time —
 * so what matters is that the control does not appear to change size or move
 * as you switch tabs. Equal height, equal padding and a consistent position do
 * that; a fixed width mostly adds air.
 */
export const ADD_BUTTON_CLASS = "min-w-[150px] justify-center";

/**
 * The row that holds a card's actions. Secondary actions first, the primary
 * (filled) Add button always last, so the eye lands in the same place on every
 * tab.
 */
export const CARD_ACTIONS_CLASS = "flex flex-wrap gap-2";
