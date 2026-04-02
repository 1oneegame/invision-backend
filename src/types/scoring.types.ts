export type Track = 'foundation' | 'undergraduate';

export type Recommendation = 'strong shortlist' | 'review required' | 'hold';

export type Subscores = {
    motivation: number;
    leadership: number;
    growth: number;
    readiness: number;
};

export type FeatureVector = {
    profileCompleteness: number;
    essayWordCount: number;
    essayRichness: number;
    motivationSignals: number;
    leadershipSignals: number;
    engagementSignals: number;
    growthTrajectory: number;
    revisionsCount: number;
    hasVideo: boolean;
    aiConsent: boolean;
};

export type ScoringExplanation = {
    factorsPlus: string[];
    factorsMinus: string[];
    notes: string;
};

export type AiEssayAnalysis = {
    motivation: number;
    leadership: number;
    growth: number;
    readiness: number;
    factorsPlus: string[];
    factorsMinus: string[];
    notes: string;
};

export type ScoringResult = {
    candidateId: string;
    totalScore: number;
    subscores: Subscores;
    confidence: number;
    recommendation: Recommendation;
    explanation: ScoringExplanation;
    metadata: {
        track: Track;
        scoringVersion: string;
        model: string;
        usedAiEnhancement: boolean;
        degradedMode: boolean;
        scoredAt: string;
    };
};

export type BatchScoringResultItem = {
    candidateId: string;
    score: number;
    rank: number;
    recommendation: Recommendation;
    confidence: number;
};

export type BatchScoringFailureItem = {
    candidateId: string;
    message: string;
    code: string;
};

export type RunScoringInput = {
    candidateId?: string;
    payload?: unknown;
    track?: Track;
};

export type BatchScoringInput = {
    candidateIds?: string[];
    cohortId?: string;
    track?: Track;
};

export type ListScoringInput = {
    cohortId?: string;
    track?: Track;
    scoringVersion?: string;
    limit?: number;
};

export type ListScoringResultItem = {
    candidateId: string;
    score: number;
    rank: number;
    recommendation: Recommendation;
    confidence: number;
    track: Track;
    scoringVersion: string;
    scoredAt: string;
};

export type ListScoringResult = {
    results: ListScoringResultItem[];
    processed: number;
    cohortId?: string;
};
