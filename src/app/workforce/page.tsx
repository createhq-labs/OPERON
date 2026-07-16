"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WorkforceIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/workforce/calendar");
  }, [router]);

  return null;
}
