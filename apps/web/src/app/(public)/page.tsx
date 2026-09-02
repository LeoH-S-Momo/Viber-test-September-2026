import { ApiStatus } from "@/components/api-status";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">SeaPass</h1>
      <p className="max-w-md text-neutral-600">
        Plataforma de comercialização e gestão de cruzeiros temáticos — bootstrap inicial do
        projeto.
      </p>
      <ApiStatus />
    </main>
  );
}
