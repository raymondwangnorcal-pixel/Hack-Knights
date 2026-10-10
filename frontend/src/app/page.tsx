import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">Buzz Check</p>
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          Shazam for mosquitoes.
        </h1>
        <p className="max-w-xl text-lg opacity-70">
          Your phone hears the buzz, names the species and the diseases it can carry, and helps
          health workers see where malaria and dengue are heading.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/listen" className="rounded-2xl border p-6 hover:border-foreground">
          <p className="text-lg font-semibold">I heard a mosquito</p>
          <p className="mt-1 opacity-60">Listen, identify, and get next steps.</p>
        </Link>
        <Link href="/dashboard" className="rounded-2xl border p-6 hover:border-foreground">
          <p className="text-lg font-semibold">Health dashboard</p>
          <p className="mt-1 opacity-60">Risk by district, forecasts and prevention plans.</p>
        </Link>
      </div>
    </main>
  );
}
