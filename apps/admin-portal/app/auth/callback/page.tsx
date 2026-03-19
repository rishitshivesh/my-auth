"use client";

import { useState, useEffect } from "react";
import { PublicLayout } from "@/components/layouts/public-layout";
import { Button } from "@repo/ui";

export default function CallbackPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Simulate OAuth callback processing
    const processCallback = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");
      const state = searchParams.get("state");

      if (!code) {
        setStatus("error");
        setMessage("No authorization code received");
        return;
      }

      try {
        // Simulate API call to exchange code for token
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setStatus("success");
        setMessage("Authentication successful! Redirecting...");

        // In a real app, would redirect to dashboard
        setTimeout(() => {
          window.location.href = "/t/acme-corp/dashboard";
        }, 2000);
      } catch (error) {
        setStatus("error");
        setMessage("Failed to complete authentication");
      }
    };

    processCallback();
  }, []);

  return (
    <PublicLayout showNav={false}>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-md text-center">
          {status === "loading" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Processing your login
              </h1>
              <p className="text-muted-foreground">
                Please wait while we complete your authentication...
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <svg
                    className="h-6 w-6 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Authentication successful!
              </h1>
              <p className="text-muted-foreground">{message}</p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <svg
                    className="h-6 w-6 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Authentication failed
              </h1>
              <p className="text-muted-foreground">{message}</p>
              <div className="pt-4">
                <Button onClick={() => (window.location.href = "/u/login")}>
                  Back to login
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
