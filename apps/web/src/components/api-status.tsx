"use client";

import { useEffect, useState } from "react";
import { getApiHealth } from "@/services/health.service";
import type { HealthStatus } from "@seapass/contracts";

type State =
  | { phase: "loading" }
  | { phase: "online"; data: HealthStatus }
  | { phase: "offline"; message: string };

export function ApiStatus() {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    getApiHealth()
      .then((data) => {
        if (!cancelled) setState({ phase: "online", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            phase: "offline",
            message: error instanceof Error ? error.message : "Erro desconhecido",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "loading") {
    return <p className="text-sm text-neutral-500">Verificando conexão com a API…</p>;
  }

  if (state.phase === "offline") {
    return (
      <p className="text-sm text-red-600">
        API indisponível ({state.message}). Verifique se o backend está rodando em{" "}
        <code>{process.env.NEXT_PUBLIC_API_URL}</code>.
      </p>
    );
  }

  return (
    <p className="text-sm text-green-600">
      API conectada — status: <strong>{state.data.status}</strong>
    </p>
  );
}
