/**
 * Execution audit publishing and self-action correlation.
 *
 * Records every execution action to the immutable audit log and tags
 * the resulting Graph API events so the read path can identify and
 * filter out self-generated changes (self-action correlation).
 */

export {};
