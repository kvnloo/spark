export type LabCase = {
  source: "paged" | "in-memory";
  motion: "orbit" | "reverse";
  seed: number;
  lodSplatCount: number;
  trialIndex: number;
  sortRadial: boolean;
};

export function createMatrix(profile?: string, repetitions?: number): LabCase[];
export function cameraTape(
  seed: number,
  motion: string,
  frameCount: number,
): [number, number, number][];
