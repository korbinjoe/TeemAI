
/**
 *  switch  default  union case
 * TypeScript
 */
export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`)
}
