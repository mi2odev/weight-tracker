/**
 * Reading a number out of a text field.
 *
 * Harder than `parseFloat` because the field shows a *formatted* number at
 * rest — "1,250" — and the user may type or paste one straight back in.
 * `parseFloat('1,250')` is 1, so a meal of 1,250 kcal would silently become
 * one. A grouped thousands separator has to be removed before parsing, not
 * treated as the end of the number.
 *
 * The app formats with `en-GB` throughout, so `,` groups and `.` decimates.
 * A lone comma is still read as a decimal point when it cannot be grouping,
 * because someone typing "2,5" means two and a half.
 *
 * Pure, so every one of those cases is tested on Node.
 */

/** `1,250` or `1,250,000` — commas in exactly the grouping positions. */
const GROUPED = /^\d{1,3}(,\d{3})+$/;

/** Spaces used as group separators, including the narrow no-break kind. */
const SPACES = /[\s  ]/g;

/**
 * The number a field's text stands for, or null when it is not one.
 *
 * Null covers the empty field too: "nothing typed" and "not a number" are the
 * same answer to the caller, which is "do not store a value".
 */
export function parseDecimalInput(text: string): number | null {
  const trimmed = text.replace(SPACES, '');
  if (trimmed === '') return null;

  let normalised: string;
  if (trimmed.includes(',') && trimmed.includes('.')) {
    // Both present: whichever comes last is the decimal point.
    normalised =
      trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')
        ? trimmed.replace(/\./g, '').replace(',', '.')
        : trimmed.replace(/,/g, '');
  } else if (GROUPED.test(trimmed)) {
    normalised = trimmed.replace(/,/g, '');
  } else {
    normalised = trimmed.replace(',', '.');
  }

  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * True while the text is on its way to being a number.
 *
 * "2." is not a number yet, but it is not a mistake either — it is the middle
 * of typing "2.5", and a field that rejects it can never accept a decimal.
 */
export function isPartialNumber(text: string): boolean {
  return /^-?\d*[.,]?\d*$/.test(text.replace(SPACES, ''));
}
