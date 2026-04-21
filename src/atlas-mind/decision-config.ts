export type AnalysisConfig = {
  globalWindow: number;
  trendWindow: number;
  patternContextSize: number;
  correlationContextSize: number;
};

export const analysisConfig: AnalysisConfig = {
  globalWindow: 200,
  trendWindow: 10,
  patternContextSize: 4,
  correlationContextSize: 4
};
