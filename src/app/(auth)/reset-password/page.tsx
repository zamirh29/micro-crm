"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type Stage = "checking" | "ready" | "invalid" | "done"

export default function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>("checking")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function check() {
      // The client exchanges `?code=` (PKCE) / parses `#access_token` while it
      // initialises, so give it a moment before deciding the link is dead.
      let result = await supabase.auth.getUser()
      if (result.error) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (cancelled) return
        result = await supabase.auth.getUser()
      }
      if (cancelled) return
      setStage(result.data.user ? "ready" : "invalid")
    }

    check()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setStage("done")
    setLoading(false)
  }

  if (stage === "checking") {
    return (
      <div className="text-center text-sm text-gray-600">
        Checking your reset link…
      </div>
    )
  }

  if (stage === "invalid") {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          This reset link has expired
        </h1>
        <p className="text-sm text-gray-600">
          Password reset links can only be used once and expire quickly. Request
          a new one and we&apos;ll email you a fresh link.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Request a new reset link
        </Link>
      </div>
    )
  }

  if (stage === "done") {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Password updated
        </h1>
        <p className="text-sm text-gray-600">
          Your password has been changed. You can sign in with it now.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Go to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Choose a new password
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter a new password for your account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700"
          >
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label
            htmlFor="confirm"
            className="block text-sm font-medium text-gray-700"
          >
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Repeat the new password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Set new password"}
        </button>
      </form>
    </div>
  )
}
