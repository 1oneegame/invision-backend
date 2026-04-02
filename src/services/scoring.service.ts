import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ObjectId, type Collection } from 'mongodb';
import { z } from 'zod';
import type { IntakeBody } from '../schemas/intake.schema.js';
import type {
    AiEssayAnalysis,
    BatchScoringFailureItem,
    BatchScoringInput,
    BatchScoringResultItem,
    FeatureVector,
    Recommendation,
    RunScoringInput,
    ScoringExplanation,
    ScoringResult,
    Subscores,
    Track,
} from '../types/scoring.types.js';

export type IntakeVersionDocument = {
    candidateId: ObjectId;
    version: number;
    payload: IntakeBody;
    createdAt: Date;
};

export type IntakeDocument = IntakeBody & {
    _id?: ObjectId;
    userId: string;
    status: 'draft' | 'submitted';
    completeness: number;
    issues: string[];
    cohortId?: string;
    createdAt: Date;
    updatedAt: Date;
};

export type CohortDocument = {
    _id?: ObjectId;
    cohortId: string;
    candidateIds: string[];
    updatedAt: Date;
};

export type ScoringDocument = {
    _id?: ObjectId;
    candidateId: ObjectId;
    scoringVersion: string;
    track: Track;
    totalScore: number;
    subscores: Subscores;
    confidence: number;
    recommendation: Recommendation;
    explanation: ScoringExplanation;
    metadata: ScoringResult['metadata'];
    features: FeatureVector;
    updatedAt: Date;
};

export type ScoringConfig = {
    scoringVersion: string;
    defaultTrack: Track;
    model: string;
    openAiApiKey?: string;
    openAiTimeoutMs: number;
    aiInfluence: number;
    batchConcurrency: number;
};

type ScoreWeights = {
    motivation: number;
    leadership: number;
    growth: number;
    readiness: number;
};

const TRACK_WEIGHTS: Record<Track, ScoreWeights> = {
    foundation: {
        motivation: 0.35,
        leadership: 0.2,
        growth: 0.3,
        readiness: 0.15,
    },
    undergraduate: {
        motivation: 0.25,
        leadership: 0.3,
        growth: 0.2,
        readiness: 0.25,
    },
};

const AI_ANALYSIS_SCHEMA = z.object({
    motivation: z.number().min(0).max(1),
    leadership: z.number().min(0).max(1),
    growth: z.number().min(0).max(1),
    readiness: z.number().min(0).max(1),
    factorsPlus: z.array(z.string()).max(5),
    factorsMinus: z.array(z.string()).max(5),
    notes: z.string(),
});

function clampScore(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function deriveTrackFromIntake(intake: IntakeDocument): Track | undefined {
    const derivedTrack = intake.video?.metadata?.track?.toLowerCase();
    if (derivedTrack === 'foundation' || derivedTrack === 'undergraduate') {
        return derivedTrack;
    }

    return undefined;
}

function keywordSignal(text: string, keywords: string[]): number {
    if (!text) {
        return 0;
    }

    const lowered = text.toLowerCase();
    const hits = keywords.reduce((acc, keyword) => {
        return acc + (lowered.includes(keyword) ? 1 : 0);
    }, 0);

    return clampScore(hits / keywords.length);
}

function wordsCount(text: string): number {
    if (!text.trim()) {
        return 0;
    }

    return text.split(/\s+/).filter(Boolean).length;
}

function uniqueWordRatio(text: string): number {
    const words = text.toLowerCase().match(/[a-zа-я0-9]+/gi) ?? [];
    if (words.length === 0) {
        return 0;
    }

    const unique = new Set(words);
    return clampScore(unique.size / words.length);
}

function profileCompleteness(intake: IntakeDocument): number {
    const checks = [
        intake.profile.firstName.length > 0,
        intake.profile.lastName.length > 0,
        intake.profile.email.length > 0,
        intake.profile.phone.length > 0,
        Boolean(intake.profile.dateOfBirth),
        Boolean(intake.profile.country),
        Boolean(intake.profile.language),
    ];

    const completed = checks.filter(Boolean).length;
    return clampScore(completed / checks.length);
}

function timelinessSignal(intake: IntakeDocument): number {
    const createdAt = intake.createdAt instanceof Date ? intake.createdAt.getTime() : Date.now();
    const updatedAt = intake.updatedAt instanceof Date ? intake.updatedAt.getTime() : createdAt;
    const days = Math.max(1, Math.round((updatedAt - createdAt) / 86400000));

    if (days <= 1) {
        return 1;
    }

    return clampScore(14 / days);
}

function recommendationFromScore(totalScore: number, confidence: number): Recommendation {
    if (totalScore >= 0.78 && confidence >= 0.55) {
        return 'strong shortlist';
    }

    if (totalScore >= 0.58) {
        return 'review required';
    }

    return 'hold';
}

function dedupeFactors(input: string[]): string[] {
    const normalized = input.map((item) => item.trim()).filter(Boolean);
    return [...new Set(normalized)].slice(0, 5);
}

function buildBaselineExplanation(features: FeatureVector): ScoringExplanation {
    const factorsPlus: string[] = [];
    const factorsMinus: string[] = [];

    if (features.profileCompleteness >= 0.8) {
        factorsPlus.push('Profile data is complete and well-structured.');
    }

    if (features.essayWordCount >= 250) {
        factorsPlus.push('Essay length provides enough context for assessment.');
    }

    if (features.leadershipSignals >= 0.5) {
        factorsPlus.push('Essay shows leadership-oriented language and examples.');
    }

    if (features.growthTrajectory >= 0.5) {
        factorsPlus.push('Version history suggests measurable growth over time.');
    }

    if (features.essayWordCount < 150) {
        factorsMinus.push('Essay is short; signal quality is limited.');
    }

    if (features.profileCompleteness < 0.7) {
        factorsMinus.push('Profile completeness is below target level.');
    }

    if (features.engagementSignals < 0.5) {
        factorsMinus.push('Engagement signals are weaker than expected.');
    }

    if (!features.aiConsent) {
        factorsMinus.push('AI analysis consent is missing; NLP enhancement disabled.');
    }

    return {
        factorsPlus: dedupeFactors(factorsPlus),
        factorsMinus: dedupeFactors(factorsMinus),
        notes: 'Baseline scoring combines profile completeness, essay quality, growth, and engagement signals.',
    };
}

async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const safeLimit = Math.max(1, limit);
    const results: R[] = new Array(items.length);
    let cursor = 0;

    const runWorker = async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            const item = items[index];
            if (typeof item === 'undefined') {
                continue;
            }
            results[index] = await worker(item);
        }
    };

    const workers = Array.from({ length: Math.min(safeLimit, items.length) }, () => runWorker());
    await Promise.all(workers);
    return results;
}

export class ScoringServiceError extends Error {
    statusCode: number;
    code: string;

    constructor(message: string, statusCode: number, code: string) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

export function createScoringService(
    intakeCollection: Collection<IntakeDocument>,
    versionsCollection: Collection<IntakeVersionDocument>,
    scoringCollection: Collection<ScoringDocument>,
    cohortsCollection: Collection<CohortDocument>,
    config: ScoringConfig,
) {
    const openai = config.openAiApiKey
        ? createOpenAI({ apiKey: config.openAiApiKey })
        : null;

    async function getVersions(candidateId: ObjectId): Promise<IntakeVersionDocument[]> {
        return versionsCollection.find({ candidateId }).sort({ version: 1 }).toArray();
    }

    function engineerFeatures(intake: IntakeDocument, versions: IntakeVersionDocument[]): FeatureVector {
        const essayText = intake.essay?.text ?? '';
        const essayWordCount = wordsCount(essayText);
        const essayRichness = uniqueWordRatio(essayText);
        const motivationSignals = keywordSignal(essayText, [
            'motivation',
            'goal',
            'impact',
            'purpose',
            'achieve',
            'learn',
            'growth',
        ]);
        const leadershipSignals = keywordSignal(essayText, [
            'lead',
            'team',
            'initiative',
            'mentor',
            'organize',
            'community',
            'responsibility',
        ]);
        const revisionsCount = versions.length;
        const firstEssayLength = wordsCount(versions[0]?.payload.essay?.text ?? essayText);
        const latestEssayLength = wordsCount(versions[versions.length - 1]?.payload.essay?.text ?? essayText);
        const essayGrowth = latestEssayLength > 0
            ? clampScore((latestEssayLength - firstEssayLength) / Math.max(100, latestEssayLength))
            : 0;
        const growthTrajectory = clampScore((Math.max(0, revisionsCount - 1) / 4) + essayGrowth);
        const engagementSignals = clampScore((timelinessSignal(intake) * 0.6) + (Math.min(3, revisionsCount) / 3) * 0.4);

        return {
            profileCompleteness: profileCompleteness(intake),
            essayWordCount,
            essayRichness,
            motivationSignals,
            leadershipSignals,
            engagementSignals,
            growthTrajectory,
            revisionsCount,
            hasVideo: Boolean(intake.video?.url),
            aiConsent: Boolean(intake.consent.aiAnalysis),
        };
    }

    function buildBaselineSubscores(features: FeatureVector): Subscores {
        const motivation = clampScore(
            (features.essayWordCount >= 200 ? 0.35 : features.essayWordCount / 600)
            + (features.motivationSignals * 0.35)
            + (features.profileCompleteness * 0.2)
            + (features.engagementSignals * 0.1),
        );

        const leadership = clampScore(
            (features.leadershipSignals * 0.55)
            + (features.hasVideo ? 0.15 : 0)
            + (features.engagementSignals * 0.15)
            + (features.essayRichness * 0.15),
        );

        const growth = clampScore(
            (features.growthTrajectory * 0.5)
            + (features.motivationSignals * 0.2)
            + (features.engagementSignals * 0.2)
            + (features.essayRichness * 0.1),
        );

        const readiness = clampScore(
            (features.profileCompleteness * 0.5)
            + (features.engagementSignals * 0.3)
            + (features.hasVideo ? 0.1 : 0)
            + (features.essayWordCount >= 150 ? 0.1 : 0),
        );

        return { motivation, leadership, growth, readiness };
    }

    function weightedTotal(subscores: Subscores, track: Track): number {
        const weights = TRACK_WEIGHTS[track];
        return clampScore(
            (subscores.motivation * weights.motivation)
            + (subscores.leadership * weights.leadership)
            + (subscores.growth * weights.growth)
            + (subscores.readiness * weights.readiness),
        );
    }

    function confidenceFromFeatures(features: FeatureVector, degradedMode: boolean): number {
        const baseConfidence = clampScore(
            (features.profileCompleteness * 0.35)
            + (features.essayRichness * 0.2)
            + (features.engagementSignals * 0.25)
            + (Math.min(features.essayWordCount, 400) / 400) * 0.2,
        );

        if (!degradedMode) {
            return baseConfidence;
        }

        return clampScore(baseConfidence * 0.85);
    }

    async function runAiEnhancement(
        intake: IntakeDocument,
        track: Track,
        baseline: Subscores,
        features: FeatureVector,
    ): Promise<AiEssayAnalysis> {
        if (!openai || !features.aiConsent || !intake.essay?.text) {
            throw new ScoringServiceError('AI enhancement unavailable', 422, 'ai_unavailable');
        }

        const prompt = [
            'You are evaluating a university candidate essay for admissions scoring.',
            `Track: ${track}`,
            `Essay word count: ${features.essayWordCount}`,
            `Baseline motivation: ${baseline.motivation.toFixed(3)}`,
            `Baseline leadership: ${baseline.leadership.toFixed(3)}`,
            `Baseline growth: ${baseline.growth.toFixed(3)}`,
            `Baseline readiness: ${baseline.readiness.toFixed(3)}`,
            'Return calibrated scores from 0 to 1 and concise factors.',
            'Essay:',
            intake.essay.text,
        ].join('\n');

        const { object } = await generateObject({
            model: openai(config.model),
            schema: AI_ANALYSIS_SCHEMA,
            prompt,
            temperature: 0.2,
            abortSignal: AbortSignal.timeout(config.openAiTimeoutMs),
        });

        return object;
    }

    async function scoreCandidateFromDocument(
        intake: IntakeDocument,
        candidateObjectId: ObjectId | null,
        trackInput?: Track,
    ): Promise<ScoringResult> {
        if (!intake.consent.dataProcessing) {
            throw new ScoringServiceError('Candidate has no data processing consent', 422, 'consent_required');
        }

        const track = trackInput ?? deriveTrackFromIntake(intake) ?? config.defaultTrack;
        const versions = candidateObjectId ? await getVersions(candidateObjectId) : [];
        const features = engineerFeatures(intake, versions);
        const baseline = buildBaselineSubscores(features);
        const baselineExplanation = buildBaselineExplanation(features);

        let degradedMode = false;
        let usedAiEnhancement = false;
        let aiAnalysis: AiEssayAnalysis | null = null;
        let aiFailureReason: string | null = null;

        try {
            aiAnalysis = await runAiEnhancement(intake, track, baseline, features);
            usedAiEnhancement = true;
        } catch (error) {
            degradedMode = true;
            aiFailureReason = error instanceof Error ? error.message : 'AI enhancement unavailable';
        }

        const subscores: Subscores = aiAnalysis
            ? {
                motivation: clampScore((baseline.motivation * (1 - config.aiInfluence)) + (aiAnalysis.motivation * config.aiInfluence)),
                leadership: clampScore((baseline.leadership * (1 - config.aiInfluence)) + (aiAnalysis.leadership * config.aiInfluence)),
                growth: clampScore((baseline.growth * (1 - config.aiInfluence)) + (aiAnalysis.growth * config.aiInfluence)),
                readiness: clampScore((baseline.readiness * (1 - config.aiInfluence)) + (aiAnalysis.readiness * config.aiInfluence)),
            }
            : baseline;

        const totalScore = weightedTotal(subscores, track);
        const confidence = confidenceFromFeatures(features, degradedMode);
        const recommendation = recommendationFromScore(totalScore, confidence);

        const explanation: ScoringExplanation = {
            factorsPlus: dedupeFactors([
                ...baselineExplanation.factorsPlus,
                ...(aiAnalysis?.factorsPlus ?? []),
            ]),
            factorsMinus: dedupeFactors([
                ...baselineExplanation.factorsMinus,
                ...(aiAnalysis?.factorsMinus ?? []),
            ]),
            notes: aiAnalysis
                ? aiAnalysis.notes
                : `${baselineExplanation.notes} AI enhancement fallback used: ${aiFailureReason ?? 'unknown reason'}.`,
        };

        const scoredAt = new Date();
        const candidateId = candidateObjectId?.toHexString() ?? new ObjectId().toHexString();

        const result: ScoringResult = {
            candidateId,
            totalScore,
            subscores,
            confidence,
            recommendation,
            explanation,
            metadata: {
                track,
                scoringVersion: config.scoringVersion,
                model: config.model,
                usedAiEnhancement,
                degradedMode,
                scoredAt: scoredAt.toISOString(),
            },
        };

        if (candidateObjectId) {
            await scoringCollection.updateOne(
                {
                    candidateId: candidateObjectId,
                    scoringVersion: config.scoringVersion,
                    track,
                },
                {
                    $set: {
                        totalScore,
                        subscores,
                        confidence,
                        recommendation,
                        explanation,
                        metadata: result.metadata,
                        features,
                        updatedAt: scoredAt,
                    },
                },
                { upsert: true },
            );
        }

        return result;
    }

    async function scoreCandidateById(candidateId: string, track?: Track): Promise<ScoringResult> {
        if (!ObjectId.isValid(candidateId)) {
            throw new ScoringServiceError('Invalid candidate id', 400, 'invalid_candidate_id');
        }

        const candidateObjectId = new ObjectId(candidateId);
        const intake = await intakeCollection.findOne({ _id: candidateObjectId });
        if (!intake) {
            throw new ScoringServiceError('Candidate not found', 404, 'candidate_not_found');
        }

        return scoreCandidateFromDocument(intake, candidateObjectId, track);
    }

    return {
        async run(input: RunScoringInput): Promise<ScoringResult> {
            if (!input.candidateId && !input.payload) {
                throw new ScoringServiceError('Either candidateId or payload is required', 400, 'invalid_input');
            }

            if (input.candidateId) {
                return scoreCandidateById(input.candidateId, input.track);
            }

            const intakePayload = input.payload as IntakeBody;
            const intakeDocument: IntakeDocument = {
                ...intakePayload,
                userId: 'payload',
                status: 'draft',
                completeness: 0,
                issues: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            return scoreCandidateFromDocument(intakeDocument, null, input.track);
        },

        async batch(input: BatchScoringInput): Promise<{
            results: BatchScoringResultItem[];
            processed: number;
            failures?: BatchScoringFailureItem[];
            cohortId?: string;
        }> {
            const hasCandidateIds = Array.isArray(input.candidateIds) && input.candidateIds.length > 0;
            const hasCohortId = typeof input.cohortId === 'string' && input.cohortId.length > 0;

            if (!hasCandidateIds && !hasCohortId) {
                throw new ScoringServiceError('candidateIds or cohortId is required', 400, 'invalid_input');
            }

            let candidateIds = input.candidateIds ?? [];

            if (hasCohortId) {
                const cohort = await cohortsCollection.findOne({ cohortId: input.cohortId as string });
                if (cohort?.candidateIds?.length) {
                    candidateIds = cohort.candidateIds;
                } else {
                    const fallbackIds = await intakeCollection.find({ cohortId: input.cohortId as string }).project({ _id: 1 }).toArray();
                    candidateIds = fallbackIds.map((item) => item._id?.toHexString()).filter((id): id is string => Boolean(id));
                }
            }

            if (candidateIds.length === 0) {
                throw new ScoringServiceError('No candidates found for scoring batch', 404, 'cohort_empty');
            }

            const uniqueCandidateIds = [...new Set(candidateIds)];
            const scored = await mapWithConcurrency(uniqueCandidateIds, config.batchConcurrency, async (candidateId) => {
                try {
                    const result = await scoreCandidateById(candidateId, input.track);
                    return {
                        ok: true as const,
                        candidateId: result.candidateId,
                        score: result.totalScore,
                        recommendation: result.recommendation,
                        confidence: result.confidence,
                        scoredAt: result.metadata.scoredAt,
                    };
                } catch (error) {
                    if (error instanceof ScoringServiceError) {
                        return {
                            ok: false as const,
                            candidateId,
                            message: error.message,
                            code: error.code,
                        };
                    }

                    return {
                        ok: false as const,
                        candidateId,
                        message: 'Internal scoring error',
                        code: 'unknown',
                    };
                }
            });

            const failures = scored
                .filter((item) => !item.ok)
                .map((item) => ({
                    candidateId: item.candidateId,
                    message: item.message,
                    code: item.code,
                }));

            const successfulScores = scored.filter((item) => item.ok);

            if (successfulScores.length === 0) {
                throw new ScoringServiceError('Failed to score all candidates in batch', 422, 'batch_failed');
            }

            const ranked = [...successfulScores].sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }

                if (b.confidence !== a.confidence) {
                    return b.confidence - a.confidence;
                }

                if (a.scoredAt !== b.scoredAt) {
                    return b.scoredAt.localeCompare(a.scoredAt);
                }

                return a.candidateId.localeCompare(b.candidateId);
            });

            const results: BatchScoringResultItem[] = ranked.map((item, index) => ({
                candidateId: item.candidateId,
                score: item.score,
                rank: index + 1,
                recommendation: item.recommendation,
                confidence: item.confidence,
            }));

            return {
                results,
                processed: results.length,
                ...(failures.length > 0 ? { failures } : {}),
                ...(hasCohortId ? { cohortId: input.cohortId } : {}),
            };
        },
    };
}

export type ScoringService = ReturnType<typeof createScoringService>;
