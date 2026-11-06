export function Brand({ subtitle, heading = false }) {
  const Title = heading ? "h1" : "p";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-seal font-semibold text-white">22</span>
      <div className="min-w-0">
        <Title className="font-serif text-2xl leading-none">Seal22</Title>
        {subtitle ? <p className="mt-1 text-sm text-ink/70">{subtitle}</p> : null}
      </div>
    </div>
  );
}
