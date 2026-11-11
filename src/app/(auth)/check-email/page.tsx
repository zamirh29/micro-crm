"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

function CheckEmailContent() {
  const params = useSearchParams()
  const email = params.get("email") ?? ""

  return (
    <div className="space-y-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">
        Check your email
      </h1>
      <p className="text-sm text-gray-600">
        We sent a confirmation link to{" "}
        {email ? <span className="font-medium">{email}</span> : "your email address"}.
        Open it to finish creating your account.
      </p>
      <p className="text-sm text-gray-500">
        Nothing arrived? Check your spam folder, then try signing in — if the
        account is already confirmed you can go straight in.
      </p>
      <div className="flex items-center justify-center gap-4 text-sm">
        <Link
          href="/login"
          className="rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Go to sign in
        </Link>
        <Link
          href="/signup"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Use a different email
        </Link>
      </div>
    </div>
  )
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailContent />
    </Suspense>
  )
}
