import { convexAuth } from "@convex-dev/auth/server"
import { Password } from "@convex-dev/auth/providers/Password"
import { ConvexError } from "convex/values"

// The website build type-checks this file too, and it has no Node types,
// so declare the bit of `process` we use (same as convex/scouting.ts).
declare const process: { env: Record<string, string | undefined> }

// Sign-in: username + password.
// Sign-up: also needs the team join code, stored in the TEAM_JOIN_CODE
// Convex environment variable, so only people who got the code from a
// mentor can create accounts.
//
// The previous version of this login (nickname + password, open sign-up)
// is saved on the GitHub branch `claude/archive-auth-v1`.

const COMMON_PASSWORDS = new Set([
  "password", "password1", "12345678", "123456789", "1234567890", "qwerty123",
  "iloveyou", "11111111", "00000000", "abc12345", "frcrobotics", "robotics",
  "team1880", "warriors", "letmein1",
])

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase()
        if (!/^[a-z0-9-]{3,24}@scout\.local$/.test(email)) {
          throw new ConvexError("BAD_USERNAME")
        }
        if (params.flow === "signUp") {
          const required = process.env.TEAM_JOIN_CODE?.trim()
          const provided = String(params.teamCode ?? "").trim()
          if (required && provided.toLowerCase() !== required.toLowerCase()) {
            throw new ConvexError("BAD_TEAM_CODE")
          }
        }
        // Convex values can't be `undefined`, so build a plain string map
        // and only add name when it's set.
        const profile: Record<string, string> & { email: string } = { email }
        const name = String(params.name ?? "").trim().slice(0, 40)
        if (name) profile.name = name
        return profile
      },
      validatePasswordRequirements(password) {
        if (password.length < 8 || password.length > 128) {
          throw new ConvexError("WEAK_PASSWORD")
        }
        if (COMMON_PASSWORDS.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) {
          throw new ConvexError("WEAK_PASSWORD")
        }
      },
    }),
  ],
})
