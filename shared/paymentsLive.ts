/**
 * CAN THIS DEPLOYMENT ACTUALLY TAKE A SCHOOL'S MONEY?
 *
 * Stripe's mode is decided entirely by the key in the environment, and a
 * `pk_test_` key means every card form on the site is a rehearsal: a real
 * school's real card is declined, and a test card "buys" licences for nothing.
 * Neither outcome is something to advertise to a head teacher.
 *
 * So the public pricing page advertises a card path only when the keys are
 * live, and otherwise shows the way schools actually pay — an invoice settled
 * by bank transfer, which is what the invoicing exists for.
 *
 * READ FROM THE PUBLISHABLE KEY, which the client already has in order to
 * initialise Stripe at all. No server flag, no new endpoint, and nothing that
 * can disagree with the keys themselves: the day live keys are set on Render,
 * this flips with no code change.
 *
 * FAILS CLOSED. An absent, malformed or unrecognised key is NOT live. The
 * dangerous direction is showing a card form that cannot take money, so an
 * unknown state must look like the one that offers an invoice instead.
 *
 * NOT A PERMISSION CHECK. This decides what the page OFFERS, never what the
 * server accepts — /checkout still works when reached directly, which is how
 * the purchase flow gets tested while the keys are test keys.
 */
export function paymentsAreLive(publishableKey: string | undefined | null): boolean {
  return typeof publishableKey === "string" && publishableKey.startsWith("pk_live_");
}
