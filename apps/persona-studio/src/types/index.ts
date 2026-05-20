export type GenerationStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED";

export type Pack = {
  name: "Starter" | "Pro" | "Agency";
  tokens: number;
  price: number;
  currency: "USD";
};

export type ApiError = { error: string; [k: string]: unknown };
