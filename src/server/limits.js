export const SANDBOX_LIMITS = {
  image: "seal22-sandbox:alpha",
  cpus: 0.5,
  memoryMb: 512,
  pidsLimit: 128,
  timeoutMs: 60_000,
  network: "none",
  dockerSocket: false,
  mount: "project",
  user: "1000:1000",
};

export const PROVIDER_ID = "alpha-local";
