"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ApplicationsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/agents");
  }, [router]);
  return null;
}
