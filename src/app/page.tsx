import ThemeToggle from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="min-h-screen hero-section">
      <header className="nav-bar">
        <div className="container-app flex h-16 items-center justify-between">
          <span className="font-heading text-xl font-extrabold text-gradient-hero">
            HSK Online
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="container-app py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge badge-primary mb-4">New HSK 3.0 · Levels 1–9</span>
          <h1 className="font-heading mb-4 text-4xl font-extrabold leading-tight sm:text-5xl">
            Learn Chinese and ace the{" "}
            <span className="text-gradient-primary">HSK exam</span>
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-foreground/70">
            Vocabulary, listening, reading, writing, AI mock tests, and live 1-on-1
            and group classes with teachers — all in one place.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button className="btn-solid btn-solid-primary">Get started</button>
            <button className="btn-solid btn-solid-outline">Explore levels</button>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          <div className="card-elevated card-header-vocab p-6 animate-card-enter">
            <h3 className="font-heading mb-1 text-lg font-bold">Vocabulary</h3>
            <p className="text-sm text-foreground/70">
              Official HSK 3.0 word lists with pinyin and audio.
            </p>
          </div>
          <div className="card-elevated card-header-listening p-6 animate-card-enter delay-100">
            <h3 className="font-heading mb-1 text-lg font-bold">Practice &amp; mock tests</h3>
            <p className="text-sm text-foreground/70">
              New-format listening, reading, and writing.
            </p>
          </div>
          <div className="card-elevated card-header-writing p-6 animate-card-enter delay-200">
            <h3 className="font-heading mb-1 text-lg font-bold">Live classes</h3>
            <p className="text-sm text-foreground/70">
              1-on-1 and group lessons with real teachers.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
