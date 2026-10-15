/** A full UK postcode, written without spaces: outward code then inward code. */
const POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

/**
 * Reads what the user typed as a postcode, tolerating case and spacing.
 * Returns it in compact upper case, or `null` when it is not shaped like one.
 */
export const parsePostcode = (input: string): string | null => {
  const compact = input.replace(/\s+/g, "").toUpperCase();
  return POSTCODE.test(compact) ? compact : null;
};
