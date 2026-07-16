"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DeboardingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/workforce/lifecycle");
  }, [router]);

  return null;
}
