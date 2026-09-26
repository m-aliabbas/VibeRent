"use client";

import { useEffect, useState } from "react";

function greetingForKarachiTime() {
  const hour = Number(
    new Intl.DateTimeFormat("en-PK", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Karachi",
    }).format(new Date()),
  );

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function TimeGreeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState("Hello");

  useEffect(() => {
    const updateGreeting = () => setGreeting(greetingForKarachiTime());
    const initialUpdate = window.setTimeout(updateGreeting, 0);
    const interval = window.setInterval(updateGreeting, 60_000);

    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, []);

  return <>{greeting}, {name}</>;
}
