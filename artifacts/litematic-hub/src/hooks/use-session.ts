import { useEffect, useState } from "react";

export function useSession() {
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    let id = localStorage.getItem("litematic-session-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("litematic-session-id", id);
    }
    setSessionId(id);
  }, []);

  return sessionId;
}
